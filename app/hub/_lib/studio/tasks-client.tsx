"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useFeature } from "../../account-provider";

/* Studio's background jobs on the page: which are running and which have
   finished, checked every few seconds while any are going. A tray in the
   corner shows them on every Creator Desk page, so a job started on one
   project can be left while you work on another. */

export type TaskKind = "intake" | "week" | "review";
export type Task = {
  id: string;
  projectId: string;
  brand: string;
  kind: TaskKind;
  status: "running" | "done" | "failed";
  startedAt: string;
  finishedAt: string | null;
  result: unknown;
  error: string;
};

const LABEL: Record<TaskKind, string> = { intake: "Setting up the job", week: "Shoot sheet", review: "Friday review" };
const TAB: Record<TaskKind, string> = { intake: "setup", week: "week", review: "review" };
const POLL_MS = 4000;

type Ctx = {
  tasks: Task[];
  /** Start a job; resolves once the server has it (the job itself carries on in the background). */
  start: (url: string, body: unknown) => Promise<void>;
  dismiss: (id: string) => void;
  refresh: () => Promise<void>;
};
const TasksContext = createContext<Ctx>({ tasks: [], start: async () => {}, dismiss: () => {}, refresh: async () => {} });

export const useTasks = () => useContext(TasksContext);
/** This project's latest run of one job, if any. */
export const useTask = (projectId: string, kind: TaskKind) => useTasks().tasks.find((t) => t.projectId === projectId && t.kind === kind);

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const on = useFeature("studio");
  const [tasks, setTasks] = useState<Task[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/hub/studio/tasks", { cache: "no-store" });
      if (res.ok) setTasks(((await res.json()) as { tasks: Task[] }).tasks);
    } catch {
      // Offline for a moment: try again on the next tick.
    }
  }, []);

  useEffect(() => {
    if (!on) return;
    const t = setTimeout(refresh, 0);
    return () => clearTimeout(t);
  }, [on, refresh]);

  // Check every few seconds while something is running, and when you come back to the tab.
  const running = tasks.some((t) => t.status === "running");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [running, refresh]);
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

  return (
    <TasksContext.Provider value={{ tasks, start, dismiss, refresh }}>
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

function TaskTray() {
  const { tasks, dismiss } = useTasks();
  const path = usePathname();
  // The job's own page shows its result, so the tray leaves that one out.
  const here = /^\/hub\/projects\/([^/]+)\/studio/.exec(path)?.[1];
  const shown = tasks.filter((t) => t.status === "running" || t.projectId !== here);
  if (!shown.length) return null;
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
        {t.status === "running" && <p className="text-xs text-text-muted">Working… {elapsed} · you can keep using Creator Desk</p>}
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
