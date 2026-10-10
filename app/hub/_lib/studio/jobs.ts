import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { adminClient } from "../supabase/admin";
import type { HubUser } from "../supabase/server";
import { ask } from "./claude";
import { getWorkspace, saveSheet, saveWorkspace } from "./data";
import { SYSTEM_INTAKE, SYSTEM_REVIEW, SYSTEM_SHEET } from "./prompts";
import { FILES, IntakeResult, ReviewResult, SheetResult, type Workspace } from "./types";

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

const hasLinks = (s: string) => /https?:\/\/\S+/i.test(s);
const today = () => new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/* ---- Set up a job ---- */

export async function setUpJob(user: HubUser, projectId: string, input: { material: string; filming: string; voice: string; uploads: Upload[] }) {
  const job = await projectBasics(user.id, projectId);
  const result = await ask({
    system: SYSTEM_INTAKE,
    content: [
      ...uploadsToBlocks(input.uploads),
      {
        type: "text",
        text: [
          `New job: ${job.brand}${job.title ? ` - ${job.title}` : ""}. Today is ${today()}.`,
          `Everything I have on it:\n${input.material || "(see the attached files)"}`,
          job.notes && `My notes from the tracker:\n${job.notes}`,
          `How I film: ${input.filming || "solo, phone on a tripod, at home and around town, second phone for app shots"}.`,
          `My voice: ${input.voice || "casual, direct, a bit dry"}.`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    schema: IntakeResult,
    webFetch: hasLinks(input.material),
    effort: "high",
  });
  const ws = await getWorkspace(user.id, projectId);
  return saveWorkspace(user.id, projectId, {
    ...ws,
    instructions: result.instructions,
    files: { ...ws.files, brief: result.brief, appNotes: result.appNotes, references: result.references || ws.files.references },
    clientQuestions: result.clientQuestions,
    needsDan: result.needsDan,
    couldntOpen: result.couldntOpen,
  });
}

/* ---- This week's shoot sheet ---- */

export async function makeShootSheet(
  user: HubUser,
  projectId: string,
  input: { videos: number; filmingOn: string; lastWeek: string; trending: string; newBrief: string; uploads: Upload[] },
) {
  const job = await projectBasics(user.id, projectId);
  let ws = await getWorkspace(user.id, projectId);
  // A new brief replaces the old one (never two sets of rules).
  if (input.newBrief.trim()) ws = await saveWorkspace(user.id, projectId, { ...ws, files: { ...ws.files, brief: input.newBrief.trim() } });

  const ask_ = input.newBrief.trim()
    ? `New brief is in the brief file. Pull out the deliverables, deadlines and must-haves, flag anything unclear in prep, then give me the shoot sheet with ${input.videos} videos.`
    : `I need this week's content: ${input.videos} videos.`;
  const result = await ask({
    system: SYSTEM_SHEET,
    context: workspaceContext(job.brand, ws),
    content: [
      ...uploadsToBlocks(input.uploads),
      {
        type: "text",
        text: [
          ask_,
          `Today is ${today()}. Filming: ${input.filmingOn || "Monday, Wednesday and Thursday afternoons"}.`,
          input.lastWeek && `How last week went: ${input.lastWeek}`,
          input.trending && `Doing well in the niche right now - adapt these for the app:\n${input.trending}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    schema: SheetResult,
    effort: "medium",
  });

  const title = `${result.sheet.h1} · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
  const id = await saveSheet(user.id, projectId, title, result.sheet);
  // Newest first, so the next sheet sees what's already been made.
  const entry = `## ${title}\n${result.scriptBankEntry.trim()}`;
  ws = await saveWorkspace(user.id, projectId, { ...ws, files: { ...ws.files, scriptBank: [entry, ws.files.scriptBank.trim()].filter(Boolean).join("\n\n") } });
  return { id, oneLine: result.oneLine, workspace: ws };
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
