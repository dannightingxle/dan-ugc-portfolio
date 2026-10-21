"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { STATUS_LABEL, WHOLE_SHEET, type EditStatus } from "../../_lib/edits/types";
import { editHref } from "../../_lib/studio/tasks-client";
import { input } from "../../projects/fields";
import { call } from "../../projects/[id]/studio/studio";

/* Every job's edits (and the personal brand's) in one list, newest first in
   each group: what needs you, what's ready to check in CapCut, what's being
   edited, and what's still to edit. Each opens its card on the job's Edits tab. */

type Edit = { id: string; projectId: string; brand: string; title: string; videoCode: string; status: EditStatus; updatedAt: string; createdAt: string; clips: number; draftName: string | null };

const GROUPS: { title: string; statuses: EditStatus[]; tone: string }[] = [
  { title: "Needs you", statuses: ["needs_you", "failed"], tone: "bg-warn-soft text-warn" },
  { title: "Ready to check", statuses: ["ready"], tone: "bg-good-soft text-good" },
  { title: "Editing now", statuses: ["editing", "queued"], tone: "bg-accent-soft text-accent" },
  { title: "To edit", statuses: ["todo"], tone: "bg-text/5 text-text-dim" },
  { title: "Done lately", statuses: ["done"], tone: "bg-good-soft text-good" },
];
const ago = (iso: string) => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`;
};

export function AllEdits() {
  const [edits, setEdits] = useState<Edit[] | null>(null);
  const [error, setError] = useState("");
  const [job, setJob] = useState("");
  // Check often while something's editing, gently otherwise.
  const busy = Boolean(edits?.some((e) => e.status === "editing" || e.status === "queued"));
  useEffect(() => {
    const tick = () => call<{ edits: Edit[] }>("/api/hub/edits/all", "GET").then((r) => (setEdits(r.edits), setError("")), (e: Error) => setError(e.message));
    void tick();
    const t = setInterval(tick, busy ? 5000 : 30000);
    return () => clearInterval(t);
  }, [busy]);

  const jobs = [...new Map((edits ?? []).map((e) => [e.projectId, e.brand])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const shown = (edits ?? []).filter((e) => !job || e.projectId === job);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/hub/studio" className="text-sm text-text-muted hover:text-accent">
          ← Studio
        </Link>
        <h1 className="mt-2 font-serif text-4xl italic sm:text-5xl">Edits</h1>
        <p className="mt-2 text-text-muted">Every job&apos;s edits in one place, newest first. Open one to pick clips, reply to Claude or check it.</p>
      </div>
      {jobs.length > 1 && (
        <select className={`${input} w-auto`} value={job} onChange={(e) => setJob(e.target.value)} aria-label="Job">
          <option value="">All jobs</option>
          {jobs.map(([id, brand]) => (
            <option key={id} value={id}>
              {brand}
            </option>
          ))}
        </select>
      )}
      {error && !edits && <p className="text-accent">{error}</p>}
      {!edits ? (
        !error && <p className="text-text-muted">Loading edits…</p>
      ) : shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-strong bg-bg-card p-4 text-sm text-text-muted">
          No edits yet. Make them on a job&apos;s Edits tab in Studio - from a shoot sheet, or a new edit in your own words.
        </p>
      ) : (
        GROUPS.map((g) => {
          const items = shown.filter((e) => g.statuses.includes(e.status)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
          if (!items.length) return null;
          return (
            <section key={g.title} aria-label={g.title} className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-text-dim">
                {g.title} <span className="font-normal">{items.length}</span>
              </h2>
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
                {items.map((e) => (
                  <li key={e.id}>
                    <Link href={editHref(e)} className="flex items-center gap-3 px-4 py-3 hover:bg-bg-elevated">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{[e.videoCode === WHOLE_SHEET ? "Whole sheet" : e.videoCode, e.title].filter(Boolean).join(" · ") || "Edit"}</span>
                        <span className="block truncate text-xs text-text-dim">
                          {e.brand} · {ago(e.updatedAt)}
                          {e.status === "todo" && ` · ${e.clips ? `${e.clips} clip${e.clips === 1 ? "" : "s"} picked` : "pick the clips"}`}
                          {e.draftName && e.status === "ready" && ` · ${e.draftName}`}
                        </span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${g.tone}`}>{STATUS_LABEL[e.status]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
