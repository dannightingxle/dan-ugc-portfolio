import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { adminClient } from "../supabase/admin";
import type { HubUser } from "../supabase/server";
import { StudioError, ask } from "./claude";
import { getWorkspace, saveSheet, saveWorkspace } from "./data";
import { SYSTEM_INTAKE, SYSTEM_REVIEW, SYSTEM_SHEET, SYSTEM_SHEET_TEMPLATE } from "./prompts";
import { CustomSheetResult, FILES, IntakeResult, ReviewResult, SheetResult, type SheetData, type Workspace } from "./types";
import { type CustomSheet, fillTemplate, readTemplateData, weekDataBlock } from "./custom-template";
import { linkedPagesText, otherLinks, readLinkedPages } from "./linked-pages";
import { canUse } from "../features";
import { createEdit } from "../edits/data";
import { WHOLE_SHEET, briefForWholeSheet, briefFromSheet } from "../edits/types";

/* The three things Studio asks Claude to do for a job: set it up from the
   material, make the week's shoot sheet, and run the Friday review. Each one
   reads the job's workspace and writes the results straight back into it. */

export type Upload = { name: string; type: string; data: string };

/** The job's name and basics, from the tracker (hub_projects). */
async function projectBasics(userId: string, projectId: string) {
  const { data } = await adminClient().from("hub_projects").select("data").eq("user_id", userId).eq("id", projectId).maybeSingle<{ data: Record<string, unknown> }>();
  const p = data?.data ?? {};
  const s = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");
  return { brand: s("brand") || "this job", title: s("title"), notes: s("notes") };
}

/** Everything Claude knows about the job: like a Claude Project's instructions + files. */
function workspaceContext(name: string, ws: Workspace) {
  const parts = [`# Job: ${name}`, "## Project instructions", ws.instructions || "(not set up yet)"];
  for (const f of FILES) parts.push(`## File: ${f.label.toLowerCase().replace(" ", "-")}`, ws.files[f.key].trim() || "(empty)");
  if (ws.account.handles) parts.push("## Accounts", ws.account.handles);
  return parts.join("\n\n");
}

function uploadsToBlocks(uploads: Upload[]): Anthropic.Beta.BetaContentBlockParam[] {
  return uploads.flatMap((u): Anthropic.Beta.BetaContentBlockParam[] => {
    if (u.type === "application/pdf") return [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: u.data }, title: u.name }];
    if (u.type === "image/png" || u.type === "image/jpeg" || u.type === "image/webp" || u.type === "image/gif") {
      return [{ type: "image", source: { type: "base64", media_type: u.type, data: u.data } }];
    }
    return [];
  });
}

const today = () => new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/* ---- Set up a job ---- */

export async function setUpJob(user: HubUser, projectId: string, input: { material: string; filming: string; voice: string; uploads: Upload[] }) {
  const job = await projectBasics(user.id, projectId);
  // Public Notion pages and Google Docs are read here (Claude's web fetch only sees their loading screen).
  const linked = await readLinkedPages(input.material);
  const material = [input.material, linkedPagesText(linked.pages)].filter(Boolean).join("\n\n");
  const rest = otherLinks(input.material, linked.pages);
  const result = await ask({
    system: SYSTEM_INTAKE,
    content: [
      ...uploadsToBlocks(input.uploads),
      {
        type: "text",
        text: [
          `New job: ${job.brand}${job.title ? ` - ${job.title}` : ""}. Today is ${today()}.`,
          `Everything I have on it:\n${material || "(see the attached files)"}`,
          job.notes && `My notes from the tracker:\n${job.notes}`,
          `How I film: ${input.filming || "solo, phone on a tripod, at home and around town, second phone for app shots"}.`,
          `My voice: ${input.voice || "casual, direct, a bit dry"}.`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    schema: IntakeResult,
    webFetch: rest.length > 0,
    effort: "high",
  });
  const ws = await getWorkspace(user.id, projectId);
  return saveWorkspace(user.id, projectId, {
    ...ws,
    instructions: result.instructions,
    files: { ...ws.files, brief: result.brief, appNotes: result.appNotes, references: result.references || ws.files.references },
    clientQuestions: result.clientQuestions,
    needsDan: result.needsDan,
    couldntOpen: [...new Set([...linked.failed, ...result.couldntOpen])],
  });
}

/* ---- This week's shoot sheet ---- */

export async function makeShootSheet(
  user: HubUser,
  projectId: string,
  input: { videos: number; filmingOn: string; lastWeek: string; trending: string; weekBrief: string; uploads: Upload[] },
) {
  const job = await projectBasics(user.id, projectId);
  let ws = await getWorkspace(user.id, projectId);
  // This week's brief from the brand is for this sheet only: the project brief (Files tab) never changes here.
  // Public Notion pages and Google Docs in it are read here and sent with it.
  const linked = await readLinkedPages(input.weekBrief);
  const rest = otherLinks(input.weekBrief, linked.pages);
  const weekBrief = [input.weekBrief.trim(), linkedPagesText(linked.pages)].filter(Boolean).join("\n\n");

  const ask_ = weekBrief
    ? `Here's this week's brief from the brand, for this week's videos (the project brief file still applies)${rest.length ? " - open its links for the full details" : ""}. Pull out the formats, deliverables, deadlines and must-haves, flag anything unclear in prep, then give me the shoot sheet with ${input.videos} videos.\n\n<this_weeks_brief>\n${weekBrief}\n</this_weeks_brief>`
    : `I need this week's content: ${input.videos} videos.`;
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...uploadsToBlocks(input.uploads),
    {
      type: "text",
      text: [
        ask_,
        // Web fetch opens links that are in the request itself.
        rest.length > 0 && `Links in this week's brief: ${rest.join(" ")}`,
        `Today is ${today()}. Filming: ${input.filmingOn || "Monday, Wednesday and Thursday afternoons"}.`,
        input.lastWeek && `How last week went: ${input.lastWeek}`,
        input.trending && `Doing well in the niche right now - adapt these for the app:\n${input.trending}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  // The job's own template (from its Claude Project) when it has one, else the Creator Desk sheet.
  const block = ws.template ? weekDataBlock(ws.template) : null;
  let sheet: SheetData | CustomSheet;
  let title: string, scriptBankEntry: string, oneLine: string, couldntOpen: string[];
  if (block) {
    const result = await ask({
      system: SYSTEM_SHEET_TEMPLATE,
      context: workspaceContext(job.brand, ws),
      content: [
        ...content,
        { type: "text", text: `The template's WEEK DATA block (constants: ${block.names.join(", ")}):\n\n${block.source}\n\nAnd its header, with the text to fill in brackets:\n${headerOf(ws.template)}` },
      ],
      schema: CustomSheetResult,
      webFetch: rest.length > 0,
      effort: "medium",
    });
    const read = readTemplateData(result.dataJson, block.names);
    if ("error" in read) throw new StudioError(read.error);
    const header = { title: result.title, kicker: result.kicker, h1: result.h1, summary: result.summary };
    sheet = { ...read.data, videos: read.data.videos as CustomSheet["videos"], custom: { html: fillTemplate(ws.template, header, read.data), header } };
    ({ scriptBankEntry, oneLine, couldntOpen } = result);
    title = `${result.h1} · ${date}`;
  } else {
    const result = await ask({ system: SYSTEM_SHEET, context: workspaceContext(job.brand, ws), content, schema: SheetResult, webFetch: rest.length > 0, effort: "medium" });
    sheet = result.sheet;
    ({ scriptBankEntry, oneLine, couldntOpen } = result);
    title = `${result.sheet.h1} · ${date}`;
  }

  // This week's brief is kept with the sheet it was for.
  const id = await saveSheet(user.id, projectId, title, weekBrief ? { ...sheet, weekBrief } : sheet);
  // Newest first, so the next sheet sees what's already been made.
  const entry = `## ${title}\n${scriptBankEntry.trim()}`;
  ws = await saveWorkspace(user.id, projectId, { ...ws, files: { ...ws.files, scriptBank: [entry, ws.files.scriptBank.trim()].filter(Boolean).join("\n\n") } });
  await makeEditCards(user, projectId, id, title, sheet);
  return { id, oneLine, couldntOpen: [...new Set([...linked.failed, ...couldntOpen])], workspace: ws };
}

/** The template's header markup, so Claude can see the bracketed text to fill. */
function headerOf(html: string) {
  return /<header class="page">[\s\S]*?<\/header>/i.exec(html)?.[0] ?? "(no header)";
}

/* ---- Friday review ---- */

export async function fridayReview(user: HubUser, projectId: string, input: { numbers: string; uploads: Upload[] }) {
  const job = await projectBasics(user.id, projectId);
  const ws = await getWorkspace(user.id, projectId);
  const result = await ask({
    system: SYSTEM_REVIEW,
    context: workspaceContext(job.brand, ws),
    content: [
      ...uploadsToBlocks(input.uploads),
      { type: "text", text: `Here are this week's numbers${input.uploads.length ? " (screenshots attached)" : ""}. Today is ${today()}.\n\n${input.numbers || ""}`.trim() },
    ],
    schema: ReviewResult,
    effort: "medium",
  });
  return saveWorkspace(user.id, projectId, {
    ...ws,
    files: { ...ws.files, winners: result.winners },
    lastReview: { at: new Date().toISOString(), moreOf: result.moreOf, lessOf: result.lessOf, nextWeek: result.nextWeek },
  });
}

/** With Edits on, a new shoot sheet comes with its edit cards ready: one for the whole week, then one per video. */
async function makeEditCards(user: HubUser, projectId: string, sheetId: string, title: string, sheet: SheetData | CustomSheet) {
  if (!(await canUse(user, "edits"))) return;
  try {
    await createEdit(user.id, { projectId, sheetId, videoCode: WHOLE_SHEET, title: `${title} - all ${sheet.videos.length} videos`, brief: briefForWholeSheet(sheet) });
    for (const v of sheet.videos) await createEdit(user.id, { projectId, sheetId, videoCode: String(v.code), title: String(v.title ?? ""), brief: briefFromSheet(sheet, String(v.code)) });
  } catch (e) {
    // The sheet itself is fine; cards can still be made from the Edits tab.
    console.error("Creator Desk: couldn't make edit cards", e);
  }
}
