"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CAPTION_LIMIT, SERVICE_LABEL, type CalendarData, type CalendarPost, type Channel, type ChannelGroup, type ScheduleResult } from "../../_lib/buffer/types";
import { FinishedVideos } from "./finished";
import { Avatar, call, input, type Upload, uploadVideo } from "./shared";
import { useConfirm } from "../../_lib/popups";
import { TextBox } from "../../_lib/text-box";
import { Busy, Spinner } from "../../_lib/ui";

/* Your Buffer schedule in Creator Desk: the next two weeks day by day (with
   the empty days to fill), posts that failed, how the last two weeks' posts
   did, and scheduling a video to one or more accounts. Comments stay in
   Buffer: its API doesn't do them. */

type Status = { connected: false } | { connected: true; organization: string; connectedAt: string };
type Loaded = { status: Status; calendar?: CalendarData; error?: string; groups?: ChannelGroup[] };

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
  const [finishing, setFinishing] = useState(false);

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
            <button
              onClick={() => {
                setFinishing((s) => !s);
                setScheduling(false);
              }}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover"
            >
              {finishing ? "Close" : "Schedule finished videos"}
            </button>
            <button
              onClick={() => {
                setScheduling((s) => !s);
                setFinishing(false);
              }}
              className="rounded-xl border border-border px-4 py-2 text-sm hover:border-accent hover:text-accent"
            >
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
              groups={data.groups ?? []}
              onGroups={(groups) => setData((d) => d && { ...d, groups })}
              onScheduled={() => void load(true)}
              onDone={() => setScheduling(false)}
            />
          )}
          {finishing && data.calendar && (
            <FinishedVideos channels={data.calendar.channels} groups={data.groups ?? []} scheduled={data.calendar.scheduled} onScheduled={() => void load(true)} onDone={() => setFinishing(false)} />
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

const firstLine = (s: string) => s.trim().split("\n")[0].slice(0, 80);

function Schedule({
  channels,
  groups: savedGroups,
  onGroups,
  onScheduled,
  onDone,
}: {
  channels: Channel[];
  groups: ChannelGroup[];
  onGroups: (g: ChannelGroup[]) => void;
  onScheduled: () => void;
  onDone: () => void;
}) {
  const usable = channels.filter((c) => !c.isDisconnected && !c.isLocked);
  const [picked, setPicked] = useState<string[]>(() => usable.filter((c) => c.service === "tiktok" || c.service === "instagram").map((c) => c.id));
  const [groups, setGroups] = useState(savedGroups);
  const [naming, setNaming] = useState<string | null>(null);
  const [groupError, setGroupError] = useState("");
  const [text, setText] = useState("");
  const [when, setWhen] = useState<"queue" | "time">("queue");
  const [at, setAt] = useState("");
  const [upload, setUpload] = useState<Upload | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<ScheduleResult[] | null>(null);
  // Posts scheduled since the form opened, newest first: one after another, without closing it.
  const [done, setDone] = useState<{ id: number; label: string; results: ScheduleResult[] }[]>([]);
  const limit = Math.min(...picked.map((id) => CAPTION_LIMIT[channels.find((c) => c.id === id)?.service ?? ""] ?? 5000), 5000);
  const uploading = Boolean(upload && !upload.path && !upload.error);

  function startUpload(file: File | null) {
    upload?.abort();
    if (!file) return setUpload(null);
    const u = uploadVideo(file, (progress) => setUpload((cur) => (cur?.file === file ? { ...cur, progress } : cur)));
    setUpload({ file, progress: 0, ...u });
    u.promise.then(
      (path) => setUpload((cur) => (cur?.file === file ? { ...cur, path, progress: 100 } : cur)),
      (e: Error) => setUpload((cur) => (cur?.file === file && !/cancelled/.test(e.message) ? { ...cur, error: e.message } : cur)),
    );
  }

  async function saveGroups(next: ChannelGroup[]) {
    const before = groups;
    setGroups(next);
    setGroupError("");
    try {
      const r = await call<{ groups: ChannelGroup[] }>("/api/hub/buffer/groups", { method: "PUT", body: JSON.stringify({ groups: next }) });
      setGroups(r.groups);
      onGroups(r.groups);
    } catch (e) {
      setGroups(before);
      setGroupError((e as Error).message);
    }
  }
  function saveNewGroup() {
    const name = (naming ?? "").trim();
    if (!name || !picked.length) return;
    void saveGroups([...groups.filter((g) => g.name.toLowerCase() !== name.toLowerCase()), { id: crypto.randomUUID(), name, channelIds: picked }]);
    setNaming(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setResults(null);
    try {
      const videoPath = upload ? await upload.promise : undefined;
      const r = await call<{ results: ScheduleResult[] }>("/api/hub/buffer/posts", {
        method: "POST",
        body: JSON.stringify({ channelIds: picked, text, when, ...(when === "time" && at && { dueAt: new Date(at).toISOString() }), ...(videoPath && { videoPath }) }),
      });
      if (r.results.every((x) => x.ok)) {
        // Scheduled: kept in the list above, and the form is ready for the next one (same accounts, same kind of timing).
        setDone((d) => [{ id: Date.now(), label: firstLine(text) || upload?.file.name || "Post", results: r.results }, ...d]);
        setText("");
        setAt("");
        setUpload(null);
        setFileKey((k) => k + 1);
        onScheduled();
      } else {
        setResults(r.results);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const resultLine = (r: ScheduleResult) => {
    const c = channels.find((x) => x.id === r.channelId);
    return `${c?.name ?? r.channelId} (${SERVICE_LABEL[c?.service ?? ""] ?? c?.service}): ${r.ok ? (r.dueAt ? new Date(r.dueAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "next free slot") : r.error}`;
  };

  return (
    <section aria-label="Schedule a post" className="rounded-2xl border border-accent/30 bg-bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{done.length ? "Schedule the next post" : "Schedule a post"}</h2>
        {done.length > 0 && (
          <button type="button" onClick={onDone} className="rounded-xl border border-border px-4 py-1.5 text-sm hover:border-accent hover:text-accent">
            Done
          </button>
        )}
      </div>
      {done.length > 0 && (
        <ul aria-label="Scheduled just now" className="mt-3 space-y-1.5 rounded-xl bg-good/10 p-3 text-sm">
          {done.map((d) => (
            <li key={d.id}>
              <span className="font-medium text-good">✓ {d.label}</span>
              <span className="block text-xs text-text-muted">{d.results.map(resultLine).join(" · ")}</span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="mt-4 space-y-5">
        <fieldset>
          <legend className="text-sm font-medium">Post to</legend>
          {groups.length > 0 && (
            <div role="group" aria-label="Channel groups" className="mt-2 flex flex-wrap items-center gap-2">
              {groups.map((g) => {
                const ids = g.channelIds.filter((id) => usable.some((c) => c.id === id));
                const all = ids.length > 0 && ids.every((id) => picked.includes(id));
                return (
                  <span key={g.id} className={`flex items-center rounded-lg border text-sm transition ${all ? "border-accent bg-accent text-on-accent" : "border-border-strong hover:border-accent"}`}>
                    <button
                      type="button"
                      aria-pressed={all}
                      disabled={!ids.length}
                      onClick={() => setPicked((p) => (all ? p.filter((x) => !ids.includes(x)) : [...new Set([...p, ...ids])]))}
                      className="py-1 pl-3 pr-1.5 font-medium disabled:opacity-50"
                    >
                      {g.name} <span className={`font-normal ${all ? "opacity-80" : "text-text-dim"}`}>· {ids.length}</span>
                    </button>
                    <button type="button" aria-label={`Delete the ${g.name} group`} onClick={() => void saveGroups(groups.filter((x) => x.id !== g.id))} className="px-2 py-1 opacity-60 hover:opacity-100">
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}
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
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
            <button type="button" onClick={() => setPicked(usable.map((c) => c.id))} className="text-text-muted underline hover:text-accent">
              All accounts
            </button>
            <button type="button" onClick={() => setPicked([])} className="text-text-muted underline hover:text-accent">
              None
            </button>
            {naming === null ? (
              picked.length > 1 &&
              !groups.some((g) => g.channelIds.length === picked.length && g.channelIds.every((id) => picked.includes(id))) && (
                <button type="button" onClick={() => setNaming("")} className="font-medium text-accent hover:underline">
                  + Save these {picked.length} as a group
                </button>
              )
            ) : (
              <span className="flex flex-wrap items-center gap-2">
                <input
                  autoFocus
                  aria-label="Group name"
                  value={naming}
                  maxLength={40}
                  onChange={(e) => setNaming(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveNewGroup();
                    } else if (e.key === "Escape") setNaming(null);
                  }}
                  placeholder="e.g. Tech UGC accounts"
                  className="rounded-lg border border-border bg-bg-card px-2 py-1 text-sm outline-none focus:border-accent"
                />
                <button type="button" onClick={saveNewGroup} disabled={!naming.trim()} className="rounded-lg bg-accent px-3 py-1 text-sm font-medium text-on-accent disabled:opacity-60">
                  Save group
                </button>
                <button type="button" onClick={() => setNaming(null)} className="text-text-muted underline">
                  Cancel
                </button>
              </span>
            )}
          </div>
          {groupError && <p className="mt-1 text-sm text-accent">{groupError}</p>}
        </fieldset>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="block">
              <span className="text-sm font-medium">Video</span>
              <span className={`mt-2 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed p-5 text-center text-sm transition ${upload ? "border-accent bg-accent-soft" : "border-border-strong hover:border-accent"}`}>
                <input key={fileKey} type="file" accept="video/mp4,video/quicktime,video/webm" className="sr-only" aria-label="Video" onChange={(e) => startUpload(e.target.files?.[0] ?? null)} />
                {upload ? (
                  <>
                    <span className="font-medium">{upload.file.name}</span>
                    <span className="text-xs text-text-muted">
                      {(upload.file.size / 1_000_000).toFixed(1)} MB · {upload.error ? "didn't upload" : upload.path ? "uploaded ✓" : `uploading ${upload.progress}%`} · tap to change
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-medium">Choose your exported video</span>
                    <span className="text-xs text-text-muted">MP4 or MOV, straight from CapCut - it uploads while you write the caption</span>
                  </>
                )}
              </span>
            </label>
            {uploading && upload && (
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-text/10" role="progressbar" aria-valuenow={upload.progress} aria-label="Uploading">
                <span className="block h-full bg-accent transition-all" style={{ width: `${upload.progress}%` }} />
              </span>
            )}
            {upload?.error && (
              <p className="mt-2 text-sm text-accent">
                {upload.error}{" "}
                <button type="button" onClick={() => startUpload(upload.file)} className="font-medium underline">
                  Try the upload again
                </button>
              </p>
            )}
          </div>
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
            disabled={busy || !picked.length || (!upload && !text.trim()) || Boolean(upload?.error) || (when === "time" && !at) || text.length > limit}
            className="rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60"
          >
            <Busy busy={busy} label={uploading ? `Finishing the upload (${upload?.progress ?? 0}%)…` : "Sending to Buffer…"}>
              Schedule {picked.length > 1 ? `on ${picked.length} accounts` : ""}
            </Busy>
          </button>
          <p className="text-xs text-text-dim">Once it&apos;s scheduled, the form is ready for the next one. The video is kept at a private link Buffer fetches when the post goes out.</p>
        </div>
        {error && <p className="text-sm text-accent">{error}</p>}
        {results && (
          <ul className="space-y-1 text-sm">
            {results.map((r) => (
              <li key={r.channelId} className={r.ok ? "text-good" : "text-accent"}>
                {r.ok ? "✓" : "✗"} {resultLine(r)}
              </li>
            ))}
          </ul>
        )}
      </form>
    </section>
  );
}
