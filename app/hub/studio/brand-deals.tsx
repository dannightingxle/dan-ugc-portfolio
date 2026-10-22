"use client";

import Link from "next/link";
import { STAGES, isArchived, useDataReady, useProjects, type Project } from "../_lib/store";
import { shortDate } from "../_lib/ui";

/* Every live brand deal (a job that isn't tech UGC), soonest due first, each
   opening straight into its Studio - to add its files and make its edits. */

function liveDeals(projects: Project[]) {
  return projects
    .filter((p) => !p.techStage && p.stage !== "Paid" && !isArchived(p))
    .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || a.brand.localeCompare(b.brand));
}

export function BrandDeals() {
  const { projects } = useProjects();
  const ready = useDataReady();
  const deals = liveDeals(projects);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="space-y-3" aria-label="Brand deals">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Brand deals</h2>
          <p className="text-sm text-text-muted">Open one to add its brief and files, and edit its videos on your Mac.</p>
        </div>
        <Link href="/hub/projects?new=1" className="text-sm text-accent hover:underline">
          + New brand deal
        </Link>
      </div>
      {ready && deals.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-strong bg-bg-card p-4 text-sm text-text-muted">
          No brand deals on the go. Add one with <span className="font-medium">+ New brand deal</span>, then open it here to make its edits.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {deals.map((p) => {
            const late = Boolean(p.due && p.due < today && p.stage !== "Delivered");
            return (
              <Link key={p.id} href={`/hub/projects/${p.id}/studio`} className="min-w-0 rounded-xl border border-border bg-bg-card p-4 transition hover:border-border-strong">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-medium">{p.brand || "Untitled"}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${p.stage === "Filming" || p.stage === "Scripting" ? "bg-accent-soft font-medium text-accent" : "bg-text/5 text-text-dim"}`}>{p.stage}</span>
                </div>
                {p.title && <p className="truncate text-sm text-text-muted">{p.title}</p>}
                {p.due && <p className={`mt-2 text-xs ${late ? "font-medium text-warn" : "text-text-dim"}`}>{late ? `Was due ${shortDate(p.due)}` : `Due ${shortDate(p.due)}`}</p>}
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
