"use client";

import Link from "next/link";
import { useState } from "react";
import { useFeature } from "../../account-provider";
import { hasFiles, parseJobs, planImport, type ImportedFiles, type PlanItem } from "../../_lib/import-jobs";
import { useDataReady, useProjects, useSyncStatus } from "../../_lib/store";
import { readWorkspace, type Workspace } from "../../_lib/studio/types";
import { call } from "../[id]/studio/studio";
import { input } from "../fields";
import { type ClaudeProject, isTechProject, mapDocs, matchJob, projectToJob, readClaudeExport } from "../../_lib/claude-projects";
import type { Project } from "../../_lib/store";

/* Bring jobs in from a Claude chat or a file, or whole Claude Projects from a
   Claude export: preview what will be added or filled in, then import. Only
   empty fields are filled; notes are added to. */

export default function ImportPage() {
  const { projects, save, remove } = useProjects();
  const studio = useFeature("studio");
  const sync = useSyncStatus();
  // Matching needs the whole board: until it's loaded, every job would look new.
  const loaded = useDataReady() && sync !== "error";
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<PlanItem[] | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number; failed: string[] } | null>(null);

  function preview(source = text) {
    setError("");
    setPlan(null);
    if (!loaded) return setError(sync === "error" ? "Your board didn't load, so jobs can't be matched. Refresh the page and try again." : "Your board is still loading. Try again in a moment.");
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
            <button onClick={() => preview()} disabled={!text.trim() || !loaded} className="rounded-xl bg-accent px-5 py-2.5 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50">
              Preview
            </button>
            <label className="cursor-pointer rounded-xl border border-border px-4 py-2.5 text-sm hover:border-accent hover:text-accent">
              {loaded ? "Choose a file" : "Loading your board…"}
              <input type="file" accept=".json,.txt,.md,application/json,text/plain" disabled={!loaded} className="sr-only" onChange={(e) => readFile(e.target.files?.[0])} />
            </label>
          </div>
          {error && <p className="text-sm text-accent">{error}</p>}
        </div>
      )}

      {!progress && !plan && studio && loaded && <ClaudeProjects projects={projects} onPlan={setPlan} />}

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
  ws.template = take(ws.template, f.template);
  ws.account = { ...ws.account, handles: take(ws.account.handles, f.accountHandles), notes: take(ws.account.notes, f.accountNotes) };
  if (!ws.clientQuestions.length && f.clientQuestions.length) {
    ws.clientQuestions = f.clientQuestions;
    changed = true;
  }
  if (changed) await call(url, "PUT", ws);
}

const FILE_LABELS: Record<string, string> = { brief: "Brief", appNotes: "App notes", references: "References", winners: "Winners", scriptBank: "Script bank", template: "Shoot sheet template" };

/** Claude Projects from a Claude export: pick which job each one is, then preview. */
function ClaudeProjects({ projects, onPlan }: { projects: Project[]; onPlan: (plan: PlanItem[]) => void }) {
  const [found, setFound] = useState<ClaudeProject[] | null>(null);
  // Per project: "" = leave it, "new" = a new job, else the id of a job on the board.
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);

  async function choose(file: File | undefined) {
    if (!file) return;
    setError("");
    setReading(true);
    try {
      const list = await readClaudeExport(file);
      if (!list.length) throw new Error("No projects found in that file. Choose the zip Claude emailed you.");
      setFound(list);
      setPicks(Object.fromEntries(list.map((p) => [p.uuid, matchJob(p, projects)?.id ?? (isTechProject(p.name) ? "new" : "")])));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReading(false);
    }
  }

  function preview() {
    if (!found) return;
    const jobs = found.filter((p) => picks[p.uuid]).map((p) => projectToJob(p, picks[p.uuid] === "new" ? { new: true } : { id: picks[p.uuid] }));
    if (jobs.length) onPlan(planImport(projects, jobs));
  }

  const chosen = found ? found.filter((p) => picks[p.uuid]).length : 0;
  const board = [...projects].sort((a, b) => a.brand.localeCompare(b.brand));

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-bg-card p-4 sm:p-5">
      <div>
        <h2 className="font-semibold">Bring in your Claude Projects</h2>
        <p className="mt-1 text-sm text-text-muted">
          Already run a job from a Claude Project? Bring its instructions and files (brief, app notes, references, script bank and your shoot sheet template) straight into the
          job&apos;s Studio. In Claude, go to Settings, then Privacy, then Export data. Claude emails you a zip: choose it here. Only your projects are read - your chats are
          skipped and never leave this computer.
        </p>
      </div>
      <label className="inline-block cursor-pointer rounded-xl border border-border px-4 py-2.5 text-sm hover:border-accent hover:text-accent">
        {reading ? "Reading…" : found ? "Choose a different export" : "Choose your Claude export"}
        <input type="file" accept=".zip,.json,application/zip,application/json" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
      </label>
      {error && <p className="text-sm text-accent">{error}</p>}

      {found && (
        <>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {found.map((p) => {
              const { files, other } = mapDocs(p);
              const what = [p.instructions && "Instructions", ...Object.keys(files).map((k) => FILE_LABELS[k]), other.length && `${other.length} other ${other.length === 1 ? "file" : "files"}`].filter(Boolean);
              return (
                <li key={p.uuid} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-xs text-text-dim">{what.join(" · ") || "No files"}</p>
                  </div>
                  <select
                    aria-label={`Job for ${p.name}`}
                    className={`${input} w-full sm:w-56`}
                    value={picks[p.uuid] ?? ""}
                    onChange={(e) => setPicks({ ...picks, [p.uuid]: e.target.value })}
                  >
                    <option value="">Leave it</option>
                    <option value="new">Add as a new job</option>
                    {board.map((j) => (
                      <option key={j.id} value={j.id}>
                        {[j.brand, j.title].filter(Boolean).join(" · ")}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
          <button onClick={preview} disabled={!chosen} className="rounded-xl bg-accent px-5 py-2.5 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50">
            Preview {chosen} {chosen === 1 ? "project" : "projects"}
          </button>
        </>
      )}
    </div>
  );
}
