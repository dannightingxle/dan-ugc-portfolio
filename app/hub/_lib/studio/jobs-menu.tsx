"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useFeature } from "../../account-provider";
import { EDIT_LABEL, type EditJob, LABEL, type Task, editHref, editName, taskHref, useElapsed, useTasks } from "./tasks-client";

/* The Jobs button in the top bar: everything going on across your jobs - shoot
   sheets, set-ups and reviews being written, and edits on your Mac - and
   what's ready or needs you. */

export function JobsMenu() {
  const on = useFeature("studio");
  const editsOn = useFeature("edits");
  const { tasks, edits, dismiss } = useTasks();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Close on a click elsewhere or Escape.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (!on) return null;
  const going = [...tasks.filter((t) => t.status === "running"), ...edits.filter((e) => e.status === "queued" || e.status === "editing")];
  const needsYou = [...tasks.filter((t) => t.status === "failed"), ...edits.filter((e) => e.status === "needs_you" || e.status === "failed")];
  const ready = [...tasks.filter((t) => t.status === "done"), ...edits.filter((e) => e.status === "ready")];
  const count = going.length + needsYou.length + ready.length;
  const label = going.length ? `${going.length} going` : needsYou.length ? `${needsYou.length} need${needsYou.length === 1 ? "s" : ""} you` : ready.length ? `${ready.length} ready` : "Jobs";

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Jobs: ${going.length} going, ${needsYou.length} need you, ${ready.length} ready`}
        className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition ${
          needsYou.length ? "border-warn/40 bg-warn-soft text-warn" : going.length ? "border-accent/30 bg-accent-soft text-accent" : ready.length ? "border-good/40 bg-good-soft text-good" : "border-border text-text-muted hover:text-text"
        }`}
      >
        {going.length > 0 && <span className="block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
        {label}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-16 z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-border bg-bg-card p-3 text-sm shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96" role="dialog" aria-label="Your jobs">
          {!count && <p className="px-1 py-2 text-text-muted">Nothing going right now. Shoot sheets, set-ups, reviews and edits on your Mac show up here while they run.</p>}
          <Group title="Going" items={going} onPick={() => setOpen(false)} />
          <Group title="Needs you" items={needsYou} onPick={() => setOpen(false)} onClear={dismiss} />
          <Group title="Ready" items={ready} onPick={() => setOpen(false)} onClear={dismiss} />
          {editsOn && (
            <Link href="/hub/studio/edits" onClick={() => setOpen(false)} className="mt-1 block border-t border-border px-1 pt-2 text-xs font-medium text-accent hover:underline">
              All edits, every job →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function Group({ title, items, onPick, onClear }: { title: string; items: (Task | EditJob)[]; onPick: () => void; onClear?: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="mb-2 last:mb-0">
      <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-text-dim">{title}</p>
      <ul className="space-y-1">
        {items.map((item) => ("kind" in item ? <TaskItem key={item.id} t={item} onPick={onPick} onClear={onClear} /> : <EditItem key={item.id} e={item} onPick={onPick} />))}
      </ul>
    </div>
  );
}

function TaskItem({ t, onPick, onClear }: { t: Task; onPick: () => void; onClear?: (id: string) => void }) {
  const elapsed = useElapsed(t.startedAt, t.status === "running");
  const what = t.status === "running" ? `${t.step && t.step !== "Starting" ? t.step : "Working"}… ${elapsed}` : t.status === "done" ? "Ready - open it" : t.error;
  return (
    <li className="flex items-start gap-2 rounded-xl px-2 py-1.5 hover:bg-bg-elevated">
      <Link href={taskHref(t)} onClick={onPick} className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {t.brand} · {LABEL[t.kind]}
        </span>
        <span className={`block text-xs ${t.status === "failed" ? "text-warn" : "text-text-muted"}`}>{what}</span>
      </Link>
      {t.status !== "running" && onClear && (
        <button type="button" onClick={() => onClear(t.id)} aria-label={`Clear ${t.brand} ${LABEL[t.kind].toLowerCase()}`} className="shrink-0 px-1 text-text-dim hover:text-text">
          ✕
        </button>
      )}
    </li>
  );
}

function EditItem({ e, onPick }: { e: EditJob; onPick: () => void }) {
  return (
    <li className="rounded-xl px-2 py-1.5 hover:bg-bg-elevated">
      <Link href={editHref(e)} onClick={onPick} className="block">
        <span className="block truncate font-medium">{editName(e)}</span>
        <span className={`block text-xs ${e.status === "needs_you" || e.status === "failed" ? "text-warn" : "text-text-muted"}`}>Edit · {EDIT_LABEL[e.status]}</span>
      </Link>
    </li>
  );
}
