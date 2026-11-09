import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { after } from "next/server";
import { randomUUID } from "node:crypto";
import type { HubUser } from "../supabase/server";
import { canUse } from "../features";
import { converse, studioErrorMessage } from "../studio/claude";
import { getProfile } from "../scripts/data";
import { getConversation, pruneConversations, saveConversation, setUndo } from "./data";
import { type ToolContext, localDay, runTool, stepFor, toolSpec, toolsFor } from "./tools";
import type { Conversation, DwightMessage, PageContext } from "./types";

/* One turn with Dwight: your message is saved with a "working" reply, and
   the reply is written in the background (so the page can be left, or the
   panel closed) - what it's doing and what it has said so far are saved as
   it goes, for the panel to show. */

// A working reply that hasn't been saved for this long was cut off.
export const SILENT_MS = 120_000;
const HISTORY = 24;

const dateLong = (d = new Date()) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

async function systemPrompt(user: HubUser, name: string, page: PageContext) {
  const [studio, calendar, edits, scripts, todos] = await Promise.all(["studio", "calendar", "edits", "scripts", "todos"].map((f) => canUse(user, f as never)));
  const spelling = scripts ? (await getProfile(user).catch(() => null))?.spelling : null;
  const job = /^\/hub\/projects\/([0-9a-f-]{36})/.exec(page.path)?.[1];
  const routes = [
    "- /hub - home: to-dos, what's due, who you're waiting on",
    "- /hub/projects - every job (the board)",
    "- /hub/projects/{job id} - a job's page: details, brief, payment" + (scripts ? ", its scripts (#scripts), write one (#write-script)" : ""),
    studio &&
      "- /hub/projects/{job id}/studio?tab=week - make a shoot sheet (add &videos=N to fill in how many, up to 21); tabs: setup, week, edits, review, account",
    studio && "- /hub/studio - Studio home; /hub/studio/new-job - start a tech UGC job from its brief; /hub/studio/sheets/{sheet id} - a shoot sheet",
    calendar && "- /hub/studio/calendar - the Buffer calendar, gaps to fill, scheduling finished videos",
    edits && "- /hub/studio/edits - every edit on your Mac",
    scripts && "- /hub/scripts - scripts not tied to a job",
    "- /hub/account - account and settings",
  ].filter(Boolean);
  return [
    `You're ${name}, the helper built into Creator Desk - the back office ${user.name || "this creator"} uses to run their UGC work. You talk to them directly, as "you".`,
    `What's in Creator Desk: brand deals (a brand pays for videos: brief, deliverables, dates, fee, invoice, payment), tech UGC jobs (running accounts that post for an app, paid per video, with a number of videos a day)${todos ? ", to-dos" : ""}${studio ? ", shoot sheets made in Studio" : ""}${edits ? ", edits made on their Mac" : ""}${scripts ? ", scripts" : ""}${calendar ? " and their Buffer posting schedule" : ""}. Retainers are jobs that repeat each month.`,
    `Today is ${dateLong()}. They're on "${page.title}" (${page.path})${job ? `, the page of job ${job} - "this job" means that one` : ""}.`,
    `How you work:
- Look things up with your tools rather than guessing, and chain them as needed (find the job, then change it).
- Make the changes they ask for straight away. Every change is listed under your reply with an Undo button, so don't ask "shall I?" first. Ask only when you can't tell what they mean (which job, which date) or something you need is missing.
- Never make up details about a job or their work.
- You can't delete anything, post to Buffer or start things that use Claude credits (shoot sheets, scripts, setting a job up from its brief). For those, use show_buttons to give them a button to the right page, filled in where the link allows.
- Finish with show_buttons whenever there's somewhere useful to go next.
- Brand deal paid: paymentStatus Paid, paidOn (today unless they say otherwise), stage Paid.
- Keep replies short and plain: a line or two, then a short list or a small table if it helps. No headings. Dates like "29 Nov". Money with its currency symbol.${spelling ? ` ${spelling} spelling.` : ""}
- Your tools only see Creator Desk. If they ask about something outside it, say so.`,
    `Pages (for buttons):\n${routes.join("\n")}`,
  ].join("\n\n");
}

/** The conversation so far, as Claude reads it. */
function history(messages: DwightMessage[]): Anthropic.Beta.BetaMessageParam[] {
  const out: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of messages.slice(-HISTORY)) {
    if (m.status === "working") continue;
    const role = m.role === "you" ? "user" : "assistant";
    let text = m.text.trim() || "(nothing)";
    if (m.role === "dwight" && m.changes?.length) text += `\n\n(Changed: ${m.changes.join("; ")}${m.undone ? " - since undone" : ""})`;
    const last = out[out.length - 1];
    if (last?.role === role) last.content = `${last.content as string}\n\n${text}`;
    else out.push({ role, content: text });
  }
  while (out[0]?.role === "assistant") out.shift();
  return out;
}

/** Save your message and a working reply, then write the reply in the background. */
export async function ask(user: HubUser, name: string, input: { conversationId?: string; text: string; page: PageContext }) {
  const now = new Date().toISOString();
  const found = input.conversationId ? await getConversation(user.id, input.conversationId) : null;
  const convo: Conversation = found ?? {
    id: input.conversationId ?? randomUUID(),
    title: input.text.trim().slice(0, 60),
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  if (convo.messages.some((m) => m.status === "working" && Date.now() - Date.parse(convo.updatedAt) < SILENT_MS))
    throw new Error(`${name}'s still on the last one - give it a moment.`);
  const reply: DwightMessage = { id: randomUUID(), role: "dwight", text: "", at: now, status: "working", steps: [] };
  convo.messages.push({ id: randomUUID(), role: "you", text: input.text.trim(), at: now, page: input.page.path }, reply);
  convo.updatedAt = now;
  await saveConversation(user.id, convo);
  if (!found) await pruneConversations(user.id);
  after(() => work(user, name, convo, reply, input.page));
  return convo;
}

async function work(user: HubUser, name: string, convo: Conversation, reply: DwightMessage, page: PageContext) {
  let saving: Promise<void> = Promise.resolve();
  let lastSave = 0;
  const save = (force = false) => {
    if (!force && Date.now() - lastSave < 1200) return;
    lastSave = Date.now();
    convo.updatedAt = new Date().toISOString();
    const copy = JSON.parse(JSON.stringify(convo)) as Conversation;
    saving = saving.then(() => saveConversation(user.id, copy)).catch((e) => console.error("Creator Desk Dwight save:", e));
  };
  const beat = setInterval(() => save(true), 20_000);
  const ctx: ToolContext = { user, today: localDay(), changes: [], links: [], undo: { jobs: [], todos: [] }, jobsTouched: new Set(), todosTouched: false };
  try {
    const tools = await toolsFor(user);
    const text = await converse({
      system: await systemPrompt(user, name, page),
      messages: history(convo.messages.slice(0, -1)),
      tools: tools.map(toolSpec),
      webFetch: true,
      runTool: (tool, input) => runTool(tools, ctx, tool, input),
      onTool: (tool) => {
        const step = stepFor(tools, tool);
        if (step && reply.steps?.at(-1) !== step) reply.steps?.push(step);
        reply.text = "";
        save(true);
      },
      onAside: (said) => {
        reply.steps?.push(said.length > 160 ? `${said.slice(0, 157)}…` : said);
      },
      onText: (said) => {
        reply.text = said;
        save();
      },
    });
    reply.text = text;
    reply.status = "done";
  } catch (e) {
    console.error("Creator Desk Dwight:", e);
    reply.status = "failed";
    reply.text = studioErrorMessage(e);
  } finally {
    clearInterval(beat);
  }
  if (ctx.changes.length) {
    reply.changes = ctx.changes;
    await setUndo(user.id, { conversationId: convo.id, messageId: reply.id, ...ctx.undo });
  }
  if (ctx.links.length) reply.links = ctx.links;
  reply.touched = { jobs: [...ctx.jobsTouched], todos: ctx.todosTouched };
  await saving;
  save(true);
  await saving;
}
