import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { adminClient } from "../supabase/admin";
import type { HubUser } from "../supabase/server";
import { canUse } from "../features";
import { CURRENCIES } from "../currencies";
import { getTodos, saveTodos } from "../todos/data";
import { ask } from "./claude";
import { getWorkspace, saveWorkspace } from "./data";
import { workspaceContext } from "./jobs";
import { linkedPagesText, otherLinks, readLinkedPages } from "./linked-pages";
import { addSetupTodos } from "./new-job";
import { SYSTEM_ASSIST } from "./prompts";
import type { Progress } from "./tasks";
import type { Workspace } from "./types";
import { cleanLink, readWebPages } from "./web-pages";

/* The job assistant: a chat on a job's Studio that can see the whole job and
   change it - answer what set up left open, take in an email or a rate, fix
   the instructions. Each answer lists what it changed, and the latest change
   can be undone. Kept in hub_workspaces as "assist:<job>". */

export type AssistMessage = { id: string; role: "you" | "claude"; text: string; at: string; changes?: string[]; canUndo?: boolean; failed?: boolean };
type Project = Record<string, unknown> & { brand?: string; contact?: Record<string, string> };
type Stored = { messages: AssistMessage[]; undo?: { messageId: string; workspace: Workspace; project: Project | null; todoIds: string[] } };

const row = (projectId: string) => `assist:${projectId}`;
const MAX_MESSAGES = 60;
// What the conversation so far sends to Claude.
const HISTORY = 20;

async function load(userId: string, projectId: string): Promise<Stored> {
  const { data } = await adminClient().from("hub_workspaces").select("data").eq("user_id", userId).eq("project_id", row(projectId)).maybeSingle<{ data: Stored }>();
  return data?.data ?? { messages: [] };
}
async function store(userId: string, projectId: string, s: Stored) {
  const { error } = await adminClient()
    .from("hub_workspaces")
    .upsert({ user_id: userId, project_id: row(projectId), data: { ...s, messages: s.messages.slice(-MAX_MESSAGES) }, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/** The conversation, with Undo offered on the latest change only. */
export async function assistChat(userId: string, projectId: string): Promise<AssistMessage[]> {
  const s = await load(userId, projectId);
  return s.messages.map((m) => ({ ...m, canUndo: m.id === s.undo?.messageId }));
}

export async function addYourMessage(userId: string, projectId: string, text: string) {
  const s = await load(userId, projectId);
  s.messages.push({ id: randomUUID(), role: "you", text: text.trim(), at: new Date().toISOString() });
  await store(userId, projectId, s);
}

const Result = z.object({
  reply: z.string(),
  instructions: z.string().nullable().describe("The project instructions in full with your edits, or null to leave them as they are."),
  brief: z.string().nullable().describe("The brief in full with your edits, or null."),
  appNotes: z.string().nullable().describe("The app notes in full with your edits, or null."),
  references: z.string().nullable().describe("The references in full with your edits, or null."),
  answeredQuestions: z.array(z.string()).describe("Questions for the client, copied exactly, that are now answered or no longer needed."),
  newQuestions: z.array(z.string()).describe("New questions for the client, ready to paste. Usually none."),
  settledDefaults: z.array(z.string()).describe("Defaults to check, copied exactly, that are now confirmed or settled."),
  job: z
    .object({
      brand: z.string().nullable(),
      title: z.string().nullable(),
      platform: z.string().nullable(),
      payModel: z.string().nullable(),
      perVideo: z.number().nullable(),
      currency: z.enum(CURRENCIES).nullable(),
      videosPerDay: z.number().nullable(),
      contactName: z.string().nullable(),
      contactEmail: z.string().nullable(),
    })
    .describe("Changes to the job's details in his tracker; null for each one to leave as it is."),
  todos: z.array(z.object({ text: z.string(), dayOffset: z.number().int().nullable() })),
  handles: z.string().nullable().describe("The Account tab's handles in full (one per line, e.g. 'TikTok @name'), if his message sets them; else null."),
  filmingOn: z.string().nullable().describe("When he films this job's videos, if his message changes it; else null."),
});

const FILE_LABEL = { instructions: "Project instructions", brief: "Brief", appNotes: "App notes", references: "References" } as const;
const same = (a: string, b: string) => a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");

/** Claude answers the latest message and makes the changes it calls for; its answer goes in the conversation. */
export async function runAssist(user: HubUser, projectId: string, tab: string, progress: Progress) {
  const s = await load(user.id, projectId);
  const latest = s.messages.at(-1);
  if (!latest || latest.role !== "you") return;
  const db = adminClient();
  const ws = await getWorkspace(user.id, projectId);
  const { data: proj } = await db.from("hub_projects").select("data").eq("user_id", user.id).eq("id", projectId).maybeSingle<{ data: Project }>();
  const project = proj?.data ?? null;
  const brand = String(project?.brand ?? "this job");

  // Links in his message (a Notion page, a site) are read for Claude.
  progress("Reading what you sent");
  const linked = await readLinkedPages(latest.text);
  const web = await readWebPages(otherLinks(latest.text, linked.pages).map(cleanLink));
  const pages = [...linked.pages, ...web.pages];

  const p = project ?? {};
  const contact = (p.contact ?? {}) as Record<string, string>;
  const details = [
    ["Brand", p.brand],
    ["Title", p.title],
    ["Stage", p.techStage || p.stage],
    ["Platform", p.platform],
    ["Pay", p.perVideo != null ? `${p.perVideo} ${p.currency ?? ""} a video` : p.fee != null ? `${p.fee} ${p.feeCurrency ?? ""}` : ""],
    ["Pay model", p.payModel],
    ["Videos a day", p.videosPerDay],
    ["Contact", [contact.name, contact.email].filter(Boolean).join(", ")],
  ]
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  const history = s.messages.slice(0, -1).slice(-HISTORY);
  progress("Claude is reading the job");
  const result = await ask({
    system: SYSTEM_ASSIST,
    context: workspaceContext(brand, ws),
    content: [
      {
        type: "text",
        text: [
          `The job's details in Dan's tracker:\n${details || "(none yet)"}`,
          ws.clientQuestions.length > 0 && `Questions for the client:\n${ws.clientQuestions.map((q) => `- ${q}`).join("\n")}`,
          ws.needsDan.length > 0 && `Defaults to check (assumed at set up):\n${ws.needsDan.map((q) => `- ${q}`).join("\n")}`,
          ws.couldntOpen.length > 0 && `Links set up couldn't open:\n${ws.couldntOpen.map((q) => `- ${q}`).join("\n")}`,
          ws.account.handles.trim() && `Account tab handles:\n${ws.account.handles}`,
          `Today is ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}. Dan is on the job's ${tab || "Studio"} tab.`,
          history.length > 0 && `Our conversation so far:\n${history.map((m) => `${m.role === "you" ? "Dan" : "You"}: ${m.text}`).join("\n\n")}`,
          `Dan:\n${latest.text}`,
          pages.length > 0 && `Pages linked in his message, read for you:\n\n${linkedPagesText(pages)}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    schema: Result,
    effort: "medium",
  });

  // ---- Apply it, keeping what's needed to undo it.
  progress("Making the changes");
  const changes: string[] = [];
  const next: Workspace = { ...ws, files: { ...ws.files }, account: { ...ws.account } };
  for (const key of ["instructions", "brief", "appNotes", "references"] as const) {
    const v = result[key];
    const old = key === "instructions" ? ws.instructions : ws.files[key];
    if (v == null || v.trim() === old.trim()) continue;
    // A rewrite that loses most of a long file is a slip, not an edit: it's left as it was.
    if (old.length > 600 && v.length < old.length * 0.5) {
      changes.push(`Left the ${FILE_LABEL[key].toLowerCase()} as they were (the rewrite dropped too much)`);
      continue;
    }
    if (key === "instructions") next.instructions = v;
    else next.files[key] = v;
    changes.push(FILE_LABEL[key]);
  }
  const answered = ws.clientQuestions.filter((q) => result.answeredQuestions.some((a) => same(a, q)));
  next.clientQuestions = [...ws.clientQuestions.filter((q) => !answered.includes(q)), ...result.newQuestions.filter((q) => q.trim() && !ws.clientQuestions.some((x) => same(x, q)))];
  if (answered.length) changes.push(answered.length === 1 ? "1 client question answered" : `${answered.length} client questions answered`);
  if (next.clientQuestions.length > ws.clientQuestions.length - answered.length) changes.push("New questions for the client");
  const settled = ws.needsDan.filter((q) => result.settledDefaults.some((a) => same(a, q)));
  next.needsDan = ws.needsDan.filter((q) => !settled.includes(q));
  if (settled.length) changes.push(settled.length === 1 ? "1 default settled" : `${settled.length} defaults settled`);
  if (result.handles != null && result.handles.trim() !== ws.account.handles.trim()) {
    next.account.handles = result.handles.trim();
    changes.push("Account handles");
  }
  if (result.filmingOn != null && result.filmingOn.trim() !== ws.filmingOn.trim()) {
    next.filmingOn = result.filmingOn.trim();
    changes.push("Filming days");
  }
  const wsChanged = JSON.stringify(next) !== JSON.stringify(ws);
  if (wsChanged) await saveWorkspace(user.id, projectId, next);

  // The tracker: what his message gave or changed.
  let projectChanged = false;
  if (project) {
    const j = result.job;
    const patched: Project = { ...project, contact: { name: "", role: "", company: "", email: "", phone: "", handle: "", ...(project.contact ?? {}) } };
    const labels: string[] = [];
    const set = (key: string, v: unknown, label: string) => {
      if (v == null || (typeof v === "string" && !v.trim()) || project[key] === v) return;
      patched[key] = typeof v === "string" ? v.trim() : v;
      labels.push(label);
    };
    set("brand", j.brand, "name");
    set("title", j.title, "title");
    set("platform", j.platform, "platform");
    set("payModel", j.payModel, "pay model");
    set("perVideo", j.perVideo, "pay per video");
    set("currency", j.currency, "currency");
    set("videosPerDay", j.videosPerDay, "videos a day");
    const c = patched.contact as Record<string, string>;
    if (j.contactName?.trim() && c.name !== j.contactName.trim()) c.name = j.contactName.trim();
    if (j.contactEmail?.trim() && c.email !== j.contactEmail.trim()) c.email = j.contactEmail.trim();
    if (JSON.stringify(c) !== JSON.stringify({ name: "", role: "", company: "", email: "", phone: "", handle: "", ...(project.contact ?? {}) })) labels.push("contact");
    if (labels.length) {
      await db.from("hub_projects").update({ data: patched, updated_at: new Date().toISOString() }).eq("user_id", user.id).eq("id", projectId);
      changes.push(`Job details: ${labels.join(", ")}`);
      projectChanged = true;
    }
  }
  const todos = (await canUse(user, "todos")) ? await addSetupTodos(user.id, projectId, result.todos) : [];
  if (todos.length) changes.push(todos.length === 1 ? "1 to-do added" : `${todos.length} to-dos added`);

  const reply: AssistMessage = { id: randomUUID(), role: "claude", text: result.reply.trim() || "Done.", at: new Date().toISOString(), ...(changes.length && { changes }) };
  const after = await load(user.id, projectId);
  after.messages.push(reply);
  if (wsChanged || projectChanged || todos.length) after.undo = { messageId: reply.id, workspace: ws, project: projectChanged ? project : null, todoIds: todos.map((t) => t.id) };
  await store(user.id, projectId, after);
}

/** When Claude couldn't answer: say so in the conversation, so it isn't left waiting. */
export async function assistFailed(userId: string, projectId: string, message: string) {
  const s = await load(userId, projectId);
  s.messages.push({ id: randomUUID(), role: "claude", text: message, at: new Date().toISOString(), failed: true });
  await store(userId, projectId, s);
}

/** Put back what the latest answer changed: the job's files and lists, its details and the to-dos it added. */
export async function undoAssist(userId: string, projectId: string, messageId: string) {
  const s = await load(userId, projectId);
  if (!s.undo || s.undo.messageId !== messageId) return false;
  const { workspace, project, todoIds } = s.undo;
  await saveWorkspace(userId, projectId, workspace);
  if (project) await adminClient().from("hub_projects").update({ data: project, updated_at: new Date().toISOString() }).eq("user_id", userId).eq("id", projectId);
  if (todoIds.length) {
    const todos = await getTodos(userId);
    await saveTodos(userId, todos.filter((t) => !todoIds.includes(t.id)));
  }
  const m = s.messages.find((x) => x.id === messageId);
  if (m) m.changes = [...(m.changes ?? []), "Undone"];
  s.undo = undefined;
  await store(userId, projectId, s);
  return true;
}
