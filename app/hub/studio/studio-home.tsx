"use client";

import Link from "next/link";
import { useDataReady, useProjects } from "../_lib/store";

/* Where Studio starts: personal brand first, then each tech UGC job. */
export function StudioHome({ jobs, brand }: { jobs: boolean; brand: boolean }) {
  const { projects } = useProjects();
  const ready = useDataReady();
  const techJobs = projects.filter((p) => p.techStage && p.techStage !== "Ended");
  const otherJobs = projects.filter((p) => !p.techStage && p.stage !== "Paid");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-4xl italic sm:text-5xl">Studio</h1>
        <p className="mt-2 text-text-muted">Plans, scripts and shoot sheets - for your own brand and every job.</p>
      </div>

      {brand && (
        <Link href="/hub/studio/brand" className="block rounded-2xl border border-accent/30 bg-accent-soft p-5 transition hover:border-accent">
          <p className="font-semibold text-accent">Personal brand</p>
          <p className="mt-1 text-sm text-text-muted">This week&apos;s plan from your top posts and the creators you track.</p>
        </Link>
      )}

      {jobs && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-lg font-semibold">Tech UGC jobs</h2>
            <Link href="/hub/projects?new=1" className="text-sm text-accent hover:underline">
              + New job
            </Link>
          </div>
          {ready && techJobs.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border-strong bg-bg-card p-4 text-sm text-text-muted">
              No tech jobs yet. Add a project, set its <span className="font-medium">Tech UGC stage</span>, then open its Studio.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {techJobs.map((p) => (
                <Link key={p.id} href={`/hub/projects/${p.id}/studio`} className="rounded-xl border border-border bg-bg-card p-4 transition hover:border-border-strong">
                  <p className="text-xs text-text-dim">{p.techStage}</p>
                  <p className="font-medium">{p.brand || "Untitled"}</p>
                  {p.title && <p className="truncate text-sm text-text-muted">{p.title}</p>}
                  {p.waitingOn && <p className="mt-2 truncate text-xs text-warn">Waiting: {p.waitingOn}</p>}
                </Link>
              ))}
            </div>
          )}
          {otherJobs.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-text-muted">Brand deals ({otherJobs.length}) - every project has a Studio too</summary>
              <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-bg-card">
                {otherJobs.map((p) => (
                  <li key={p.id}>
                    <Link href={`/hub/projects/${p.id}/studio`} className="block px-4 py-2.5 hover:bg-bg-elevated">
                      {p.brand} <span className="text-text-dim">{p.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
