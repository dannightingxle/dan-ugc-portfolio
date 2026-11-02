"use client";

import Link from "next/link";
import { TechJobs } from "./tech-jobs";
import { BrandDeals } from "./brand-deals";
import { useFeature } from "../account-provider";

/* Where Studio starts: your tools as cards - planning and posting, then editing in CapCut - then each tech UGC job and brand deal. */

const ICONS = {
  brand: "M12 3l1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z",
  calendar: "M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M8 14h.01 M12 14h.01 M16 14h.01 M8 18h.01 M12 18h.01",
  accounts: "M3 3v18h18 M7 16v-4 M12 16V8 M17 16v-7",
  edits: "M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z M7 4v16 M17 4v16 M3 9h4 M3 15h4 M17 9h4 M17 15h4",
  helper: "M5 5h14a1 1 0 0 1 1 1v9H4V6a1 1 0 0 1 1-1z M2 19h20 M10 19l.5-4h3l.5 4",
  notes: "M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  styles: "M12 3a9 9 0 1 0 0 18c.9 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.3-4-7.8-9-7.8z M7.5 11.5h.01 M9.5 7.5h.01 M14.5 7.5h.01 M17 11h.01",
  setup: "M21 12a9 9 0 0 1-15 6.7L3 16 M3 12a9 9 0 0 1 15-6.7L21 8 M21 3v5h-5 M3 21v-5h5",
} as const;

function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** One of your tools: an icon, what it is and what it's for. "feature" cards are the bigger ones at the top. */
function Tool({ href, icon, title, about, feature, highlight }: { href: string; icon: keyof typeof ICONS; title: string; about: string; feature?: boolean; highlight?: boolean }) {
  return (
    <Link
      href={href}
      className={`group relative flex gap-4 rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:border-accent hover:shadow-md ${feature ? "sm:flex-col sm:gap-6 sm:p-5" : "items-center"} ${
        highlight ? "border-accent/30 bg-gradient-to-br from-accent-soft to-bg-card" : "border-border bg-bg-card"
      }`}
    >
      <span className={`grid shrink-0 place-items-center rounded-xl ${feature ? "h-11 w-11" : "h-10 w-10"} ${highlight ? "bg-accent text-on-accent" : "bg-accent-soft text-accent"}`}>
        <Icon d={ICONS[icon]} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block font-semibold ${highlight ? "text-accent" : ""}`}>{title}</span>
        <span className="mt-0.5 block text-sm text-text-muted">{about}</span>
      </span>
      <Icon d="M9 6l6 6-6 6" className={`h-4 w-4 shrink-0 text-text-dim transition group-hover:translate-x-0.5 group-hover:text-accent ${feature ? "absolute right-4 top-5" : ""}`} />
    </Link>
  );
}

export function StudioHome({ jobs, brand }: { jobs: boolean; brand: boolean }) {
  const edits = useFeature("edits");
  const accounts = useFeature("accounts");
  const calendar = useFeature("calendar");
  const planning = [brand, calendar, accounts].filter(Boolean).length;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-serif text-4xl italic sm:text-5xl">Studio</h1>
        <p className="mt-2 text-text-muted">Plans, scripts, shoot sheets and edits - for your own brand and every job.</p>
      </div>

      {planning > 0 && (
        <section aria-label="Plan and post" className={`grid gap-3 sm:grid-cols-2 ${planning > 2 ? "lg:grid-cols-3" : ""}`}>
          {brand && <Tool feature highlight href="/hub/studio/brand" icon="brand" title="Personal brand" about="This week's plan from your top posts and the creators you track." />}
          {calendar && <Tool feature href="/hub/studio/calendar" icon="calendar" title="Calendar" about="What's going out on Buffer, the gaps to fill, and how your last posts did." />}
          {accounts && <Tool feature href="/hub/studio/accounts" icon="accounts" title="Accounts" about="Followers, views and the latest posts for your own accounts and every tech UGC job." />}
        </section>
      )}

      {edits && (
        <section aria-labelledby="studio-editing" className="space-y-3">
          <div>
            <h2 id="studio-editing" className="text-lg font-semibold">
              Editing in CapCut
            </h2>
            <p className="text-sm text-text-muted">Your Mac edits each video with Claude Code, the way you like it.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Tool href="/hub/studio/edits" icon="edits" title="All edits" about="Every edit card, across all your jobs." />
            <Tool href="/hub/studio/helper" icon="helper" title="Mac helper" about="Connect your Macs to edit in CapCut from the cards." />
            <Tool href="/hub/studio/notes" icon="notes" title="Editing notes" about="Feedback every edit follows." />
            <Tool href="/hub/studio/styles" icon="styles" title="Edit styles" about="How each kind of video looks." />
            <Tool href="/hub/studio/setup" icon="setup" title="Editing setup" about="Your CLAUDE.md, skills and memory on every Mac." />
          </div>
        </section>
      )}

      {jobs && <TechJobs title="Tech UGC jobs" />}
      {jobs && <BrandDeals />}
    </div>
  );
}
