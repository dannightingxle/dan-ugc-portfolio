import "server-only";
import { randomUUID } from "node:crypto";
import { adminClient } from "../supabase/admin";
import type { HubUser } from "../supabase/server";
import { canUse } from "../features";
import { getTodos, saveTodos } from "../todos/data";
import { localDay, type Todo } from "../todos/types";
import { readableLinks } from "./linked-pages";
import type { IntakeResult } from "./types";

/* What setting a job up from its material does beyond the workspace: the
   job's details in the tracker (only fields still empty, so nothing you've
   typed is overwritten), its setup steps as to-dos, and - for a job started
   from its brief - the job itself. */

/** What a job started from its brief is called until setup has read the material. */
export const NEW_JOB_NAME = "New tech job";

type Stored = Record<string, unknown> & { brand?: string; title?: string; contact?: Record<string, string>; links?: { id: string; label: string; url: string }[] };

/** A new tech job in the tracker, ready for setup to fill in. The page fills in every other field when it loads it. */
export async function createTechJob(userId: string) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const data = { id, createdAt: now, brand: NEW_JOB_NAME, title: "", stage: "Briefed", techStage: "Account creation", source: "", platform: "" };
  const { error } = await adminClient().from("hub_projects").insert({ user_id: userId, id, data, updated_at: now });
  if (error) throw error;
  return id;
}

const blank = (v: unknown) => v == null || v === "" || (typeof v === "string" && !v.trim());

/** The job's details from the material, into the tracker's empty fields; the brief's own links go in its links. */
async function fillTracker(userId: string, projectId: string, job: IntakeResult["job"], material: string) {
  const db = adminClient();
  const { data: row } = await db.from("hub_projects").select("data").eq("user_id", userId).eq("id", projectId).maybeSingle<{ data: Stored }>();
  if (!row) return;
  const p = row.data;
  const next: Stored = { ...p };
  const fill = (key: string, value: unknown) => {
    if (!blank(value) && blank(p[key])) next[key] = typeof value === "string" ? value.trim() : value;
  };
  if (job.brand.trim() && (blank(p.brand) || p.brand === NEW_JOB_NAME)) next.brand = job.brand.trim();
  fill("title", job.title);
  fill("platform", job.platform);
  fill("payModel", job.payModel);
  fill("perVideo", job.perVideo);
  fill("videosPerDay", job.videosPerDay);
  // The rate's currency goes with the rate: set when the rate is.
  if (job.currency && blank(p.perVideo) && job.perVideo != null) next.currency = job.currency;
  const contact = { name: "", role: "", company: "", email: "", phone: "", handle: "", ...(p.contact ?? {}) };
  if (job.contactName.trim() && !contact.name) contact.name = job.contactName.trim();
  if (job.contactEmail.trim() && !contact.email) contact.email = job.contactEmail.trim();
  next.contact = contact;
  const links = p.links ?? [];
  if (!links.length) {
    next.links = readableLinks(material).map((l) => ({ id: randomUUID(), label: l.kind === "notion" ? "Brief (Notion)" : "Brief (Google Doc)", url: l.url }));
  }
  if (JSON.stringify(next) === JSON.stringify(p)) return;
  await db.from("hub_projects").update({ data: next, updated_at: new Date().toISOString() }).eq("user_id", userId).eq("id", projectId);
}

const MAX_SETUP_TODOS = 8;

/** The setup steps as one-off to-dos for the job, in order, with a date where the material gives a timeline. Ones already there aren't added twice. */
export async function addSetupTodos(userId: string, projectId: string, steps: IntakeResult["setupSteps"]): Promise<Todo[]> {
  if (!steps.length) return [];
  const todos = await getTodos(userId);
  const have = new Set(todos.filter((t) => t.projectId === projectId).map((t) => t.text.trim().toLowerCase()));
  const start = Date.now();
  const added: Todo[] = [];
  for (const [i, step] of steps.entries()) {
    const text = step.text.trim().replace(/\s+/g, " ").slice(0, 300);
    if (!text || have.has(text.toLowerCase())) continue;
    have.add(text.toLowerCase());
    let due = "";
    if (step.dayOffset != null && step.dayOffset >= 0 && step.dayOffset <= 90) {
      const d = new Date();
      d.setDate(d.getDate() + step.dayOffset);
      due = localDay(d);
    }
    // A millisecond apart, so steps on the same day keep their order.
    const createdAt = new Date(start + i).toISOString();
    added.push({ id: randomUUID(), text, projectId, repeat: "", due, count: null, left: null, submittedAt: "", doneAt: "", prevDue: "", createdAt });
  }
  // A handful at most: set-up's steps are the key actions, not a day-by-day plan (that's in the instructions).
  const kept = added.slice(0, MAX_SETUP_TODOS);
  if (kept.length) await saveTodos(userId, [...todos, ...kept]);
  return kept;
}

/** After setup: the tracker's empty fields, and the setup steps as to-dos (with to-dos switched on). */
export async function applySetup(user: HubUser, projectId: string, result: IntakeResult, material: string) {
  await fillTracker(user.id, projectId, result.job, material);
  if (await canUse(user, "todos")) await addSetupTodos(user.id, projectId, result.setupSteps);
}

/** Suggested handles for the Account tab, marked as not made yet. */
export function suggestedHandles(handles: IntakeResult["handles"]) {
  return handles
    .map((h) => ({ ...h, handle: h.handle.trim().replace(/^@/, "") }))
    .filter((h) => /^[\w.]{2,40}$/.test(h.handle))
    .map((h) => `${h.platform === "instagram" ? "Instagram" : "TikTok"} @${h.handle} (suggested - not created yet)`)
    .join("\n");
}
