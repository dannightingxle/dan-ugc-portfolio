import "server-only";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { headers } from "next/headers";
import { adminClient } from "../supabase/admin";
import type { HubUser } from "../supabase/server";
import { StudioError, studioErrorMessage } from "./claude";

/* Studio's long jobs (set up, shoot sheet, Friday review) run on the server
   after the request has answered, so the page can be left, other jobs started
   on other projects, and the result picked up later from any page. Each job's
   latest run is one row in hub_workspaces under "task:<project>:<kind>" (a
   project_id no real job can have). */

export type TaskKind = "intake" | "week" | "review" | "assist" | "brief" | "script";
export type TaskStatus = "running" | "done" | "failed";
export type Task = {
  id: string;
  projectId: string;
  kind: TaskKind;
  status: TaskStatus;
  startedAt: string;
  finishedAt: string | null;
  /** What it's doing right now ("Reading the linked pages"), shown while it runs. */
  step: string;
  /** Last sign of life from the server running it (every 30s while it runs). */
  aliveAt?: string;
  /** When the run doing it now started: a job handed over to a fresh run (see Relay) gets that run's whole time limit. */
  legStartedAt?: string;
  /** What it's for, when there's more than one (a shoot sheet's chat). */
  ref?: string;
  /** What the page shows when it's done (e.g. the new sheet's id and one-line summary). */
  result: unknown;
  error: string;
};
export type Progress = (step: string) => void;

// The routes may run for JOB_SECONDS (their maxDuration); a job still "running" well after that was cut off.
export const JOB_SECONDS = 800;
const STALE_MS = (JOB_SECONDS + 30) * 1000;
// A running job says it's alive every 30s; silence for this long means the server running it stopped.
const BEAT_MS = 30_000;
const SILENT_MS = 100_000;
const KINDS: TaskKind[] = ["intake", "week", "review", "assist", "brief", "script"];
const rowId = (projectId: string, kind: TaskKind) => `task:${projectId}:${kind}`;

function fromRow(projectId: string, data: Partial<Task> | null): Task | null {
  if (!data?.kind || !KINDS.includes(data.kind) || !data.startedAt) return null;
  const task: Task = {
    id: rowId(projectId, data.kind),
    projectId,
    kind: data.kind,
    status: data.status === "done" || data.status === "failed" ? data.status : "running",
    startedAt: data.startedAt,
    finishedAt: data.finishedAt ?? null,
    step: data.step ?? "",
    aliveAt: data.aliveAt,
    legStartedAt: data.legStartedAt,
    ref: data.ref,
    result: data.result ?? null,
    error: data.error ?? "",
  };
  const where = task.step ? ` while ${task.step.charAt(0).toLowerCase()}${task.step.slice(1)}` : "";
  if (task.status === "running" && Date.now() - Date.parse(data.legStartedAt ?? task.startedAt) > STALE_MS) {
    return { ...task, status: "failed", error: `It ran out of time (${Math.round(JOB_SECONDS / 60)} minutes)${where}. Try again - with fewer links or videos if it keeps happening.` };
  }
  // Nothing more is happening on it (the server running it was stopped), so don't show it as working.
  if (task.status === "running" && data.aliveAt && Date.now() - Date.parse(data.aliveAt) > SILENT_MS) {
    return { ...task, status: "failed", error: `It stopped partway${where} (the server running it was cut off). Nothing is still running or using credits - try again.` };
  }
  return task;
}

async function save(userId: string, task: Task) {
  const { id, ...data } = task;
  const { error } = await adminClient().from("hub_workspaces").upsert({ user_id: userId, project_id: id, data, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/** What a job returns to hand the rest of its work to a fresh run, with that run's whole time limit (reading a brief and
    writing the sheet each get 13 minutes rather than sharing them). `stage` names the work in relay-stages.ts and
    `payload` is everything it needs; `inline` does the same work here, used when the hand-over can't be made. */
export class Relay {
  constructor(
    readonly stage: string,
    readonly payload: Record<string, unknown>,
    readonly inline: () => Promise<unknown>,
  ) {}
}

const RELAY_BUCKET = "studio-uploads";
const relayPath = (userId: string) => `relay/${userId}/${randomUUID()}.json`;

/** Where this site is answering, so a fresh run can be started on it. */
async function ownOrigin() {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return null;
    return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  } catch {
    return null;
  }
}

/** Save what the next run needs and start it. False if it couldn't be handed over (then the work is done here instead). */
async function handOff(origin: string | null, user: HubUser, task: Task, relay: Relay) {
  const secret = process.env.CRON_SECRET;
  if (!origin || !secret) return false;
  try {
    const storage = adminClient().storage;
    const path = relayPath(user.id);
    const body = JSON.stringify({ user, projectId: task.projectId, kind: task.kind, stage: relay.stage, payload: relay.payload });
    let up = await storage.from(RELAY_BUCKET).upload(path, body, { contentType: "application/json" });
    if (up.error && /not found/i.test(up.error.message)) {
      await storage.createBucket(RELAY_BUCKET, { public: false });
      up = await storage.from(RELAY_BUCKET).upload(path, body, { contentType: "application/json" });
    }
    if (up.error) throw up.error;
    // The next run's clock starts now.
    const now = new Date().toISOString();
    await save(user.id, { ...task, legStartedAt: now, aliveAt: now });
    const res = await fetch(`${origin}/api/hub/cron/studio-relay`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ path }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      await storage.from(RELAY_BUCKET).remove([path]).catch(() => {});
      throw new Error(`the next run wasn't started (HTTP ${res.status})`);
    }
    return true;
  } catch (e) {
    console.warn("Creator Desk studio: couldn't hand the job over, doing it here:", e);
    return false;
  }
}

/** Run a job's work on this server, saving each step and a sign of life, then how it ended. Work that returns a Relay is
    handed to a fresh run (or, if that can't be done, carried on here). */
async function runLeg(user: HubUser, task: Task, work: (progress: Progress) => Promise<unknown>, origin: string | null) {
  // Each step is saved as it starts, so the page can show it (and say where a slow job got to).
  let saving: Promise<void> = Promise.resolve();
  const beat = (step = task.step) => {
    task.step = step;
    task.aliveAt = new Date().toISOString();
    saving = saving.then(() => save(user.id, { ...task })).catch(() => {});
  };
  const progress: Progress = (step) => beat(step);
  const alive = setInterval(() => beat(), BEAT_MS);
  try {
    let result = await work(progress);
    if (result instanceof Relay) {
      clearInterval(alive);
      await saving;
      if (await handOff(origin, user, task, result)) return;
      // Not handed over: carry on here, with whatever time is left.
      const again = setInterval(() => beat(), BEAT_MS);
      try {
        result = await result.inline();
      } finally {
        clearInterval(again);
      }
    }
    clearInterval(alive);
    await saving;
    await save(user.id, { ...task, status: "done", finishedAt: new Date().toISOString(), result: result ?? null });
  } catch (e) {
    clearInterval(alive);
    console.error("Creator Desk studio task:", task.kind, e);
    await saving;
    await save(user.id, { ...task, status: "failed", finishedAt: new Date().toISOString(), error: studioErrorMessage(e) }).catch(() => {});
  }
}

/** Start a job in the background. Refuses a second run of the same job on the same project while one is going. */
export async function startTask(user: HubUser, projectId: string, kind: TaskKind, work: (progress: Progress) => Promise<unknown>, ref?: string): Promise<Task> {
  const current = (await listTasks(user.id)).find((t) => t.projectId === projectId && t.kind === kind);
  if (current?.status === "running") throw new StudioError("That's already running for this job - it'll show here when it's done.");
  const now = new Date().toISOString();
  const task: Task = { id: rowId(projectId, kind), projectId, kind, status: "running", startedAt: now, aliveAt: now, ref, finishedAt: null, step: "Starting", result: null, error: "" };
  await save(user.id, task);
  const origin = await ownOrigin();
  after(() => runLeg(user, task, work, origin));
  return task;
}

/** The second half of a handed-over job (from /api/hub/cron/studio-relay): read what the first run saved, and carry on
    with the same task, so the page sees one job. Null if there's nothing to carry on (already finished, or gone). */
export async function takeRelay(path: string) {
  if (!/^relay\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.json$/i.test(path)) return null;
  const storage = adminClient().storage.from(RELAY_BUCKET);
  const { data } = await storage.download(path);
  if (!data) return null;
  await storage.remove([path]).catch(() => {});
  const saved = JSON.parse(await data.text()) as { user: HubUser; projectId: string; kind: TaskKind; stage: string; payload: Record<string, unknown> };
  if (!path.startsWith(`relay/${saved.user.id}/`)) return null;
  const task = (await listTasks(saved.user.id)).find((t) => t.projectId === saved.projectId && t.kind === saved.kind);
  if (!task || task.status !== "running") return null;
  return { ...saved, task };
}

export function continueTask(user: HubUser, task: Task, work: (progress: Progress) => Promise<unknown>) {
  after(() => runLeg(user, task, work, null));
}

/** The user's jobs: running ones, and finished ones from the last day. */
export async function listTasks(userId: string): Promise<Task[]> {
  const { data, error } = await adminClient().from("hub_workspaces").select("project_id, data").eq("user_id", userId).like("project_id", "task:%");
  if (error) throw error;
  const day = Date.now() - 86_400_000;
  return (data ?? [])
    .map((r) => fromRow(String(r.project_id).split(":")[1] ?? "", r.data as Partial<Task>))
    .filter((t): t is Task => Boolean(t && (t.status === "running" || Date.parse(t.finishedAt ?? t.startedAt) > day)))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** Clear a finished job off the list. A running one stays. */
export async function dismissTask(userId: string, id: string) {
  const [, projectId, kind] = id.split(":");
  if (!projectId || !KINDS.includes(kind as TaskKind)) return;
  const task = (await listTasks(userId)).find((t) => t.id === id);
  if (!task || task.status === "running") return;
  await adminClient().from("hub_workspaces").delete().eq("user_id", userId).eq("project_id", id);
}
