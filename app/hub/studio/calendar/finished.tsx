"use client";

import { useState } from "react";
import { SERVICE_LABEL, type CalendarPost, type Channel, type ChannelGroup, type ScheduleResult } from "../../_lib/buffer/types";
import type { FinishedVideo } from "../../_lib/buffer/finished";
import { TextBox } from "../../_lib/text-box";
import { Busy, Spinner } from "../../_lib/ui";
import { AccountPicker, call, input, uploadVideo } from "./shared";

/* Schedule finished videos: pick everything you exported from CapCut, and
   Creator Desk works out what each one is from its name (the draft name the
   edit gave it), finds its caption on the shoot sheet and the job's Buffer
   accounts, and adds them to each account's queue in video order - Buffer's
   posting schedule decides the day and time. Then it checks the days. */

type Job = { id: string; brand: string };
type Row = FinishedVideo & {
  key: number;
  file: File;
  include: boolean;
  progress: number;
  path?: string;
  uploadError?: string;
  promise: Promise<string>;
  state: "waiting" | "scheduling" | "done" | "failed";
  results?: ScheduleResult[];
  error?: string;
};

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const dayKey = (iso: string) => new Date(iso).toDateString();
const perDay = (n: number | null) => (n == null ? "" : n === 1 ? "once a day" : n === 2 ? "twice a day" : `${n} a day`);

/** Up to three uploads at once, in the order the videos will post. */
function uploadAll(files: File[], onProgress: (i: number, pct: number) => void) {
  const done = files.map(() => {
    let resolve!: (p: string) => void, reject!: (e: Error) => void;
    const promise = new Promise<string>((res, rej) => ((resolve = res), (reject = rej)));
    promise.catch(() => {});
    return { promise, resolve, reject };
  });
  let next = 0;
  const lane = async () => {
    while (next < files.length) {
      const i = next++;
      const u = uploadVideo(files[i], (pct) => onProgress(i, pct));
      await u.promise.then(done[i].resolve, done[i].reject);
    }
  };
  for (let k = 0; k < 3; k++) void lane();
  return done.map((d) => d.promise);
}

export function FinishedVideos({ channels, groups, scheduled, onScheduled, onDone }: { channels: Channel[]; groups: ChannelGroup[]; scheduled: CalendarPost[]; onScheduled: () => void; onDone: () => void }) {
  const usable = channels.filter((c) => !c.isDisconnected && !c.isLocked);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  // Accounts for each job, as you leave them here (saved for next time when you schedule).
  const [accounts, setAccounts] = useState<Record<string, string[]>>({});
  const [matching, setMatching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [finished, setFinished] = useState(false);
  // What was already in the queue when you pressed the button (the calendar refreshes with these posts in it afterwards).
  const [before, setBefore] = useState<CalendarPost[]>([]);

  const patch = (key: number, p: Partial<Row>) => setRows((rs) => rs && rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  async function pick(files: File[]) {
    if (!files.length) return;
    setError("");
    setFinished(false);
    setMatching(true);
    try {
      const r = await call<{ videos: FinishedVideo[]; jobs: Job[] }>("/api/hub/buffer/finished", { method: "POST", body: JSON.stringify({ names: files.map((f) => f.name) }) });
      setJobs(r.jobs);
      // The server puts them in posting order; the files follow.
      const ordered = r.videos.map((v) => files.find((f) => f.name === v.name)!).filter(Boolean);
      const base = Date.now();
      const keys = ordered.map((_, i) => base + i);
      const promises = uploadAll(ordered, (i, progress) => patch(keys[i], { progress }));
      const next: Row[] = r.videos.map((v, i) => ({ ...v, key: keys[i], file: ordered[i], include: !v.alreadyQueued, progress: 0, promise: promises[i], state: "waiting" }));
      next.forEach((row) =>
        row.promise.then(
          (path) => patch(row.key, { path, progress: 100 }),
          (e: Error) => patch(row.key, { uploadError: e.message }),
        ),
      );
      setAccounts(Object.fromEntries(r.videos.filter((v) => v.projectId).map((v) => [v.projectId!, v.channelIds])));
      setRows(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMatching(false);
    }
  }

  /** You've said which job a video is for: match it again for that job (its caption and accounts). */
  async function setJob(row: Row, projectId: string) {
    try {
      const r = await call<{ videos: FinishedVideo[] }>("/api/hub/buffer/finished", { method: "POST", body: JSON.stringify({ names: [row.name], jobFor: { [row.name]: projectId } }) });
      const v = r.videos[0];
      if (!v) return;
      patch(row.key, { ...v, key: row.key, file: row.file, include: !v.alreadyQueued });
      setAccounts((a) => (a[projectId]?.length ? a : { ...a, [projectId]: v.channelIds }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const accountsFor = (row: Row) => (row.projectId ? (accounts[row.projectId] ?? []) : []);
  const included = (rows ?? []).filter((r) => r.include && r.state !== "done");
  const blocked = included.filter((r) => !r.projectId || !r.caption.trim() || !accountsFor(r).length || r.uploadError);

  async function schedule() {
    if (!rows || busy) return;
    setBusy(true);
    setError("");
    setBefore(scheduled);
    try {
      // Each job's accounts are kept for next time.
      const jobIds = [...new Set(included.map((r) => r.projectId!))];
      await Promise.all(jobIds.map((projectId) => call("/api/hub/buffer/finished", { method: "PUT", body: JSON.stringify({ projectId, channelIds: accounts[projectId] ?? [] }) })));
      // One after another, in posting order, so each account's queue fills V1, V2, V3…
      for (const row of included) {
        patch(row.key, { state: "scheduling", error: undefined });
        try {
          const videoPath = await row.promise;
          const r = await call<{ results: ScheduleResult[] }>("/api/hub/buffer/posts", {
            method: "POST",
            body: JSON.stringify({ channelIds: accountsFor(row), text: row.caption, when: "queue", videoPath }),
          });
          patch(row.key, { state: r.results.every((x) => x.ok) ? "done" : "failed", results: r.results });
        } catch (e) {
          patch(row.key, { state: "failed", error: (e as Error).message });
        }
      }
      setFinished(true);
      onScheduled();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Grouped by job, in posting order.
  const byJob = new Map<string, Row[]>();
  for (const r of rows ?? []) byJob.set(r.projectId ?? "", [...(byJob.get(r.projectId ?? "") ?? []), r]);

  return (
    <section aria-label="Schedule finished videos" className="rounded-2xl border border-accent/30 bg-bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Schedule finished videos</h2>
          <p className="mt-1 max-w-2xl text-sm text-text-muted">
            Pick the videos you exported from CapCut. Each one is matched by its name to its job and caption, then added to the job&apos;s accounts&apos; queues in video order - your Buffer posting schedule picks the
            days and times.
          </p>
        </div>
        <button type="button" onClick={onDone} className="rounded-xl border border-border px-4 py-1.5 text-sm hover:border-accent hover:text-accent">
          {finished ? "Done" : "Close"}
        </button>
      </div>

      {!rows && (
        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border-strong p-8 text-center text-sm transition hover:border-accent">
          <input
            type="file"
            multiple
            accept="video/mp4,video/quicktime,video/webm"
            className="sr-only"
            aria-label="Finished videos"
            onChange={(e) => void pick([...(e.target.files ?? [])])}
          />
          {matching ? (
            <span className="flex items-center gap-2 text-text-muted">
              <Spinner /> Matching them to their captions…
            </span>
          ) : (
            <>
              <span className="font-medium">Choose your finished videos</span>
              <span className="text-xs text-text-muted">All of them at once - named as CapCut exported them (e.g. &quot;SOL V3&quot;). They upload while you check them.</span>
            </>
          )}
        </label>
      )}

      {rows && (
        <div className="mt-5 space-y-6">
          {[...byJob.entries()].map(([projectId, list]) => {
            const job = list[0];
            const picked = projectId ? (accounts[projectId] ?? []) : [];
            return (
              <div key={projectId || "none"} role="group" aria-label={projectId ? `${job.brand} videos` : "Videos not matched"} className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
                  <h3 className="font-semibold">
                    {projectId ? job.brand : "Not matched to a job"}{" "}
                    <span className="text-sm font-normal text-text-muted">
                      · {list.length} video{list.length === 1 ? "" : "s"}
                      {job.videosPerDay ? ` · ${perDay(job.videosPerDay)}` : ""}
                    </span>
                  </h3>
                </div>
                {projectId && (
                  <div className="space-y-2 rounded-xl border border-border bg-bg-elevated/40 p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="text-sm font-semibold">Posts to</p>
                      <p className="text-xs text-text-muted">
                        {job.channelsFrom === "saved"
                          ? `Saved for ${job.brand} - change it here, or on the job's Account tab.`
                          : `Suggested from ${job.brand}'s handles - tick every account this job posts to. It's saved for next time when you schedule.`}
                      </p>
                    </div>
                    <AccountPicker label={`${job.brand} accounts`} channels={usable} value={picked} onChange={(ids) => setAccounts((a) => ({ ...a, [projectId]: ids }))} groups={groups} disabled={busy || finished} />
                  </div>
                )}
                <ul className="space-y-3">
                  {list.map((row) => (
                    <VideoRow key={row.key} row={row} jobs={jobs} channels={channels} locked={busy || finished} onChange={(p) => patch(row.key, p)} onJob={(id) => void setJob(row, id)} />
                  ))}
                </ul>
              </div>
            );
          })}

          {!finished ? (
            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => void schedule()}
                disabled={busy || !included.length || blocked.length > 0}
                className="rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60"
              >
                <Busy busy={busy} label="Adding them to the queue…">
                  Add {included.length} video{included.length === 1 ? "" : "s"} to the queue
                </Busy>
              </button>
              <p className="text-xs text-text-dim">
                {blocked.length
                  ? `${blocked.length} still need${blocked.length === 1 ? "s" : ""} a job, caption or accounts (or didn't upload) - fix ${blocked.length === 1 ? "it" : "them"} or untick ${blocked.length === 1 ? "it" : "them"}.`
                  : "Each goes in its accounts' next free slot, in the order shown."}
              </p>
            </div>
          ) : (
            <Check rows={rows} channels={channels} scheduled={before} />
          )}
          {error && <p className="text-sm text-accent">{error}</p>}
        </div>
      )}
      {!rows && error && <p className="mt-3 text-sm text-accent">{error}</p>}
    </section>
  );
}

function VideoRow({ row, jobs, channels, locked, onChange, onJob }: { row: Row; jobs: Job[]; channels: Channel[]; locked: boolean; onChange: (p: Partial<Row>) => void; onJob: (id: string) => void }) {
  const name = (id: string) => {
    const c = channels.find((x) => x.id === id);
    return c ? `${SERVICE_LABEL[c.service] ?? c.service}` : id;
  };
  return (
    <li aria-label={row.name} className={`rounded-xl border p-3 ${row.include ? "border-border bg-bg" : "border-border/60 bg-bg opacity-60"}`}>
      <div className="flex flex-wrap items-start gap-3">
        <input type="checkbox" aria-label={`Schedule ${row.name}`} checked={row.include} disabled={locked} onChange={(e) => onChange({ include: e.target.checked })} className="mt-1" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm">
            <span className="font-medium">{row.name}</span>
            {row.code && (
              <span className="text-text-muted">
                {" "}
                → {row.code}
                {row.title ? ` · ${row.title}` : ""}
              </span>
            )}
            <span className="ml-2 text-xs text-text-dim">{row.uploadError ? "didn't upload" : row.path ? "uploaded ✓" : `uploading ${row.progress}%`}</span>
          </p>
          {row.alreadyQueued && <p className="text-xs text-accent">Already in the queue with this caption - left out. Tick it to schedule it again.</p>}
          {row.uploadError && <p className="text-xs text-accent">{row.uploadError}</p>}
          {!row.projectId && (
            <select aria-label={`Job for ${row.name}`} className={`${input} w-auto`} defaultValue="" disabled={locked} onChange={(e) => e.target.value && onJob(e.target.value)}>
              <option value="">Which job is it for?</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.brand}
                </option>
              ))}
            </select>
          )}
          {row.projectId && !row.caption.trim() && row.state === "waiting" && <p className="text-xs text-accent">{row.problem || "No caption found - write one below."}</p>}
          <TextBox aria-label={`Caption for ${row.name}`} rows={3} className={input} value={row.caption} onValue={(caption) => onChange({ caption })} placeholder="Caption and hashtags" disabled={locked} />
          {row.state === "scheduling" && (
            <p className="flex items-center gap-2 text-xs text-text-muted">
              <Spinner /> Adding it to the queue…
            </p>
          )}
          {row.error && <p className="text-xs text-accent">{row.error}</p>}
          {row.results && (
            <ul className="space-y-0.5 text-xs">
              {row.results.map((r) => (
                <li key={r.channelId} className={r.ok ? "text-good" : "text-accent"}>
                  {r.ok ? "✓" : "✗"} {name(r.channelId)}: {r.ok ? (r.dueAt ? when(r.dueAt) : "in the queue") : r.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}

/** After scheduling: how many went in, and each job's days - flagging a day with more than the job's videos a day. */
function Check({ rows, channels, scheduled }: { rows: Row[]; channels: Channel[]; scheduled: CalendarPost[] }) {
  const tried = rows.filter((r) => r.state === "done" || r.state === "failed");
  const ok = tried.filter((r) => r.state === "done");
  const issues: string[] = [];
  const lines: string[] = [];
  const jobs = [...new Set(ok.map((r) => r.projectId!))];
  for (const projectId of jobs) {
    const list = ok.filter((r) => r.projectId === projectId);
    const limit = list[0].videosPerDay;
    const times = list.flatMap((r) => (r.results ?? []).filter((x): x is Extract<ScheduleResult, { ok: true }> => x.ok && Boolean(x.dueAt)).map((x) => ({ channelId: x.channelId, at: x.dueAt! })));
    if (!times.length) continue;
    const sorted = times.map((t) => t.at).sort();
    lines.push(`${list[0].brand}: ${list.length} video${list.length === 1 ? "" : "s"}, ${day(sorted[0])}${sorted.length > 1 && dayKey(sorted[0]) !== dayKey(sorted.at(-1)!) ? ` to ${day(sorted.at(-1)!)}` : ""}`);
    if (limit) {
      // Posts per account per day - what was already there plus these.
      const counts = new Map<string, number>();
      const add = (channelId: string, at: string) => counts.set(`${channelId}|${dayKey(at)}`, (counts.get(`${channelId}|${dayKey(at)}`) ?? 0) + 1);
      for (const t of times) add(t.channelId, t.at);
      const mine = new Set(times.map((t) => t.channelId));
      const newDays = new Set(times.map((t) => `${t.channelId}|${dayKey(t.at)}`));
      for (const p of scheduled) if (p.at && mine.has(p.channelId) && newDays.has(`${p.channelId}|${dayKey(p.at)}`)) add(p.channelId, p.at);
      for (const [k, n] of counts) {
        if (n <= limit) continue;
        const [channelId, d] = k.split("|");
        const c = channels.find((x) => x.id === channelId);
        issues.push(`${n} posts on ${day(new Date(d).toISOString())} for ${list[0].brand} on ${SERVICE_LABEL[c?.service ?? ""] ?? c?.service} - the job is ${perDay(limit)}. Check that account's posting schedule in Buffer.`);
      }
    }
  }
  const failed = tried.length - ok.length;
  return (
    <div role="status" aria-label="Scheduling check" className={`space-y-2 rounded-xl p-4 text-sm ${failed || issues.length ? "bg-accent-soft" : "bg-good/10"}`}>
      <p className={`font-semibold ${failed ? "text-accent" : "text-good"}`}>
        {failed ? `${ok.length} of ${tried.length} scheduled - ${failed} didn't go (see below; fix and press again)` : `✓ All ${ok.length} scheduled`}
      </p>
      {lines.map((l) => (
        <p key={l}>{l}</p>
      ))}
      {issues.map((l) => (
        <p key={l} className="text-accent">
          ⚠ {l}
        </p>
      ))}
      {!issues.length && ok.length > 0 && <p className="text-text-muted">No account has more on a day than its job posts a day.</p>}
    </div>
  );
}
