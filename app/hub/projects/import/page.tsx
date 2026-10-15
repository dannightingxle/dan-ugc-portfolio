"use client";

import Link from "next/link";
import { useState } from "react";
import { useFeature } from "../../account-provider";
import { hasFiles, parseJobs, planImport, type ImportedFiles, type PlanItem } from "../../_lib/import-jobs";
import { useProjects, useSyncStatus } from "../../_lib/store";
import { readWorkspace, type Workspace } from "../../_lib/studio/types";
import { call } from "../[id]/studio/studio";
import { input } from "../fields";

/* Bring jobs in from a Claude chat or a file: preview what will be added or
   filled in, then import. Only empty fields are filled; notes are added to. */

export default function ImportPage() {
  const { projects, save, remove } = useProjects();
  const studio = useFeature("studio");
  const sync = useSyncStatus();
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<PlanItem[] | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number; failed: string[] } | null>(null);

  function preview(source = text) {
    setError("");
    setPlan(null);
    try {
      const jobs = parseJobs(source);
      if (!jobs.length) throw new Error("No jobs found in that - each one needs at least a brand.");
      setPlan(planImport(projects, jobs));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    const t = await file.text();
    setText(t);
    preview(t);
  }

  async function run() {
    if (!plan) return;
    const work = plan.filter((i) => !i.missing && (i.remove || i.isNew || i.changed.length || (studio && hasFiles(i.files))));
    setProgress({ done: 0, total: work.length, failed: [] });
    const failed: string[] = [];
    for (const [n, item] of work.entries()) {
      if (item.remove) remove(item.project.id);
      else if (item.isNew || item.changed.length) save(item.project);
      if (!item.remove && studio && hasFiles(item.files)) {
        try {
          await fillWorkspace(item.project.id, item.files);
        } catch (e) {
          failed.push(`${item.brand}: Studio files not saved (${e instanceof Error ? e.message : e})`);
        }
      }
      setProgress({ done: n + 1, total: work.length, failed: [...failed] });
    }
  }

  const finished = progress && progress.done === progress.total;
  const counts = plan && {
    added: plan.filter((i) => i.isNew).length,
    updated: plan.filter((i) => !i.isNew && i.changed.length).length,
    removed: plan.filter((i) => i.remove && !i.missing).length,
    missing: plan.filter((i) => i.missing).length,
    files: studio ? plan.filter((i) => hasFiles(i.files)).length : 0,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/hub/projects" className="text-sm text-text-muted hover:text-accent">
          ← Projects
        </Link>
        <h1 className="mt-2 font-serif text-4xl italic sm:text-5xl">Import jobs</h1>
        <p className="mt-2 text-text-muted">
          Paste the JSON from a Claude chat, or choose a file. Jobs already on your board are matched by brand and only their empty fields are filled - nothing you&apos;ve typed is
          overwritten.
        </p>
      </div>

      {!progress && (
        <div className="space-y-3 rounded-2xl border border-border bg-bg-card p-4 sm:p-5">
          <textarea
            rows={8}
            className={`${input} font-mono text-xs`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'[{ "brand": "Canva", "title": "...", "stage": "Delivered", ... }]'}
            aria-label="Jobs JSON"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => preview()} disabled={!text.trim()} className="rounded-xl bg-accent px-5 py-2.5 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50">
              Preview
            </button>
            <label className="cursor-pointer rounded-xl border border-border px-4 py-2.5 text-sm hover:border-accent hover:text-accent">
              Choose a file
              <input type="file" accept=".json,.txt,.md,application/json,text/plain" className="sr-only" onChange={(e) => readFile(e.target.files?.[0])} />
            </label>
          </div>
          {error && <p className="text-sm text-accent">{error}</p>}
        </div>
      )}

      {plan && counts && !progress && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-text-muted">
              <span className="font-semibold text-text">{counts.added}</span> new, <span className="font-semibold text-text">{counts.updated}</span> filled in
              {counts.removed > 0 && (
                <>
                  , <span className="font-semibold text-text">{counts.removed}</span> removed
                </>
              )}
              {counts.missing > 0 && (
                <>
                  , <span className="font-semibold text-text">{counts.missing}</span> not found on your board
                </>
              )}
              {counts.files > 0 && (
                <>
                  , Studio files for <span className="font-semibold text-text">{counts.files}</span>
                </>
              )}
            </p>
            <button onClick={run} className="rounded-xl bg-accent px-5 py-2.5 font-medium text-on-accent hover:bg-accent-hover">
              {counts.removed === plan.length ? `Remove ${plan.length}` : `Import ${plan.length - counts.missing} ${plan.length - counts.missing === 1 ? "job" : "jobs"}`}
            </button>
          </div>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-bg-card">
            {plan.map((i) => (
              <li key={i.project.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    i.missing ? "bg-text/5 text-text-dim" : i.remove ? "bg-warn-soft text-warn" : i.isNew ? "bg-good-soft text-good" : i.changed.length ? "bg-accent-soft text-accent" : "bg-text/5 text-text-dim"
                  }`}
                >
                  {i.missing ? "Not found" : i.remove ? "Remove" : i.isNew ? "New" : i.changed.length ? "Update" : "No change"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{i.brand}</p>
                  <p className="truncate text-xs text-text-dim">
                    {[i.project.techStage ? `Tech · ${i.project.techStage}` : i.project.stage, i.project.title].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className="w-full text-xs text-text-dim sm:w-auto">
                  {!i.isNew && i.changed.length > 0 && `Updates ${i.changed.join(", ")}`}
                  {!i.remove && studio && hasFiles(i.files) && `${!i.isNew && i.changed.length ? " · " : ""}+ Studio files`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {progress && (
        <div className="space-y-3 rounded-2xl border border-border bg-bg-card p-5">
          <p className="font-medium">
            {finished && sync !== "saving" ? "Done." : `Importing… ${progress.done} of ${progress.total}`}
            {finished && sync === "saving" && " Saving the last few…"}
          </p>
          {sync === "error" && <p className="text-sm text-accent">Some jobs didn&apos;t save. Check your connection and import again - it won&apos;t make duplicates.</p>}
          {progress.failed.map((f) => (
            <p key={f} className="text-sm text-accent">
              {f}
            </p>
          ))}
          {finished && sync !== "saving" && (
            // A full load, so every page picks up the imported jobs.
            <a href="/hub" className="inline-block rounded-xl bg-accent px-5 py-2.5 font-medium text-on-accent hover:bg-accent-hover">
              Go to your dashboard
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/** Fill only the empty parts of a job's Studio workspace. */
async function fillWorkspace(projectId: string, f: ImportedFiles) {
  const url = `/api/hub/studio/${projectId}`;
  const { workspace } = await call<{ workspace: Workspace }>(url, "GET");
  const ws = readWorkspace(workspace);
  let changed = false;
  const take = (current: string, next: string) => {
    if (!next || (current && !(f.replaceShorter && next.length > current.length))) return current;
    changed = true;
    return next;
  };
  ws.instructions = take(ws.instructions, f.instructions);
  ws.files = {
    brief: take(ws.files.brief, f.brief),
    appNotes: take(ws.files.appNotes, f.appNotes),
    references: take(ws.files.references, f.references),
    winners: take(ws.files.winners, f.winners),
    scriptBank: take(ws.files.scriptBank, f.scriptBank),
  };
  ws.account = { ...ws.account, handles: take(ws.account.handles, f.accountHandles), notes: take(ws.account.notes, f.accountNotes) };
  if (!ws.clientQuestions.length && f.clientQuestions.length) {
    ws.clientQuestions = f.clientQuestions;
    changed = true;
  }
  if (changed) await call(url, "PUT", ws);
}
