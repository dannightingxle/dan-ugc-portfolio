"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CAPTION_LIMIT, SERVICE_LABEL, type CalendarData, type CalendarPost, type Channel, type ScheduleResult } from "../../_lib/buffer/types";
import { SUPABASE_KEY, SUPABASE_URL } from "../../_lib/supabase/config";
import { useConfirm } from "../../_lib/popups";
import { TextBox } from "../../_lib/text-box";
import { Busy, Spinner } from "../../_lib/ui";

/* Your Buffer schedule in Creator Desk: the next two weeks day by day (with
   the empty days to fill), posts that failed, how the last two weeks' posts
   did, and scheduling a video to one or more accounts. Comments stay in
   Buffer: its API doesn't do them. */

type Status = { connected: false } | { connected: true; organization: string; connectedAt: string };
type Loaded = { status: Status; calendar?: CalendarData; error?: string };

const input = "w-full rounded-xl border border-border bg-bg-card px-3 py-2 text-sm outline-none focus:border-accent";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Something went wrong (${res.status}).`);
  return json as T;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const short = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}K` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(Math.round(n)));
function ago(iso: string) {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

export function CalendarPage() {
  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const load = useCallback(async (refresh = false) => {
    setRefreshing(refresh);
    try {
      setData(await call<Loaded>(`/api/hub/buffer${refresh ? "?refresh=1" : ""}`));
      setLoadError("");
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/hub/studio" className="text-sm text-text-muted hover:text-accent">
            ← Studio
          </Link>
          <h1 className="mt-2 font-serif text-4xl italic sm:text-5xl">Calendar</h1>
          <p className="mt-2 text-text-muted">
            {data?.status.connected ? (
              <>
                Your Buffer schedule
                {data.calendar && (
                  <>
                    {" "}
                    · updated {ago(data.calendar.at)}
                  </>
                )}
              </>
            ) : (
              "Your Buffer schedule, the gaps to fill and how your posts did."
            )}
          </p>
        </div>
        {data?.status.connected && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void load(true)} disabled={refreshing} className="rounded-xl border border-border px-4 py-2 text-sm hover:border-accent hover:text-accent disabled:opacity-60">
              <Busy busy={refreshing} label="Checking Buffer…">
                Refresh
              </Busy>
            </button>
            <button onClick={() => setScheduling((s) => !s)} className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover">
              {scheduling ? "Close" : "+ Schedule a post"}
            </button>
          </div>
        )}
      </div>

      {loadError && <p className="rounded-xl border border-accent/30 bg-accent-soft p-3 text-sm text-accent">{loadError}</p>}
      {!data && !loadError && (
        <p className="flex items-center gap-2 text-sm text-text-muted">
          <Spinner /> Loading your calendar…
        </p>
      )}
      {data && !data.status.connected && <Connect onDone={() => void load()} />}
      {data?.status.connected && (
        <>
          {data.error && <p className="rounded-xl border border-accent/30 bg-accent-soft p-3 text-sm text-accent">{data.error}</p>}
          {scheduling && data.calendar && (
            <Schedule
              channels={data.calendar.channels}
              onDone={() => {
                setScheduling(false);
                void load(true);
              }}
            />
          )}
          {data.calendar && <Calendar calendar={data.calendar} />}
          <Disconnect organization={data.status.organization} onDone={() => void load()} />
        </>
      )}
    </div>
  );
}

/* ---- Connecting ---- */

function Connect({ onDone }: { onDone: () => void }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await call("/api/hub/buffer", { method: "POST", body: JSON.stringify({ apiKey: key }) });
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  const steps = [
    <>
      In Buffer, open{" "}
      <a href="https://publish.buffer.com/settings/api" target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
        Settings → API
      </a>
    </>,
    <>Create a new API key and copy it</>,
    <>Paste it here - it stays on Creator Desk&apos;s server, never in your browser</>,
  ];
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-bg-card">
      <div className="bg-gradient-to-br from-accent-soft to-bg-card p-6">
        <h2 className="text-xl font-semibold">Connect Buffer</h2>
        <p className="mt-1 max-w-xl text-sm text-text-muted">See everything you&apos;ve scheduled across your accounts, spot the empty days, check how posts did, and schedule videos without leaving Creator Desk.</p>
      </div>
      <div className="grid gap-6 p-6 md:grid-cols-2">
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-on-accent">{i + 1}</span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
        <form onSubmit={connect} className="space-y-3">
          <label className="block text-sm font-medium" htmlFor="buffer-key">
            Buffer API key
          </label>
          <input id="buffer-key" type="password" autoComplete="off" className={input} value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste your key" />
          <button disabled={busy || key.trim().length < 10} className="w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60">
            <Busy busy={busy} label="Checking with Buffer…">
              Connect
            </Busy>
          </button>
          {error && <p className="text-sm text-accent">{error}</p>}
        </form>
      </div>
    </section>
  );
}

function Disconnect({ organization, onDone }: { organization: string; onDone: () => void }) {
  const confirm = useConfirm();
  return (
    <p className="text-xs text-text-dim">
      Connected to Buffer ({organization}).{" "}
      <button
        className="underline hover:text-accent"
        onClick={async () => {
          if (!(await confirm({ title: "Disconnect Buffer?", message: "Creator Desk forgets your API key. Nothing in Buffer changes.", confirmLabel: "Disconnect" }))) return;
          await call("/api/hub/buffer", { method: "DELETE" }).catch(() => {});
          onDone();
        }}
      >
        Disconnect
      </button>
    </p>
  );
}

/* ---- The calendar ---- */

function Avatar({ channel, size = "h-6 w-6" }: { channel?: Channel; size?: string }) {
  if (!channel) return <span className={`${size} shrink-0 rounded-full bg-text/10`} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={channel.avatar} alt="" className={`${size} shrink-0 rounded-full border border-border object-cover`} />;
}

function Calendar({ calendar }: { calendar: CalendarData }) {
  const byId = useMemo(() => new Map(calendar.channels.map((c) => [c.id, c])), [calendar.channels]);
  const days = useMemo(() => {
    const out: { key: string; date: Date; posts: CalendarPost[] }[] = [];
    const start = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      out.push({ key: dayKey(d), date: d, posts: [] });
    }
    for (const p of calendar.scheduled) if (p.at) out.find((d) => d.key === dayKey(new Date(p.at!)))?.posts.push(p);
    return out;
  }, [calendar.scheduled]);
  const week = days.slice(0, 7).reduce((n, d) => n + d.posts.length, 0);
  const gaps = days.slice(0, 7).filter((d) => !d.posts.length).length;

  return (
    <div className="space-y-8">
      {calendar.failed.length > 0 && (
        <section aria-label="Failed posts" className="space-y-2 rounded-2xl border border-[#dc2626]/30 bg-[#dc2626]/5 p-4">
          <h2 className="font-semibold text-[#b91c1c]">{calendar.failed.length === 1 ? "1 post didn't go out" : `${calendar.failed.length} posts didn't go out`}</h2>
          {calendar.failed.map((p) => (
            <p key={p.id} className="flex items-start gap-2 text-sm">
              <Avatar channel={byId.get(p.channelId)} size="h-5 w-5" />
              <span>
                <span className="font-medium">{byId.get(p.channelId)?.name ?? SERVICE_LABEL[p.service] ?? p.service}</span>
                {p.at && <span className="text-text-muted"> · {new Date(p.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>}: {p.error ?? "Buffer couldn't publish it"} - fix it in Buffer.
              </span>
            </p>
          ))}
        </section>
      )}

      <section aria-label="Your accounts" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {calendar.channels.map((c) => {
          const next7 = days.slice(0, 7).reduce((n, d) => n + d.posts.filter((p) => p.channelId === c.id).length, 0);
          const problem = c.isDisconnected ? "Reconnect in Buffer" : c.isLocked ? "Locked in Buffer" : c.isQueuePaused ? "Queue paused" : "";
          return (
            <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-border bg-bg-card p-4">
              <Avatar channel={c} size="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{c.displayName || c.name}</p>
                <p className="truncate text-xs text-text-muted">
                  {SERVICE_LABEL[c.service] ?? c.service} · @{c.name}
                </p>
                {problem && <p className="mt-0.5 text-xs font-medium text-[#b91c1c]">{problem}</p>}
              </div>
              <div className="text-right">
                <p className="text-2xl font-semibold tabular-nums">{next7}</p>
                <p className="text-[11px] text-text-dim">{c.goal ? `of ${c.goal.goal} goal` : "next 7 days"}</p>
              </div>
            </div>
          );
        })}
      </section>

      <section aria-labelledby="cal-next" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="cal-next" className="text-lg font-semibold">
            Next two weeks
          </h2>
          <p className="text-sm text-text-muted">
            {week} {week === 1 ? "post" : "posts"} this week
            {gaps > 0 && (
              <>
                {" "}
                · <span className="font-medium text-accent">{gaps === 1 ? "1 empty day" : `${gaps} empty days`}</span>
              </>
            )}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
          {days.map((d, i) => (
            <div
              key={d.key}
              aria-label={`${d.date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}: ${d.posts.length} scheduled`}
              className={`min-h-28 rounded-xl border p-2.5 ${d.posts.length ? "border-border bg-bg-card" : "border-dashed border-border-strong bg-transparent"} ${i === 0 ? "ring-1 ring-accent/40" : ""}`}
            >
              <div className="flex items-baseline justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{i === 0 ? "Today" : d.date.toLocaleDateString("en-GB", { weekday: "short" })}</p>
                <p className="text-xs text-text-dim">{d.date.getDate()}</p>
              </div>
              {d.posts.length ? (
                <ul className="mt-2 space-y-1.5">
                  {d.posts.map((p) => (
                    <li key={p.id} className="flex items-start gap-1.5" title={p.text}>
                      <Avatar channel={byId.get(p.channelId)} size="h-4 w-4 mt-0.5" />
                      <span className="min-w-0 text-xs leading-snug">
                        <span className="font-medium tabular-nums">{p.at ? time(p.at) : ""}</span> <span className="line-clamp-2 text-text-muted">{p.text || (p.video ? "Video" : "Post")}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-6 text-center text-xs text-text-dim">Nothing yet</p>
              )}
            </div>
          ))}
        </div>
        {calendar.scheduled.length > days.reduce((n, d) => n + d.posts.length, 0) && (
          <p className="text-xs text-text-dim">Plus {calendar.scheduled.length - days.reduce((n, d) => n + d.posts.length, 0)} more later this month.</p>
        )}
      </section>

      <section aria-labelledby="cal-sent" className="space-y-3">
        <div>
          <h2 id="cal-sent" className="text-lg font-semibold">
            How the last two weeks did
          </h2>
          <p className="text-sm text-text-muted">From Buffer, which updates these about once a day. Reply to comments in Buffer or the app - Buffer&apos;s API doesn&apos;t do comments.</p>
        </div>
        {calendar.sent.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong p-4 text-sm text-text-muted">Nothing sent through Buffer in the last two weeks.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
            {calendar.sent.map((p) => (
              <SentRow key={p.id} post={p} channel={byId.get(p.channelId)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SentRow({ post, channel }: { post: CalendarPost; channel?: Channel }) {
  const m = post.metrics;
  const stats = m
    ? [
        ["views", m.views],
        ["likes", m.likes],
        ["comments", m.comments],
        ["shares", m.shares],
      ].filter((s): s is [string, number] => s[1] != null)
    : [];
  return (
    <li className="flex items-center gap-3 p-3">
      {post.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.thumbnail} alt="" className="h-14 w-10 shrink-0 rounded-md object-cover" />
      ) : (
        <span className="grid h-14 w-10 shrink-0 place-items-center rounded-md bg-text/5">
          <Avatar channel={channel} size="h-5 w-5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{post.text || (post.video ? "Video" : "Post")}</p>
        <p className="text-xs text-text-dim">
          {channel?.name ?? SERVICE_LABEL[post.service] ?? post.service}
          {post.at && ` · ${new Date(post.at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`}
        </p>
        {stats.length > 0 ? (
          <p className="mt-1 flex flex-wrap gap-x-3 text-xs">
            {stats.map(([k, v]) => (
              <span key={k}>
                <span className="font-semibold tabular-nums">{short(v)}</span> <span className="text-text-muted">{k}</span>
              </span>
            ))}
          </p>
        ) : (
          <p className="mt-1 text-xs text-text-dim">No numbers from Buffer yet</p>
        )}
      </div>
      {post.link && (
        <a href={post.link} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent">
          Open
        </a>
      )}
    </li>
  );
}

/* ---- Scheduling ---- */

/** Upload a video straight to storage (too big to go through the server), with progress. */
function uploadVideo(file: File, onProgress: (pct: number) => void): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      const { path, token } = await call<{ path: string; token: string }>("/api/hub/buffer/upload", { method: "POST", body: JSON.stringify({ name: file.name }) });
      const body = new FormData();
      body.append("cacheControl", "3600");
      body.append("", file);
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", `${SUPABASE_URL}/storage/v1/object/upload/sign/buffer-media/${path}?token=${encodeURIComponent(token)}`);
      xhr.setRequestHeader("apikey", SUPABASE_KEY);
      xhr.setRequestHeader("x-upsert", "false");
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(path);
        else if (xhr.status === 413 || /too large|exceeded the maximum/i.test(xhr.responseText))
          reject(new Error(`That video is bigger than your storage allows (${Math.round(file.size / 1_000_000)} MB). Export it smaller (1080p, 30fps), or raise the upload limit in Supabase → Storage → Settings.`));
        else reject(new Error(`The upload didn't go through (${xhr.status}). Try again.`));
      };
      xhr.onerror = () => reject(new Error("The upload didn't go through. Check your connection and try again."));
      xhr.send(body);
    } catch (e) {
      reject(e);
    }
  });
}

function Schedule({ channels, onDone }: { channels: Channel[]; onDone: () => void }) {
  const usable = channels.filter((c) => !c.isDisconnected && !c.isLocked);
  const [picked, setPicked] = useState<string[]>(() => usable.filter((c) => c.service === "tiktok" || c.service === "instagram").map((c) => c.id));
  const [text, setText] = useState("");
  const [when, setWhen] = useState<"queue" | "time">("queue");
  const [at, setAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<ScheduleResult[] | null>(null);
  const limit = Math.min(...picked.map((id) => CAPTION_LIMIT[channels.find((c) => c.id === id)?.service ?? ""] ?? 5000), 5000);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setResults(null);
    try {
      const videoPath = file ? await uploadVideo(file, setProgress) : undefined;
      const r = await call<{ results: ScheduleResult[] }>("/api/hub/buffer/posts", {
        method: "POST",
        body: JSON.stringify({ channelIds: picked, text, when, ...(when === "time" && at && { dueAt: new Date(at).toISOString() }), ...(videoPath && { videoPath }) }),
      });
      setResults(r.results);
      if (r.results.every((x) => x.ok)) setTimeout(onDone, 1200);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <section aria-label="Schedule a post" className="rounded-2xl border border-accent/30 bg-bg-card p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Schedule a post</h2>
      <form onSubmit={submit} className="mt-4 space-y-5">
        <fieldset>
          <legend className="text-sm font-medium">Post to</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {usable.map((c) => {
              const on = picked.includes(c.id);
              return (
                <label key={c.id} className={`flex cursor-pointer items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition ${on ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong"}`}>
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => setPicked((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))} />
                  <Avatar channel={c} />
                  <span className={on ? "font-medium" : ""}>{c.name}</span>
                  <span className="text-xs text-text-dim">{SERVICE_LABEL[c.service] ?? c.service}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-5 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Video</span>
            <span className={`mt-2 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed p-5 text-center text-sm transition ${file ? "border-accent bg-accent-soft" : "border-border-strong hover:border-accent"}`}>
              <input type="file" accept="video/mp4,video/quicktime,video/webm" className="sr-only" aria-label="Video" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              {file ? (
                <>
                  <span className="font-medium">{file.name}</span>
                  <span className="text-xs text-text-muted">{(file.size / 1_000_000).toFixed(1)} MB · tap to change</span>
                </>
              ) : (
                <>
                  <span className="font-medium">Choose your exported video</span>
                  <span className="text-xs text-text-muted">MP4 or MOV, straight from CapCut</span>
                </>
              )}
            </span>
            {progress != null && (
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-text/10" role="progressbar" aria-valuenow={progress} aria-label="Uploading">
                <span className="block h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
              </span>
            )}
          </label>
          <label className="block">
            <span className="flex justify-between text-sm font-medium">
              Caption <span className={`font-normal ${text.length > limit ? "text-accent" : "text-text-dim"}`}>{text.length.toLocaleString()} / {limit.toLocaleString()}</span>
            </span>
            <TextBox rows={6} className={`${input} mt-2`} value={text} onValue={setText} placeholder="Hook, caption and hashtags" />
          </label>
        </div>

        <fieldset>
          <legend className="text-sm font-medium">When</legend>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {(
              [
                ["queue", "Next free slot in the queue"],
                ["time", "Pick a time"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition ${when === k ? "border-accent bg-accent-soft font-medium" : "border-border hover:border-border-strong"}`}>
                <input type="radio" name="when" className="sr-only" checked={when === k} onChange={() => setWhen(k)} />
                {label}
              </label>
            ))}
            {when === "time" && <input type="datetime-local" aria-label="Post at" className={`${input} w-auto`} value={at} onChange={(e) => setAt(e.target.value)} />}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={busy || !picked.length || (!file && !text.trim()) || (when === "time" && !at) || text.length > limit}
            className="rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60"
          >
            <Busy busy={busy} label={progress != null ? `Uploading ${progress}%…` : "Sending to Buffer…"}>
              Schedule {picked.length > 1 ? `on ${picked.length} accounts` : ""}
            </Busy>
          </button>
          <p className="text-xs text-text-dim">The video is kept at a private link Buffer fetches when the post goes out.</p>
        </div>
        {error && <p className="text-sm text-accent">{error}</p>}
        {results && (
          <ul className="space-y-1 text-sm">
            {results.map((r) => {
              const c = channels.find((x) => x.id === r.channelId);
              return (
                <li key={r.channelId} className={r.ok ? "text-good" : "text-accent"}>
                  {r.ok ? "✓" : "✗"} {c?.name ?? r.channelId} ({SERVICE_LABEL[c?.service ?? ""] ?? c?.service}): {r.ok ? (r.dueAt ? `scheduled for ${new Date(r.dueAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "added to the queue") : r.error}
                </li>
              );
            })}
          </ul>
        )}
      </form>
    </section>
  );
}
