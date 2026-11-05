import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { adminClient } from "../supabase/admin";
import type { HubUser } from "../supabase/server";
import { StudioError, ask } from "./claude";
import { getSheet, getWorkspace, saveSheet, saveWorkspace, updateSheet } from "./data";
import { SYSTEM_BRIEF_FILL, SYSTEM_INTAKE, SYSTEM_REVIEW, SYSTEM_SHEET, SYSTEM_SHEET_TEMPLATE } from "./prompts";
import { CustomSheetResult, FILES, IntakeResult, ReviewResult, SheetResult, type SheetData, type Workspace } from "./types";
import { type CustomSheet, fillTemplate, readTemplateData, weekDataBlock } from "./custom-template";
import { couldntOpenOnce, imageBlocks, linkedPagesText, otherLinks, readLinkedPages, readableLinks } from "./linked-pages";
import { findAccounts, socialLink, videoBlocks, watchVideos } from "./videos";
import { apifyEnabled, pullPosts } from "./apify";
import { readOnMac } from "../edits/mac-reads";
import { addSetupTodos, applySetup, suggestedHandles } from "./new-job";
import { BriefFill, applyBrief } from "./brief-fill";
import { uploadedLinks } from "./pdf-links";
import { attachedVideos } from "./attachments";
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

/** A file attached to the material: sent along (a PDF or screenshot), or uploaded to storage first (a video). */
export type Upload = { name: string; type: string; data?: string; path?: string };

/** The job's name and basics, from the tracker (hub_projects). */
async function projectBasics(userId: string, projectId: string) {
  const { data } = await adminClient().from("hub_projects").select("data").eq("user_id", userId).eq("id", projectId).maybeSingle<{ data: Record<string, unknown> }>();
  const p = data?.data ?? {};
  const s = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");
  return { brand: s("brand") || "this job", title: s("title"), notes: s("notes") };
}

/** Everything Claude knows about the job: like a Claude Project's instructions + files. */
export function workspaceContext(name: string, ws: Workspace) {
  const parts = [`# Job: ${name}`, "## Project instructions", ws.instructions || "(not set up yet)"];
  for (const f of FILES) parts.push(`## File: ${f.label.toLowerCase().replace(" ", "-")}`, ws.files[f.key].trim() || "(empty)");
  if (ws.account.handles) parts.push("## Accounts", ws.account.handles);
  return parts.join("\n\n");
}

function uploadsToBlocks(uploads: Upload[]): Anthropic.Beta.BetaContentBlockParam[] {
  return uploads.flatMap((u): Anthropic.Beta.BetaContentBlockParam[] => {
    // Videos go to the video watcher (frames and what's said), not in here.
    if (!u.data) return [];
    if (u.type === "application/pdf") return [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: u.data }, title: u.name }];
    if (u.type === "image/png" || u.type === "image/jpeg" || u.type === "image/webp" || u.type === "image/gif") {
      return [{ type: "image", source: { type: "base64", media_type: u.type, data: u.data } }];
    }
    return [];
  });
}

/** Other links: ordinary public pages are read here; ones that need a login (or won't load here) are read in your own
    browser through your Mac's helper when it's running; anything left is for Claude's web fetch, with why it wasn't read.
    Then the links inside every page read are followed too. */
async function readOtherLinks(userId: string, text: string, linked: LinkedPages, progress: Progress) {
  const rest = otherLinks(text, linked.pages).map(cleanLink);
  // TikTok and Instagram links are looked up through Apify (below), not read as web pages: they need the app or a login.
  const web = await readWebPages(rest.filter((u) => !socialLink(u)));
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
  failed.push(...(await followPageLinks(text, linked, progress)));
  return { rest: [...new Set(rest)].filter((u) => !read.has(u) && !socialLink(u)), failed, unread };
}

/** The links inside the pages read - a Notion guide's sub-pages listed on a page your Mac read, the app's site, its store
    pages - are read too. A Notion page that won't load is reported; a web page that won't open is left out quietly. */
async function followPageLinks(text: string, linked: LinkedPages, progress: Progress) {
  const inPages = linked.pages.map((p) => p.text).join("\n");
  const readIds = new Set(linked.pages.flatMap((p) => p.ids ?? []));
  const pasted = new Set([...readableLinks(text).map((l) => l.id), ...otherLinks(text, []).map(cleanLink)]);
  const notion = readableLinks(inPages).filter((l) => !readIds.has(l.id) && !pasted.has(l.id));
  let failed: string[] = [];
  if (notion.length) {
    progress("Reading the pages linked inside");
    const more = await readLinkedPages(notion.map((l) => l.url).join("\n"));
    const fresh = more.pages.filter((p) => !(p.ids ?? []).some((id) => readIds.has(id)));
    linked.pages.push(...fresh);
    linked.images.push(...more.images);
    failed = more.failed;
  }
  const have = new Set(linked.pages.map((p) => cleanLink(p.url)));
  const web = otherLinks(linked.pages.map((p) => p.text).join("\n"), linked.pages)
    .map(cleanLink)
    .filter((u) => !pasted.has(u) && !have.has(u) && !socialLink(u));
  if (web.length) linked.pages.push(...(await readWebPages([...new Set(web)])).pages);
  return failed;
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
    .filter((u) => !socialLink(u) && !already.includes(u))
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

// Setting a job up reads every reference: the first few videos are watched frame by frame, this many more are looked
// up for their caption, what's said and their views, and the accounts linked to study get their latest posts.
const SETUP_MORE_VIDEOS = 16;
const SETUP_ACCOUNTS = 15;
const POSTS_PER_ACCOUNT = 6;
const SHOWN_PER_ACCOUNT = 4;

const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

/** The TikTok and Instagram accounts linked in the material (creators to study, other apps' creators), with their latest posts. */
async function studyAccounts(text: string, pages: LinkedPages["pages"]): Promise<{ text: string; failed: string[] }> {
  const accounts = findAccounts(text, pages, SETUP_ACCOUNTS);
  if (!accounts.length) return { text: "", failed: [] };
  if (!apifyEnabled) return { text: "", failed: accounts.map((a) => `${a.url} - Creator Desk needs Apify connected to look at TikTok and Instagram accounts.`) };
  const { posts, problems } = await pullPosts([], accounts.map((a) => ({ platform: a.platform, handle: a.handle, note: "" })), POSTS_PER_ACCOUNT);
  const failed: string[] = [];
  const lines: string[] = [];
  for (const a of accounts) {
    const where = a.platform === "tiktok" ? "TikTok" : "Instagram";
    const theirs = posts.filter((p) => p.platform === a.platform && p.handle === a.handle).sort((x, y) => y.views - x.views);
    if (!theirs.length) {
      const why = problems.find((p) => p.startsWith(`${where}:`))?.slice(where.length + 2) ?? "no public posts found (a private account, or the handle's wrong)";
      failed.push(`${a.url} - ${why}`);
      continue;
    }
    const views = theirs.map((p) => p.views).sort((x, y) => x - y);
    lines.push(
      [
        `@${a.handle} on ${where} (${a.url}) - their ${theirs.length} latest posts usually get about ${compact(views[Math.floor(views.length / 2)])} views. Most viewed:`,
        ...theirs.slice(0, SHOWN_PER_ACCOUNT).map((p) => `- ${compact(p.views)} views${p.seconds ? ` · ${Math.round(p.seconds)}s` : ""} · "${p.caption.replace(/\s+/g, " ").slice(0, 160)}" · ${p.url}`),
      ].join("\n"),
    );
  }
  return {
    text: lines.length ? `Accounts linked in the material, with their latest posts (looked up just now - they opened fine, so they never go in couldntOpen):\n\n${lines.join("\n\n")}` : "",
    failed,
  };
}

export async function setUpJob(user: HubUser, projectId: string, input: { material: string; filming: string; voice: string; uploads: Upload[] }, progress: Progress = () => {}) {
  const job = await projectBasics(user.id, projectId);
  // Public Notion pages and Google Docs are read here (Claude's web fetch only sees their loading screen).
  progress("Reading the linked pages");
  // Links in uploaded PDFs (a Notion page saved as a PDF links every sub-page) are read like pasted ones.
  const links = [input.material, uploadedLinks(input.uploads)].filter(Boolean).join("\n");
  const linked = await readLinkedPages(links);
  const { rest, failed: macFailed, unread } = await readOtherLinks(user.id, links, linked, progress);
  progress("Watching the reference videos and looking at the accounts");
  // Reference videos (uploaded to those pages, or TikTok / Instagram links) as frames Claude can look at - and every
  // other one in the material by its caption and what's said - plus the accounts it links to study.
  const attached = await attachedVideos(user.id, input.uploads);
  const [watched, study] = await Promise.all([watchVideos(links, linked.pages, undefined, SETUP_MORE_VIDEOS, attached), studyAccounts(links, linked.pages)]);
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
          study.text,
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
  progress("Filling in the job and its setup to-dos");
  const ws = await getWorkspace(user.id, projectId);
  // Suggested handles go on the Account tab while it has none, marked as not made yet.
  const handles = ws.account.handles.trim() ? "" : suggestedHandles(result.handles);
  const saved = await saveWorkspace(user.id, projectId, {
    ...ws,
    instructions: result.instructions,
    files: { ...ws.files, brief: result.brief, appNotes: result.appNotes, references: result.references || ws.files.references },
    clientQuestions: result.clientQuestions,
    needsDan: result.needsDan,
    couldntOpen: couldntOpenOnce(linked.failed, macFailed, watched.failed, study.failed, result.couldntOpen),
    read: linked.pages.map((p) => ({ title: p.title, url: p.url, parts: [...p.text.matchAll(/^## Sub-page: (.+)$/gm)].map((m) => m[1].trim()).slice(0, 50) })),
    ...(handles && { account: { ...ws.account, handles } }),
  });
  await applySetup(user, projectId, result, input.material);
  return saved;
}

/* ---- Fill a job in from its brief ---- */

export type BriefFillResult = { summary: string; changes: string[]; questions: string[]; todos: number; couldntOpen: string[] };
const briefUndoRow = (projectId: string) => `brief:${projectId}`;

/** Any job (a brand deal, a retainer's new month): read what the client sent and fill in the job's details from it. */
export async function fillJobFromBrief(user: HubUser, projectId: string, input: { material: string; uploads: Upload[] }, progress: Progress = () => {}): Promise<BriefFillResult> {
  const db = adminClient();
  const { data: row } = await db.from("hub_projects").select("data").eq("user_id", user.id).eq("id", projectId).maybeSingle<{ data: Record<string, unknown> }>();
  if (!row) throw new StudioError("That job's been deleted.");
  const job = row.data;
  progress("Reading the linked pages");
  const links = [input.material, uploadedLinks(input.uploads)].filter(Boolean).join("\n");
  const linked = await readLinkedPages(links);
  const { rest, failed: macFailed, unread } = await readOtherLinks(user.id, links, linked, progress);
  progress("Watching the videos");
  const watched = await watchVideos(links, linked.pages, undefined, 0, await attachedVideos(user.id, input.uploads));
  const material = [input.material, linkedPagesText(linked.pages)].filter(Boolean).join("\n\n");
  // What's on the job now, so Claude knows what's there already.
  const pick = (k: string) => job[k];
  const now = { brand: pick("brand"), title: pick("title"), stage: pick("stage"), fee: pick("fee"), feeCurrency: pick("feeCurrency"), contact: pick("contact"), deliverables: pick("deliverables"), product: pick("product"), keyMessages: pick("keyMessages"), dos: pick("dos"), donts: pick("donts"), usageRights: pick("usageRights"), filmBy: pick("filmBy"), due: pick("due"), goLive: pick("goLive") };
  progress("Claude is reading the brief");
  const result = await ask({
    system: SYSTEM_BRIEF_FILL,
    content: [
      ...uploadsToBlocks(input.uploads),
      ...imageBlocks(linked.images),
      ...videoBlocks(watched),
      {
        type: "text",
        text: [
          `Today is ${today()}.`,
          `The job as it stands:\n${JSON.stringify(now, null, 1)}`,
          `What the client sent:\n${material || "(see the attached files)"}`,
          unreadLine(unread, "in the material"),
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    schema: BriefFill,
    webFetch: rest.length > 0,
    effort: "medium",
    onFixUp: () => progress("Claude is fixing its answer"),
  });
  progress("Filling in the job");
  // Applied to the job as it is now (you may have changed something while Claude read).
  const { data: fresh } = await db.from("hub_projects").select("data").eq("user_id", user.id).eq("id", projectId).maybeSingle<{ data: Record<string, unknown> }>();
  if (!fresh) throw new StudioError("That job's been deleted.");
  const { next, changes } = applyBrief(fresh.data, result);
  const stamp = new Date().toISOString();
  await db.from("hub_projects").update({ data: next, updated_at: stamp }).eq("user_id", user.id).eq("id", projectId);
  const added = (await canUse(user, "todos")) ? await addSetupTodos(user.id, projectId, result.todos.slice(0, 6).map((t) => ({ text: t.text, dayOffset: t.dayOffset }))) : [];
  // Kept so it can be undone: the job as it was, and the to-dos added.
  await db.from("hub_workspaces").upsert({ user_id: user.id, project_id: briefUndoRow(projectId), data: { before: fresh.data, after: stamp, todoIds: added.map((t) => t.id) }, updated_at: stamp });
  return {
    summary: result.summary,
    changes: [...changes, ...(added.length ? [`${added.length} to-do${added.length === 1 ? "" : "s"}`] : [])],
    questions: result.questions,
    todos: added.length,
    couldntOpen: couldntOpenOnce(linked.failed, macFailed, watched.failed),
  };
}

/** Put the job back as it was before it was filled in from its brief, and take away the to-dos that added. */
export async function undoBriefFill(user: HubUser, projectId: string) {
  const db = adminClient();
  const { data } = await db.from("hub_workspaces").select("data").eq("user_id", user.id).eq("project_id", briefUndoRow(projectId)).maybeSingle<{ data: { before: Record<string, unknown>; todoIds: string[] } }>();
  if (!data?.data?.before) throw new StudioError("There's nothing to undo.");
  await db.from("hub_projects").update({ data: data.data.before, updated_at: new Date().toISOString() }).eq("user_id", user.id).eq("id", projectId);
  if (data.data.todoIds.length) {
    const { getTodos, saveTodos } = await import("../todos/data");
    await saveTodos(user.id, (await getTodos(user.id)).filter((t) => !data.data.todoIds.includes(t.id)));
  }
  await db.from("hub_workspaces").delete().eq("user_id", user.id).eq("project_id", briefUndoRow(projectId));
}

/* ---- This week's shoot sheet ---- */

// Reference videos past the ones watched, looked up for a shoot sheet by their caption, what's said and their views.
const SHEET_MORE_VIDEOS = 6;

/** A brief's links read for Claude: public pages, pages on your Mac, and reference videos. */
async function readBrief(userId: string, text: string, alsoWatch: string, progress: Progress, attached: { label: string; url: string }[] = []) {
  progress("Reading the linked pages");
  const linked = await readLinkedPages(text);
  const { rest, failed: macFailed, unread } = await readOtherLinks(userId, text, linked, progress);
  // Reference videos in the brief (or what's trending), as frames Claude can look at.
  progress("Watching the reference videos");
  const watched = await watchVideos([text, alsoWatch].join("\n"), linked.pages, undefined, SHEET_MORE_VIDEOS, attached);
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
  const read = await readBrief(user.id, [input.weekBrief, followUps, uploadedLinks(input.uploads)].join("\n"), input.trending, progress, await attachedVideos(user.id, input.uploads));
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
