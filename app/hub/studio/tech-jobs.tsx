"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isArchived, techMonthly, useDataReady, useProjects, type Project } from "../_lib/store";
import { useMoney } from "../_lib/money";
import { money, shortDate } from "../_lib/ui";

/* Every live tech UGC job, busiest first, each opening straight into its Studio.
   Shown on the dashboard, the Studio home and the Projects board's Tech jobs view. */

const ORDER: Project["techStage"][] = ["Active", "Warm-up", "Setup", "Account creation", "Negotiating", "On hold"];

function liveTechJobs(projects: Project[]) {
  return projects
    .filter((p) => p.techStage && !isArchived(p))
    .sort((a, b) => ORDER.indexOf(a.techStage) - ORDER.indexOf(b.techStage) || a.brand.localeCompare(b.brand));
}

/** hideNew: the page has its own + New tech job button. */
export function TechJobs({ title, studioLink, boardLink, hideHeading, hideNew }: { title: string; studioLink?: boolean; boardLink?: boolean; hideHeading?: boolean; hideNew?: boolean }) {
  const { projects } = useProjects();
  const ready = useDataReady();
  const jobs = liveTechJobs(projects);
  const today = new Date().toISOString().slice(0, 10);
  // Estimated monthly pay from active jobs, in the account's currency.
  const { convert, format, base } = useMoney();
  const active = jobs.filter((p) => p.techStage === "Active" && techMonthly(p) != null);
  const monthly = active.reduce((s, p) => s + convert(techMonthly(p) ?? 0, p.currency), 0);
  const mixed = active.some((p) => p.currency !== base);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          {/* Kept for screen readers when the page's own heading and switch say what this is. */}
          <h2 className={hideHeading ? "sr-only" : "text-lg font-semibold"}>{title}</h2>
          {monthly > 0 && (
            <p className="text-sm text-text-muted">
              About <span className="font-semibold text-good">{format(monthly)}</span> a month from active jobs{mixed && ", at today's rates"}
            </p>
          )}
        </div>
        <div className="flex gap-4 text-sm">
          {studioLink && (
            <Link href="/hub/studio" className="text-text-muted hover:text-accent">
              Studio →
            </Link>
          )}
          {boardLink && (
            <Link href="/hub/projects?view=tech" className="text-text-muted hover:text-accent">
              Open board →
            </Link>
          )}
          {!hideNew && (
            <Link href="/hub/projects?new=tech" className="text-accent hover:underline">
              + New tech job
            </Link>
          )}
        </div>
      </div>
      {ready && jobs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-strong bg-bg-card p-4 text-sm text-text-muted">
          No tech jobs yet. Add one with <span className="font-medium">+ New tech job</span>, then set it up in its Studio.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((p) => {
            const chase = Boolean(p.chaseOn && p.chaseOn <= today);
            return (
              <Link
                key={p.id}
                href={`/hub/projects/${p.id}/studio`}
                className={`min-w-0 rounded-xl border border-border bg-bg-card p-4 transition hover:border-border-strong ${p.techStage === "On hold" ? "opacity-60" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-medium">{p.brand || "Untitled"}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${p.techStage === "Active" ? "bg-accent-soft font-medium text-accent" : "bg-text/5 text-text-dim"}`}>
                    {p.techStage}
                  </span>
                </div>
                {p.title && <p className="truncate text-sm text-text-muted">{p.title}</p>}
                {p.forGroup && <span className="mt-1 inline-block rounded-full bg-text/5 px-2 py-0.5 text-[11px] font-medium text-text-muted">For the group</span>}
                {p.perVideo != null && (
                  <p className="mt-1 text-xs text-text-dim">
                    {money(p.perVideo, p.currency)} a video
                    {p.videosPerDay ? ` × ${p.videosPerDay} a day ≈ ${money(techMonthly(p), p.currency)}/mo` : ""}
                  </p>
                )}
                {p.waitingOn && (
                  <p className={`mt-2 truncate text-xs ${chase ? "font-medium text-warn" : "text-text-dim"}`}>
                    Waiting: {p.waitingOn}
                    {p.chaseOn && ` · ${chase ? "chase today" : `chase ${shortDate(p.chaseOn)}`}`}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* Brand deals or tech jobs: the switch on the dashboard and the Projects board (the choice is shared and remembered). */

const VIEW_KEY = "cd-board-view";
export type JobsView = "deals" | "tech";

/** asked: a view a link asked for (?view=tech), which wins over the remembered one. */
export function useJobsView(asked: JobsView | null = null) {
  const [view, setView] = useState<JobsView>(asked ?? "deals");
  useEffect(() => {
    if (asked) return;
    const t = setTimeout(() => {
      try {
        if (localStorage.getItem(VIEW_KEY) === "tech") setView("tech");
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, [asked]);
  const choose = (v: JobsView) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };
  return [view, choose] as const;
}

export function JobsSwitch({ view, onChange, deals, tech }: { view: JobsView; onChange: (v: JobsView) => void; deals: number; tech: number }) {
  return (
    <div role="tablist" aria-label="Which jobs" className="inline-flex rounded-xl border border-border bg-bg-card p-1 text-sm">
      {(
        [
          ["deals", "Brand deals", deals],
          ["tech", "Tech jobs", tech],
        ] as const
      ).map(([v, label, n]) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={view === v}
          onClick={() => onChange(v)}
          className={`rounded-lg px-4 py-1.5 transition ${view === v ? "bg-accent font-medium text-on-accent" : "text-text-muted hover:text-text"}`}
        >
          {label} <span className={view === v ? "opacity-80" : "text-text-dim"}>{n}</span>
        </button>
      ))}
    </div>
  );
}
