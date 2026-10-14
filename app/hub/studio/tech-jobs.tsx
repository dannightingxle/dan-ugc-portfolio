"use client";

import Link from "next/link";
import { techMonthly, useDataReady, useProjects, type Project } from "../_lib/store";
import { useMoney } from "../_lib/money";
import { money, shortDate } from "../_lib/ui";

/* Every live tech UGC job, busiest first, each opening straight into its Studio.
   Shown on the dashboard and on the Studio home. */

const ORDER: Project["techStage"][] = ["Active", "Warm-up", "Setup", "Account creation", "Negotiating", "On hold"];

function liveTechJobs(projects: Project[]) {
  return projects
    .filter((p) => p.techStage && p.techStage !== "Ended")
    .sort((a, b) => ORDER.indexOf(a.techStage) - ORDER.indexOf(b.techStage) || a.brand.localeCompare(b.brand));
}

export function TechJobs({ title, studioLink }: { title: string; studioLink?: boolean }) {
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
          <h2 className="text-lg font-semibold">{title}</h2>
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
          <Link href="/hub/projects?new=tech" className="text-accent hover:underline">
            + New tech job
          </Link>
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
