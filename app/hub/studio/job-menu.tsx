"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { STAGES, TECH_STAGES, useProjects, type Project } from "../_lib/store";

/* The ⋯ in the corner of a job's card: open it, edit its details, set it up,
   change its stage, archive it, or move it between brand deals and tech jobs -
   without opening the job. A change shows a note with Undo for a few seconds. */

const LIVE_TECH = TECH_STAGES.filter((s) => s !== "Ended" && s !== "Lost");

/* The note with Undo lives outside the card: archiving a job takes its card off the page, and the note has to stay. */
type Note = { text: string; before: Project };
let note: Note | null = null;
const listeners = new Set<() => void>();
const setNote = (n: Note | null) => {
  note = n;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The last change made from a card's menu, with Undo, for a few seconds. Rendered once for the whole app. */
export function JobChangeNote() {
  const current = useSyncExternalStore(subscribe, () => note, () => null);
  const { save } = useProjects();
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => note === current && setNote(null), 7000);
    return () => clearTimeout(t);
  }, [current]);
  if (!current) return null;
  return (
    <div role="status" className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-bg-card px-4 py-2.5 text-sm shadow-lg md:bottom-6">
      {current.text}
      <button
        type="button"
        className="font-medium text-accent hover:underline"
        onClick={() => {
          save(current.before);
          setNote(null);
        }}
      >
        Undo
      </button>
    </div>
  );
}
const LIVE_DEAL = STAGES.filter((s) => s !== "Lost");

export function JobMenu({ project }: { project: Project }) {
  const { save } = useProjects();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const tech = Boolean(project.techStage);

  // Closes on a click elsewhere or Escape.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const change = (patch: Partial<Project>, text: string) => {
    setNote({ text, before: project });
    save({ ...project, ...patch });
    setOpen(false);
  };
  const name = project.brand || "This job";
  const item = "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-bg-elevated";

  return (
    <div ref={box} className="absolute right-2 top-2">
      <button
        type="button"
        aria-label={`Options for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`grid h-7 w-7 place-items-center rounded-lg text-text-dim transition hover:bg-bg-elevated hover:text-text ${open ? "bg-bg-elevated text-text" : ""}`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <div role="menu" aria-label={`${name} options`} className="absolute right-0 z-30 mt-1 w-60 rounded-xl border border-border bg-bg-card p-1.5 shadow-lg">
          <Link role="menuitem" href={`/hub/projects/${project.id}/studio`} className={item}>
            Open Studio
          </Link>
          <Link role="menuitem" href={`/hub/projects/${project.id}`} className={item}>
            Edit details <span className="text-xs text-text-dim">pay, dates, contact</span>
          </Link>
          <Link role="menuitem" href={`/hub/projects/${project.id}/studio?tab=setup`} className={item}>
            Set up from a brief
          </Link>
          <div className="my-1.5 border-t border-border" />
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-dim">Stage</p>
          {(tech ? LIVE_TECH : LIVE_DEAL).map((s) => {
            const current = (tech ? project.techStage : project.stage) === s;
            return (
              <button
                key={s}
                type="button"
                role="menuitemradio"
                aria-checked={current}
                onClick={() => !current && change(tech ? { techStage: s as Project["techStage"] } : { stage: s as Project["stage"] }, `${name}: ${s}`)}
                className={`${item} ${current ? "font-medium text-accent" : ""}`}
              >
                {s}
                {current && <span aria-hidden>✓</span>}
              </button>
            );
          })}
          <div className="my-1.5 border-t border-border" />
          <button
            type="button"
            role="menuitem"
            onClick={() => change(tech ? { techStage: "Ended" } : { stage: "Lost" }, `${name} moved to Archived`)}
            className={item}
          >
            Archive <span className="text-xs text-text-dim">{tech ? "ended" : "didn't happen"}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              change(tech ? { techStage: "" } : { techStage: "Setup" }, tech ? `${name} is now a brand deal` : `${name} is now a tech job`)
            }
            className={item}
          >
            {tech ? "Make it a brand deal" : "Make it a tech job"}
          </button>
        </div>
      )}
    </div>
  );
}
