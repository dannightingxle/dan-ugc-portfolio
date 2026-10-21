"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useFeature } from "../../account-provider";

/* Studio's background jobs and the edits on your Mac, on every page: which
   are going, and which are ready or need you, checked every few seconds
   while anything is going. A tray in the corner pops up running Studio jobs
   and anything that needs a look; the Jobs button in the top bar lists the
   lot, so work across several clients can run side by side. */

export type TaskKind = "intake" | "week" | "review";
export type Task = {
  id: string;
  projectId: string;
  brand: string;
  kind: TaskKind;
  status: "running" | "done" | "failed";
  startedAt: string;
  finishedAt: string | null;
  /** What it's doing right now. */
  step?: string;
  result: unknown;
  error: string;
};

/** An edit on your Mac that's going, or waiting on you. */
export type EditJob = { id: string; projectId: string; brand: string; title: string; videoCode: string; status: "queued" | "editing" | "needs_you" | "ready" | "failed"; updatedAt: string };

export const LABEL: Record<TaskKind, string> = { intake: "Setting up the job", week: "Shoot sheet", review: "Friday review" };
export const TAB: Record<TaskKind, string> = { intake: "setup", week: "week", review: "review" };
const POLL_MS = 4000;
// With nothing going, a slower check picks up edits started elsewhere.
const IDLE_POLL_MS = 30_000;
export const EDIT_LABEL: Record<EditJob["status"], string> = { queued: "Waiting for your Mac", editing: "Editing on your Mac", needs_you: "Needs you", ready: "Ready to check in CapCut", failed: "Stopped" };
export const editHref = (e: EditJob) => `/hub/projects/${e.projectId}/studio?tab=edits`;
export const editName = (e: EditJob) => [e.brand, e.videoCode === "ALL" ? "whole sheet" : e.videoCode, e.title].filter(Boolean).join(" · ");
const editKey = (e: EditJob) => `${e.id}:${e.status}`;
const SEEN = "cd-edit-alerts-cleared";

type Ctx = {
  tasks: Task[];
  edits: EditJob[];
  /** Edit alerts cleared from the tray (kept in this browser). */
  cleared: Set<string>;
  clearEdit: (e: EditJob) => void;
  /** Start a job; resolves once the server has it (the job itself carries on in the background). */
  start: (url: string, body: unknown) => Promise<void>;
  dismiss: (id: string) => void;
  refresh: () => Promise<void>;
};
const TasksContext = createContext<Ctx>({ tasks: [], edits: [], cleared: new Set(), clearEdit: () => {}, start: async () => {}, dismiss: () => {}, refresh: async () => {} });

export const useTasks = () => useContext(TasksContext);
/** This project's latest run of one job, if any. */
export const useTask = (projectId: string, kind: TaskKind) => useTasks().tasks.find((t) => t.projectId === projectId && t.kind === kind);

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const on = useFeature("studio");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [edits, setEdits] = useState<EditJob[]>([]);
  const [cleared, setCleared] = useState<Set<string>>(() => new Set());

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/hub/studio/tasks", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { tasks: Task[]; edits?: EditJob[] };
      setTasks(json.tasks);
      setEdits(json.edits ?? []);
    } catch {
      // Offline for a moment: try again on the next tick.
    }
  }, []);

  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => {
      void refresh();
      try {
        setCleared(new Set(JSON.parse(localStorage.getItem(SEEN) ?? "[]") as string[]));
      } catch {
        // Private window or blocked storage: alerts just show until the edit moves on.
      }
    }, 0);
    return () => clearTimeout(t);
  }, [on, refresh]);

  // Check every few seconds while something is running, and when you come back to the tab.
  const running = tasks.some((t) => t.status === "running") || edits.some((e) => e.status === "queued" || e.status === "editing");
  useEffect(() => {
    if (!on) return;
    const t = setInterval(refresh, running ? POLL_MS : IDLE_POLL_MS);
    return () => clearInterval(t);
  }, [on, running, refresh]);
  useEffect(() => {
    if (!on) return;
    const back = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, [on, refresh]);

  const start = useCallback(
    async (url: string, body: unknown) => {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Something went wrong (${res.status}).`);
      await refresh();
    },
    [refresh],
  );

  const dismiss = useCallback((id: string) => {
    setTasks((ts) => ts.filter((t) => t.id !== id));
    void fetch(`/api/hub/studio/tasks?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  }, []);

  const clearEdit = useCallback((e: EditJob) => {
    setCleared((c) => {
      const next = new Set(c).add(editKey(e));
      try {
        localStorage.setItem(SEEN, JSON.stringify([...next].slice(-200)));
      } catch {}
      return next;
    });
  }, []);

  return (
    <TasksContext.Provider value={{ tasks, edits, cleared, clearEdit, start, dismiss, refresh }}>
      {children}
      {on && <TaskTray />}
    </TasksContext.Provider>
  );
}

/** "1:05" since the job started, ticking. */
export function useElapsed(since: string | undefined, live: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [live]);
  if (!since) return "";
  const s = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Edits that need a look: ready to check, waiting on an answer, or stopped. */
export const editNeedsLook = (e: EditJob) => e.status === "ready" || e.status === "needs_you" || e.status === "failed";

function TaskTray() {
  const { tasks, edits, cleared, clearEdit, dismiss } = useTasks();
  const path = usePathname();
  // The job's own page shows its result, so the tray leaves that one out.
  const here = /^\/hub\/projects\/([^/]+)\/studio/.exec(path)?.[1];
  const shown = tasks.filter((t) => t.status === "running" || t.projectId !== here);
  const alerts = edits.filter((e) => editNeedsLook(e) && !cleared.has(editKey(e)) && e.projectId !== here);
  if (!shown.length && !alerts.length) return null;
  return (
    <div
      aria-live="polite"
      className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 space-y-2 sm:inset-x-auto sm:right-5 sm:w-80 md:bottom-5"
      role="region"
      aria-label="Jobs running in the background"
    >
      {shown.slice(0, 4).map((t) => (
        <TaskRow key={t.id} task={t} onDismiss={() => dismiss(t.id)} />
      ))}
      {alerts.slice(0, Math.max(0, 4 - shown.length)).map((e) => (
        <EditAlert key={e.id} edit={e} onDismiss={() => clearEdit(e)} />
      ))}
    </div>
  );
}

function TaskRow({ task: t, onDismiss }: { task: Task; onDismiss: () => void }) {
  const elapsed = useElapsed(t.startedAt, t.status === "running");
  const href = `/hub/projects/${t.projectId}/studio?tab=${TAB[t.kind]}`;
  const tone = t.status === "done" ? "border-good/40" : t.status === "failed" ? "border-warn/40" : "border-border";
  return (
    <div className={`flex items-start gap-3 rounded-xl border ${tone} bg-bg-card px-3 py-2.5 text-sm shadow-lg`}>
      <span className="mt-0.5 shrink-0" aria-hidden>
        {t.status === "running" ? (
          <span className="block h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        ) : t.status === "done" ? (
          <span className="text-good">✓</span>
        ) : (
          <span className="text-warn">!</span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {t.brand} · {LABEL[t.kind]}
        </p>
        {t.status === "running" && (
          <p className="text-xs text-text-muted">
            {t.step && t.step !== "Starting" ? `${t.step}…` : "Working…"} {elapsed} · you can keep using Creator Desk
          </p>
        )}
        {t.status === "done" && (
          <Link href={href} className="text-xs font-semibold text-good underline">
            Ready - open it →
          </Link>
        )}
        {t.status === "failed" && (
          <p className="text-xs text-warn">
            {t.error}{" "}
            <Link href={href} className="font-semibold underline">
              Open
            </Link>
          </p>
        )}
      </div>
      {t.status !== "running" && (
        <button type="button" onClick={onDismiss} aria-label={`Clear ${t.brand} ${LABEL[t.kind].toLowerCase()}`} className="shrink-0 text-text-dim hover:text-text">
          ✕
        </button>
      )}
    </div>
  );
}

function EditAlert({ edit: e, onDismiss }: { edit: EditJob; onDismiss: () => void }) {
  const tone = e.status === "ready" ? "border-good/40" : "border-warn/40";
  return (
    <div className={`flex items-start gap-3 rounded-xl border ${tone} bg-bg-card px-3 py-2.5 text-sm shadow-lg`}>
      <span className={`mt-0.5 shrink-0 ${e.status === "ready" ? "text-good" : "text-warn"}`} aria-hidden>
        {e.status === "ready" ? "✓" : "!"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{editName(e)}</p>
        <Link href={editHref(e)} className={`text-xs font-semibold underline ${e.status === "ready" ? "text-good" : "text-warn"}`}>
          {e.status === "ready" ? "Edit ready - check it →" : e.status === "needs_you" ? "Claude needs you - answer →" : "The edit stopped - open it →"}
        </Link>
      </div>
      <button type="button" onClick={onDismiss} aria-label={`Clear ${editName(e)}`} className="shrink-0 text-text-dim hover:text-text">
        ✕
      </button>
    </div>
  );
}
