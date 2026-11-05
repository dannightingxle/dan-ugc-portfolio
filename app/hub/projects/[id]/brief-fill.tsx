"use client";

import { useState } from "react";
import type { BriefFillResult } from "../../_lib/studio/jobs";
import { useElapsed, useTask, useTasks } from "../../_lib/studio/tasks-client";
import { FilePicker, useUploading, type Upload } from "../../_lib/attachments";
import { reloadProject } from "../../_lib/store";
import { TextBox } from "../../_lib/text-box";
import { Busy, Spinner } from "../../_lib/ui";
import { input } from "../fields";

/* "Set it up from the brief": paste or attach what the client sent and
   Claude fills the job in - what to make, the messages, the do's and don'ts,
   the dates, any contact and fee it hasn't got - with to-dos and questions
   for the client. Runs in the background; Undo puts the job back. */

export function BriefFillBox({ projectId, brand }: { projectId: string; brand: string }) {
  const api = `/api/hub/studio/${projectId}/brief`;
  const { start } = useTasks();
  const task = useTask(projectId, "brief");
  const uploading = useUploading();
  const [open, setOpen] = useState(false);
  const [material, setMaterial] = useState("");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [pickerKey, setPickerKey] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [undone, setUndone] = useState<string | null>(null);
  const running = sending || task?.status === "running";
  const elapsed = useElapsed(task?.startedAt, task?.status === "running");
  const result = task?.status === "done" && task.finishedAt !== undone ? (task.result as BriefFillResult | null) : null;

  async function fill(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      await start(api, { material, uploads });
      setMaterial("");
      setUploads([]);
      setPickerKey((k) => k + 1);
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function undo() {
    setError("");
    const res = await fetch(`${api}/undo`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setError(json.error ?? "Couldn't undo it.");
    setUndone(task?.finishedAt ?? "");
    await reloadProject(projectId);
  }

  return (
    <section aria-label="Set it up from the brief" className="space-y-3 rounded-2xl border border-accent/30 bg-accent-soft/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">Set it up from the brief</p>
          <p className="text-sm text-text-muted">Paste what {brand || "the client"} sent - the brief, an email or WhatsApp, links - or attach PDFs, screenshots or a video. Claude fills in the job.</p>
        </div>
        {!running && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="shrink-0 rounded-xl border border-accent/40 bg-bg-card px-4 py-2 text-sm font-medium text-accent hover:border-accent">
            {open ? "Close" : "Paste the brief"}
          </button>
        )}
      </div>

      {open && !running && (
        <form onSubmit={fill} className="space-y-3">
          <TextBox aria-label="What the client sent" rows={7} className={input} value={material} onValue={setMaterial} placeholder="Paste the brief, the email, the WhatsApp messages, links…" />
          <FilePicker key={pickerKey} accept="image/*,application/pdf,video/*" label="Screenshots, PDFs or videos (optional)" onChange={setUploads} />
          <button disabled={sending || uploading || (!material.trim() && !uploads.length)} className="rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60">
            <Busy busy={sending} label="Starting…">
              {uploading ? "Waiting for your files to upload…" : "Fill in the job"}
            </Busy>
          </button>
        </form>
      )}

      {task?.status === "running" && (
        <p className="flex items-center gap-2 text-sm text-text-muted">
          <Spinner /> {task.step && task.step !== "Starting" ? `${task.step}…` : "Reading the brief…"} {elapsed} · you can leave this page, it carries on.
        </p>
      )}
      {task?.status === "failed" && <p className="text-sm text-accent">{task.error}</p>}

      {result && (
        <div role="status" aria-label="Filled in from the brief" className="space-y-2 rounded-xl border border-border bg-bg-card p-3 text-sm">
          {result.summary && <p className="font-medium">{result.summary}</p>}
          <div className="flex flex-wrap items-center gap-1.5">
            {result.changes.length ? (
              result.changes.map((c) => (
                <span key={c} className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                  ✓ {c}
                </span>
              ))
            ) : (
              <span className="text-text-muted">Nothing new to fill in - the job already had it all.</span>
            )}
            {result.changes.length > 0 && (
              <button type="button" onClick={() => void undo()} className="ml-auto text-xs font-medium text-text-muted underline hover:text-accent">
                Undo
              </button>
            )}
          </div>
          {result.questions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-text-muted">Questions for {brand || "the client"} (also in the job&apos;s notes)</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {result.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          )}
          {result.couldntOpen.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-accent">Couldn&apos;t open</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-text-muted">
                {result.couldntOpen.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {error && <p className="text-sm text-accent">{error}</p>}
    </section>
  );
}
