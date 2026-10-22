"use client";

import Link from "next/link";
import { TechJobs } from "./tech-jobs";
import { BrandDeals } from "./brand-deals";
import { useFeature } from "../account-provider";

/* Where Studio starts: personal brand first, then each tech UGC job and brand deal. */
export function StudioHome({ jobs, brand }: { jobs: boolean; brand: boolean }) {
  const edits = useFeature("edits");
  const accounts = useFeature("accounts");

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
        {edits && (
          <Link href="/hub/studio/edits" className="mt-2 ml-4 inline-block text-sm text-accent hover:underline">
            All edits →
          </Link>
        )}
        {edits && (
          <Link href="/hub/studio/notes" className="mt-2 ml-4 inline-block text-sm text-accent hover:underline">
            Editing notes - how you want your videos edited →
          </Link>
        )}
        {edits && (
          <Link href="/hub/studio/styles" className="mt-2 ml-4 inline-block text-sm text-accent hover:underline">
            Edit styles - how each kind of video looks →
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

      {jobs && <TechJobs title="Tech UGC jobs" />}
      {jobs && <BrandDeals />}
    </div>
  );
}
