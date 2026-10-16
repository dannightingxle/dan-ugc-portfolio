"use client";

import Link from "next/link";
import { useProjects } from "../_lib/store";
import { TechJobs } from "./tech-jobs";
import { useFeature } from "../account-provider";

/* Where Studio starts: personal brand first, then each tech UGC job. */
export function StudioHome({ jobs, brand }: { jobs: boolean; brand: boolean }) {
  const { projects } = useProjects();
  const edits = useFeature("edits");
  const accounts = useFeature("accounts");
  const otherJobs = projects.filter((p) => !p.techStage && p.stage !== "Paid");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-4xl italic sm:text-5xl">Studio</h1>
        <p className="mt-2 text-text-muted">Plans, scripts and shoot sheets - for your own brand and every job.</p>
        {edits && (
          <Link href="/hub/studio/helper" className="mt-2 inline-block text-sm text-accent hover:underline">
            Mac helper - edit in CapCut from your edit cards →
          </Link>
        )}
      </div>

      {brand && (
        <Link href="/hub/studio/brand" className="block rounded-2xl border border-accent/30 bg-accent-soft p-5 transition hover:border-accent">
          <p className="font-semibold text-accent">Personal brand</p>
          <p className="mt-1 text-sm text-text-muted">This week&apos;s plan from your top posts and the creators you track.</p>
        </Link>
      )}

      {accounts && (
        <Link href="/hub/studio/accounts" className="block rounded-2xl border border-border bg-bg-card p-5 transition hover:border-accent">
          <p className="font-semibold">Accounts</p>
          <p className="mt-1 text-sm text-text-muted">Followers, views and the latest posts for your own accounts and every tech UGC job.</p>
        </Link>
      )}

      {jobs && (
        <div className="space-y-3">
          <TechJobs title="Tech UGC jobs" />
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
        </div>
      )}
    </div>
  );
}
