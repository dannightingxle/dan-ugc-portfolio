import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { adminClient } from "../supabase/admin";
import type { HubUser } from "../supabase/server";
import { StudioError, ask } from "./claude";
import { getSheet, getWorkspace, saveSheet, saveWorkspace, updateSheet } from "./data";
import { SYSTEM_INTAKE, SYSTEM_REVIEW, SYSTEM_SHEET, SYSTEM_SHEET_TEMPLATE } from "./prompts";
import { CustomSheetResult, FILES, IntakeResult, ReviewResult, SheetResult, type SheetData, type Workspace } from "./types";
import { type CustomSheet, fillTemplate, readTemplateData, weekDataBlock } from "./custom-template";
import { couldntOpenOnce, imageBlocks, linkedPagesText, otherLinks, readLinkedPages } from "./linked-pages";
import { socialVideoKind, videoBlocks, watchVideos } from "./videos";
import { readOnMac } from "../edits/mac-reads";
import { type Unread, type WebPages, cleanLink, readWebPages } from "./web-pages";
import type { Progress } from "./tasks";
import type { LinkedPages } from "./linked-pages";
import { canUse } from "../features";
import { createEdit, deleteEdit, listEdits, updateEdit } from "../edits/data";
import type { SheetChat, WeekInput } from "./chats";
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

/** Other links: ordinary public pages are read here; ones that need a login (or won't load here) are read in your own
    browser through your Mac's helper when it's running; anything left is for Claude's web fetch, with why it wasn't read. */
async function readOtherLinks(userId: string, text: string, linked: LinkedPages, progress: Progress) {
  const rest = otherLinks(text, linked.pages).map(cleanLink);
  const web = await readWebPages(rest.filter((u) => !socialVideoKind(u)));
  linked.pages.push(...web.pages);
  const read = new Set(web.pages.map((p) => p.url));
  let unread = web.unread;
  let failed: string[] = [];
  if (unread.length) progress("Checking for pages to read on your Mac");
  const mac = await readOnMac(userId, unread.map((u) => u.url)).catch(() => null);
  if (mac) {
    linked.pages.push(...mac.pages);
    mac.read.forEach((u) => read.add(u));
    failed = mac.failed;
    // The Mac's own reason is shown for the ones it couldn't read either.
    unread = unread.filter((u) => !mac.read.has(u.url) && !mac.failed.some((f) => f.startsWith(`${u.url} `)));
  }
  return { rest: [...new Set(rest)].filter((u) => !read.has(u)), failed, unread };
}

/** For Claude: links Creator Desk couldn't read itself, and why, to try with web fetch. */
function unreadLine(unread: Unread[], where: string) {
  return (
    unread.length > 0 &&
    `Links ${where} that Creator Desk couldn't read for you (open them with web fetch if you need them; if you can't either, list them in couldntOpen with this reason):\n${unread.map((u) => `- ${u.url} - ${u.why}`).join("\n")}`
  );
}

// Pages linked in the job's notes: how many are read for each sheet, and how much of each.
const NOTES_PAGES = 4;
const NOTES_PAGE_CHARS = 15_000;

/** Web pages linked in the job's brief and app notes (the app's site, case studies), read so Claude has them as text. */
async function readNotesPages(ws: Workspace, already: string[], progress: Progress): Promise<WebPages> {
  const links = [...new Set(otherLinks([ws.files.brief, ws.files.appNotes].join("\n"), []).map(cleanLink))]
    .filter((u) => !socialVideoKind(u) && !already.includes(u))
    .slice(0, NOTES_PAGES);
  if (!links.length) return { pages: [], unread: [] };
  progress("Reading the pages in the job's notes");
  return readWebPages(links, NOTES_PAGE_CHARS);
}

/** The job's notes' pages for Claude, as read just now. */
function notesText(notes: WebPages) {
  return [
    notes.pages.length > 0 && `Pages linked in the job's notes, read for you just now (no need to open them again):\n\n${linkedPagesText(notes.pages)}`,
    unreadLine(notes.unread, "in the job's notes"),
  ];
}

const today = () => new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/* ---- Set up a job ---- */

export async function setUpJob(user: HubUser, projectId: string, input: { material: string; filming: string; voice: string; uploads: Upload[] }, progress: Progress = () => {}) {
  const job = await projectBasics(user.id, projectId);
  // Public Notion pages and Google Docs are read here (Claude's web fetch only sees their loading screen).
  progress("Reading the linked pages");
  const linked = await readLinkedPages(input.material);
  const { rest, failed: macFailed, unread } = await readOtherLinks(user.id, input.material, linked, progress);
  progress("Watching the reference videos");
  // Reference videos (uploaded to those pages, or TikTok / Instagram links) as frames Claude can look at.
  const watched = await watchVideos(input.material, linked.pages);
  const material = [input.material, linkedPagesText(linked.pages)].filter(Boolean).join("\n\n");
  progress("Claude is setting up the job");
  const result = await ask({
    system: SYSTEM_INTAKE,
    content: [
      ...uploadsToBlocks(input.uploads),
      ...imageBlocks(linked.images),
      ...videoBlocks(watched),
      {
        type: "text",
        text: [
          `New job: ${job.brand}${job.title ? ` - ${job.title}` : ""}. Today is ${today()}.`,
          `Everything I have on it:\n${material || "(see the attached files)"}`,
          job.notes && `My notes from the tracker:\n${job.notes}`,
          `How I film: ${input.filming || "solo, phone on a tripod, at home and around town, second phone for app shots"}.`,
          `My voice: ${input.voice || "casual, direct, a bit dry"}.`,
          unreadLine(unread, "in the material"),
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    schema: IntakeResult,
    webFetch: rest.length > 0,
    effort: "high",
    onFixUp: () => progress("Claude is fixing its answer"),
  });
  const ws = await getWorkspace(user.id, projectId);
  return saveWorkspace(user.id, projectId, {
    ...ws,
    instructions: result.instructions,
    files: { ...ws.files, brief: result.brief, appNotes: result.appNotes, references: result.references || ws.files.references },
    clientQuestions: result.clientQuestions,
    needsDan: result.needsDan,
    couldntOpen: couldntOpenOnce(linked.failed, macFailed, watched.failed, result.couldntOpen),
  });
}

/* ---- This week's shoot sheet ---- */

/** A brief's links read for Claude: public pages, pages on your Mac, and reference videos. */
async function readBrief(userId: string, text: string, alsoWatch: string, progress: Progress) {
  progress("Reading the linked pages");
  const linked = await readLinkedPages(text);
  const { rest, failed: macFailed, unread } = await readOtherLinks(userId, text, linked, progress);
  // Reference videos in the brief (or what's trending), as frames Claude can look at.
  progress("Watching the reference videos");
  const watched = await watchVideos([text, alsoWatch].join("\n"), linked.pages);
  return { linked, rest, unread, watched, failed: [...linked.failed, ...macFailed, ...watched.failed] };
}

/** Claude writes the sheet: in the job's own template (from its Claude Project) when it has one, else the Creator Desk sheet. */
async function writeSheet(brand: string, ws: Workspace, content: Anthropic.Beta.BetaContentBlockParam[], webFetch: boolean, date: string, progress: Progress) {
  progress("Claude is writing the sheet");
  const block = ws.template ? weekDataBlock(ws.template) : null;
  const onFixUp = () => progress("Claude is fixing its answer");
  if (block) {
    const result = await ask({
      system: SYSTEM_SHEET_TEMPLATE,
      context: workspaceContext(brand, ws),
      content: [
        ...content,
        { type: "text", text: `The template's WEEK DATA block (constants: ${block.names.join(", ")}):\n\n${block.source}\n\nAnd its header, with the text to fill in brackets:\n${headerOf(ws.template)}` },
      ],
      schema: CustomSheetResult,
      webFetch,
      effort: "medium",
      onFixUp,
    });
    const read = readTemplateData(result.dataJson, block.names);
    if ("error" in read) throw new StudioError(read.error);
    const header = { title: result.title, kicker: result.kicker, h1: result.h1, summary: result.summary };
    const sheet: CustomSheet = { ...read.data, videos: read.data.videos as CustomSheet["videos"], custom: { html: fillTemplate(ws.template, header, read.data), header } };
    return { sheet, title: `${result.h1} · ${date}`, scriptBankEntry: result.scriptBankEntry, oneLine: result.oneLine, couldntOpen: result.couldntOpen };
  }
  const result = await ask({ system: SYSTEM_SHEET, context: workspaceContext(brand, ws), content, schema: SheetResult, webFetch, effort: "medium", onFixUp });
  return { sheet: result.sheet as SheetData | CustomSheet, title: `${result.sheet.h1} · ${date}`, scriptBankEntry: result.scriptBankEntry, oneLine: result.oneLine, couldntOpen: result.couldntOpen };
}

/** Put a sheet's hooks in the script bank, newest first (so the next sheet sees what's already been made), in place of its old ones. */
async function bankHooks(userId: string, projectId: string, ws: Workspace, title: string, hooks: string, replacing?: string) {
  const entry = `## ${title}\n${hooks.trim()}`;
  const bank = ws.files.scriptBank.trim();
  const rest = replacing && bank.includes(replacing) ? bank.replace(replacing, "").replace(/\n{3,}/g, "\n\n").trim() : bank;
  await saveWorkspace(userId, projectId, { ...ws, files: { ...ws.files, scriptBank: [entry, rest].filter(Boolean).join("\n\n") } });
  return entry;
}

export async function makeShootSheet(user: HubUser, projectId: string, input: WeekInput & { followUps?: string[] }, progress: Progress = () => {}) {
  const job = await projectBasics(user.id, projectId);
  const ws = await getWorkspace(user.id, projectId);
  // This week's brief from the brand is for this sheet only: the project brief (Files tab) never changes here.
  // Public Notion pages and Google Docs in it are read here and sent with it.
  const followUps = (input.followUps ?? []).join("\n\n");
  const read = await readBrief(user.id, [input.weekBrief, followUps].join("\n"), input.trending, progress);
  const notes = await readNotesPages(ws, [...read.linked.pages.map((p) => p.url), ...read.rest], progress);
  const weekBrief = [input.weekBrief.trim(), linkedPagesText(read.linked.pages)].filter(Boolean).join("\n\n");

  const ask_ = weekBrief
    ? `Here's this week's brief from the brand, for this week's videos (the project brief file still applies)${read.rest.length ? " - open its links for the full details" : ""}. Pull out the formats, deliverables, deadlines and must-haves, flag anything unclear in prep, then give me the shoot sheet with ${input.videos} videos.\n\n<this_weeks_brief>\n${weekBrief}\n</this_weeks_brief>`
    : `I need this week's content: ${input.videos} videos.`;
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...uploadsToBlocks(input.uploads),
    // Images from the linked pages (market cards, photos) so Claude can see them, not just their names.
    ...imageBlocks(read.linked.images),
    ...videoBlocks(read.watched),
    {
      type: "text",
      text: [
        ask_,
        // Web fetch opens links that are in the request itself.
        read.rest.length > 0 && `Links in this week's brief: ${read.rest.join(" ")}`,
        unreadLine(read.unread, "in this week's brief"),
        ...notesText(notes),
        `Today is ${today()}. Filming: ${input.filmingOn || "Monday, Wednesday and Thursday afternoons"}.`,
        input.lastWeek && `How last week went: ${input.lastWeek}`,
        input.trending && `Doing well in the niche right now - adapt these for the app:\n${input.trending}`,
        // Added in the chat after the first try didn't work out.
        followUps && `Since I first asked, I've added:\n${followUps}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const made = await writeSheet(job.brand, ws, content, read.rest.length + notes.unread.length > 0, date, progress);

  // This week's brief is kept with the sheet it was for.
  progress("Saving the sheet and its edit cards");
  const id = await saveSheet(user.id, projectId, made.title, weekBrief ? { ...made.sheet, weekBrief } : made.sheet);
  const bankEntry = await bankHooks(user.id, projectId, ws, made.title, made.scriptBankEntry);
  await makeEditCards(user, projectId, id, made.title, made.sheet);
  return { id, title: made.title, oneLine: made.oneLine, couldntOpen: couldntOpenOnce(read.failed, made.couldntOpen), bankEntry };
}

/** A reply in the sheet's chat: Claude changes the sheet as asked, keeping the rest. */
export async function reviseShootSheet(user: HubUser, projectId: string, chat: SheetChat, reply: string, progress: Progress = () => {}) {
  const row = chat.sheetId ? await getSheet(user.id, chat.sheetId) : null;
  if (!row || row.project_id !== projectId) throw new StudioError("That shoot sheet has been deleted - start a new one.");
  const job = await projectBasics(user.id, projectId);
  const ws = await getWorkspace(user.id, projectId);
  const read = await readBrief(user.id, reply, "", progress);
  const notes = await readNotesPages(ws, [...read.linked.pages.map((p) => p.url), ...read.rest], progress);
  const { weekBrief, custom, ...data } = row.data as CustomSheet & { weekBrief?: string };
  const current = custom ? { header: custom.header, ...data } : data;
  const conversation = chat.messages.map((m) => `${m.role === "you" ? "Me" : "You"}: ${m.text}`).join("\n\n");
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...imageBlocks(read.linked.images),
    ...videoBlocks(read.watched),
    {
      type: "text",
      text: [
        weekBrief && `This week's brief from the brand:\n<this_weeks_brief>\n${weekBrief}\n</this_weeks_brief>`,
        `Our conversation about this week's shoot sheet so far:\n<conversation>\n${conversation}\n</conversation>`,
        `The shoot sheet as it stands:\n<current_sheet>\n${JSON.stringify(current)}\n</current_sheet>`,
        `My reply:\n<reply>\n${reply}\n</reply>`,
        read.linked.pages.length > 0 && `Pages linked in my reply:\n${linkedPagesText(read.linked.pages)}`,
        read.rest.length > 0 && `Links in my reply: ${read.rest.join(" ")}`,
        unreadLine(read.unread, "in my reply"),
        ...notesText(notes),
        `Today is ${today()}. Make the changes I'm asking for and give me the whole sheet back, with everything I haven't asked to change kept as it is. If I've just added context, use it where it fits. oneLine: one sentence on what you changed. scriptBankEntry: the hooks for the sheet as it now stands.`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
  // The sheet keeps the date it was made for.
  const date = row.title.split(" · ").at(-1) ?? new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const made = await writeSheet(job.brand, ws, content, read.rest.length + notes.unread.length > 0, date, progress);

  progress("Saving the sheet and its edit cards");
  await updateSheet(user.id, row.id, made.title, weekBrief ? { ...made.sheet, weekBrief } : made.sheet);
  const bankEntry = await bankHooks(user.id, projectId, ws, made.title, made.scriptBankEntry, chat.bankEntry);
  await refreshEditCards(user, projectId, row.id, made.title, made.sheet);
  return { id: row.id, title: made.title, oneLine: made.oneLine, couldntOpen: couldntOpenOnce(read.failed, made.couldntOpen), bankEntry };
}

/** The template's header markup, so Claude can see the bracketed text to fill. */
function headerOf(html: string) {
  return /<header class="page">[\s\S]*?<\/header>/i.exec(html)?.[0] ?? "(no header)";
}

/* ---- Friday review ---- */

export async function fridayReview(user: HubUser, projectId: string, input: { numbers: string; uploads: Upload[] }, progress: Progress = () => {}) {
  progress("Claude is reviewing the week");
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

/** A changed sheet's edit cards follow it: ones not started yet get the new brief, new videos get cards, dropped ones go. Started ones are left alone. */
async function refreshEditCards(user: HubUser, projectId: string, sheetId: string, title: string, sheet: SheetData | CustomSheet) {
  if (!(await canUse(user, "edits"))) return;
  try {
    const cards = (await listEdits(user.id, projectId)).filter((c) => c.sheetId === sheetId);
    const wanted = [
      { videoCode: WHOLE_SHEET, title: `${title} - all ${sheet.videos.length} videos`, brief: briefForWholeSheet(sheet) },
      ...sheet.videos.map((v) => ({ videoCode: String(v.code), title: String(v.title ?? ""), brief: briefFromSheet(sheet, String(v.code)) })),
    ];
    for (const w of wanted) {
      const card = cards.find((c) => c.videoCode === w.videoCode);
      if (!card) await createEdit(user.id, { projectId, sheetId, ...w });
      else if (card.status === "todo") await updateEdit(user.id, card.id, { title: w.title, brief: w.brief });
    }
    for (const c of cards) if (c.status === "todo" && !wanted.some((w) => w.videoCode === c.videoCode)) await deleteEdit(user.id, c.id);
  } catch (e) {
    console.error("Creator Desk: couldn't update edit cards", e);
  }
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
