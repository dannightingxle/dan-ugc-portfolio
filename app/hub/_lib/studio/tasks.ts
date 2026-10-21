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
  /** What the page shows when it's done (e.g. the new sheet's id and one-line summary). */
  result: unknown;
  error: string;
};

// The routes may run for 300s; a job still "running" well after that was cut off.
const STALE_MS = 330_000;
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
    result: data.result ?? null,
    error: data.error ?? "",
  };
  if (task.status === "running" && Date.now() - Date.parse(task.startedAt) > STALE_MS) {
    return { ...task, status: "failed", error: "It ran out of time (5 minutes). Try again - with fewer links or videos if it keeps happening." };
  }
  return task;
}

async function save(userId: string, task: Task) {
  const { id, ...data } = task;
  const { error } = await adminClient().from("hub_workspaces").upsert({ user_id: userId, project_id: id, data, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/** Start a job in the background. Refuses a second run of the same job on the same project while one is going. */
export async function startTask(user: HubUser, projectId: string, kind: TaskKind, work: () => Promise<unknown>): Promise<Task> {
  const current = (await listTasks(user.id)).find((t) => t.projectId === projectId && t.kind === kind);
  if (current?.status === "running") throw new StudioError("That's already running for this job - it'll show here when it's done.");
  const task: Task = { id: rowId(projectId, kind), projectId, kind, status: "running", startedAt: new Date().toISOString(), finishedAt: null, result: null, error: "" };
  await save(user.id, task);
  after(async () => {
    try {
      const result = await work();
      await save(user.id, { ...task, status: "done", finishedAt: new Date().toISOString(), result: result ?? null });
    } catch (e) {
      console.error("Creator Desk studio task:", kind, e);
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
