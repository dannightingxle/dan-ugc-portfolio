import "server-only";
import { after } from "next/server";
import { adminClient } from "../supabase/admin";
import type { HubUser } from "../supabase/server";
import { StudioError, studioErrorMessage } from "./claude";

/* Studio's long jobs (set up, shoot sheet, Friday review) run on the server
   after the request has answered, so the page can be left, other jobs started
   on other projects, and the result picked up later from any page. Each job's
   latest run is one row in hub_workspaces under "task:<project>:<kind>" (a
   project_id no real job can have). */

export type TaskKind = "intake" | "week" | "review";
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
const KINDS: TaskKind[] = ["intake", "week", "review"];
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
    ref: data.ref,
    result: data.result ?? null,
    error: data.error ?? "",
  };
  const where = task.step ? ` while ${task.step.charAt(0).toLowerCase()}${task.step.slice(1)}` : "";
  if (task.status === "running" && Date.now() - Date.parse(task.startedAt) > STALE_MS) {
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

/** Start a job in the background. Refuses a second run of the same job on the same project while one is going. */
export async function startTask(user: HubUser, projectId: string, kind: TaskKind, work: (progress: Progress) => Promise<unknown>, ref?: string): Promise<Task> {
  const current = (await listTasks(user.id)).find((t) => t.projectId === projectId && t.kind === kind);
  if (current?.status === "running") throw new StudioError("That's already running for this job - it'll show here when it's done.");
  const now = new Date().toISOString();
  const task: Task = { id: rowId(projectId, kind), projectId, kind, status: "running", startedAt: now, aliveAt: now, ref, finishedAt: null, step: "Starting", result: null, error: "" };
  await save(user.id, task);
  after(async () => {
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
      const result = await work(progress);
      clearInterval(alive);
      await saving;
      await save(user.id, { ...task, status: "done", finishedAt: new Date().toISOString(), result: result ?? null });
    } catch (e) {
      clearInterval(alive);
      console.error("Creator Desk studio task:", kind, e);
      await saving;
      await save(user.id, { ...task, status: "failed", finishedAt: new Date().toISOString(), error: studioErrorMessage(e) }).catch(() => {});
    }
  });
  return task;
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
