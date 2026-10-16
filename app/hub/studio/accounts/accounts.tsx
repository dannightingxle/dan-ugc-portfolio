"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PLATFORM_LABEL, type Post } from "../../_lib/studio/brand-types";
import { compact, followerChange, postSummary, profileUrl, type AccountView, type AccountsData, type Snapshot } from "../../_lib/accounts/types";
import { call } from "../../projects/[id]/studio/studio";
import { shortDate } from "../../_lib/ui";

/* Accounts: every TikTok / Instagram account you track - your own and each
   tech UGC job's - with followers over time and the latest posts. */

const API = "/api/hub/accounts";

function ago(iso: string | null) {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function Accounts() {
  const [data, setData] = useState<AccountsData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    call<AccountsData>(API, "GET").then(setData, (e: Error) => setError(e.message));
  }, []);

  async function refresh() {
    setBusy(true);
    setError("");
    try {
      setData(await call<AccountsData>(`${API}/refresh`, "POST"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function setDaily(autoDaily: boolean) {
    if (data) setData({ ...data, autoDaily });
    try {
      setData(await call<AccountsData>(API, "PUT", { autoDaily }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const personal = data?.accounts.filter((a) => a.group.kind === "personal") ?? [];
  const jobs = new Map<string, { name: string; accounts: AccountView[] }>();
  for (const a of data?.accounts ?? []) {
    if (a.group.kind !== "job") continue;
    const g = jobs.get(a.group.id) ?? { name: a.group.name, accounts: [] };
    g.accounts.push(a);
    jobs.set(a.group.id, g);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/hub/studio" className="text-sm text-text-muted hover:text-accent">
          ← Studio
        </Link>
        <h1 className="mt-2 font-serif text-4xl italic sm:text-5xl">Accounts</h1>
        <p className="mt-2 text-text-muted">Followers, views and your latest posts for every account you run. Public numbers only, so no watch time or audience details.</p>
      </div>

      {data && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-border bg-bg-card p-4">
          <button
            type="button"
            onClick={refresh}
            disabled={busy || !data.apify || !data.accounts.length}
            className="rounded-xl bg-accent px-5 py-2.5 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? "Pulling the latest…" : "Refresh now"}
          </button>
          <p className="min-w-0 flex-1 text-sm text-text-muted">
            {busy ? "This can take a couple of minutes." : `Updated ${ago(data.lastRefresh)}.`}
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={data.autoDaily} onChange={(e) => setDaily(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            Refresh every morning
          </label>
        </div>
      )}

      {error && <p className="text-sm text-accent">{error}</p>}
      {data && !data.apify && <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">Stats need Apify: add APIFY_TOKEN in Vercel (the admin page has the steps).</p>}
      {data && data.problems.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
          {data.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {!data && !error && <p className="text-text-muted">Loading…</p>}

      {data && !data.accounts.length && (
        <div className="space-y-2 rounded-2xl border border-dashed border-border p-6 text-sm text-text-muted">
          <p className="font-medium text-text">No accounts yet.</p>
          <p>
            Add your own on the{" "}
            <Link href="/hub/studio/brand" className="text-accent hover:underline">
              personal brand page
            </Link>
            , and each tech UGC job&apos;s on its Studio Account tab.
          </p>
        </div>
      )}

      {personal.length > 0 && (
        <Group title="Your accounts" edit={{ href: "/hub/studio/brand", label: "Edit" }}>
          {personal.map((a) => (
            <AccountCard key={a.key} account={a} />
          ))}
        </Group>
      )}
      {[...jobs.entries()].map(([id, g]) => (
        <Group key={id} title={g.name} edit={{ href: `/hub/projects/${id}/studio?tab=account`, label: "Edit" }}>
          {g.accounts.map((a) => (
            <AccountCard key={a.key} account={a} />
          ))}
        </Group>
      ))}
    </div>
  );
}

function Group({ title, edit, children }: { title: string; edit: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="min-w-0 truncate text-xl font-semibold">{title}</h2>
        <Link href={edit.href} className="shrink-0 text-sm text-text-muted hover:text-accent">
          {edit.label}
        </Link>
      </div>
      {children}
    </section>
  );
}

type Sort = "new" | "views" | "comments";

function AccountCard({ account: a }: { account: AccountView }) {
  const [sort, setSort] = useState<Sort>("new");
  const [all, setAll] = useState(false);
  const week = followerChange(a.snapshots, 7);
  const sum = postSummary(a.posts);
  const sorted = [...a.posts].sort((x, y) => (sort === "views" ? y.views - x.views : sort === "comments" ? y.comments - x.comments : y.postedAt.localeCompare(x.postedAt)));
  const shown = all ? sorted : sorted.slice(0, 8);

  return (
    <article className="space-y-4 rounded-2xl border border-border bg-bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-xs font-medium text-text-muted">{PLATFORM_LABEL[a.platform]}</span>
        <a href={profileUrl(a.platform, a.handle)} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate font-semibold hover:text-accent">
          @{a.handle}
        </a>
        <span className="ml-auto text-xs text-text-dim">{a.pulledAt ? `Pulled ${shortDate(a.pulledAt)}` : "Not pulled yet"}</span>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Tile label="Followers" value={week.now == null ? "–" : compact(week.now)} delta={week.change} deltaLabel="this week" />
        <Tile label="Usual views" value={a.posts.length ? compact(sum.usual) : "–"} note={a.posts.length ? `over ${a.posts.length} posts` : undefined} />
        <Tile label="Views this week" value={a.posts.length ? compact(sum.weekViews) : "–"} note={a.posts.length ? `${sum.weekPosts} post${sum.weekPosts === 1 ? "" : "s"}` : undefined} />
      </div>

      <Sparkline snapshots={a.snapshots} />

      {a.posts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">
              Latest posts <span className="font-normal text-text-dim">· {sum.withComments} with comments</span>
            </h3>
            <select aria-label={`Sort @${a.handle}'s posts`} value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-lg border border-border bg-bg px-2 py-1 text-sm">
              <option value="new">Newest</option>
              <option value="views">Most views</option>
              <option value="comments">Most comments</option>
            </select>
          </div>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {shown.map((p) => (
              <PostRow key={p.url} post={p} usual={sum.usual} />
            ))}
          </ul>
          {a.posts.length > 8 && (
            <button type="button" onClick={() => setAll(!all)} className="text-sm text-text-muted hover:text-accent">
              {all ? "Show fewer" : `Show all ${a.posts.length}`}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function Tile({ label, value, delta, deltaLabel, note }: { label: string; value: string; delta?: number | null; deltaLabel?: string; note?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-bg-elevated px-3 py-2.5">
      <p className="truncate text-xs text-text-muted">{label}</p>
      <p className="text-xl font-semibold sm:text-2xl">{value}</p>
      {delta != null ? (
        <p className={`truncate text-xs ${delta > 0 ? "text-good" : delta < 0 ? "text-warn" : "text-text-dim"}`}>
          {delta > 0 ? "▲ +" : delta < 0 ? "▼ −" : ""}
          {delta === 0 ? "No change" : compact(Math.abs(delta))} {deltaLabel}
        </p>
      ) : (
        note && <p className="truncate text-xs text-text-dim">{note}</p>
      )}
    </div>
  );
}

/** Followers over time: a thin line, today's point in the accent, hover or tap for the day's number. */
function Sparkline({ snapshots }: { snapshots: Snapshot[] }) {
  const points = snapshots.filter((s): s is { day: string; followers: number } => s.followers != null);
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) {
    return <p className="text-xs text-text-dim">Follower growth shows here after a couple of days of refreshes.</p>;
  }
  const values = points.map((p) => p.followers);
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * 100;
  const y = (v: number) => 90 - ((v - min) / span) * 80;
  const line = points.map((p, i) => `${x(i)},${y(p.followers)}`).join(" ");
  const shown = points[hover ?? points.length - 1];
  const first = points[0];

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-text-dim">
        <span>Followers since {shortDate(first.day)}</span>
        <span className="text-text-muted">
          {shortDate(shown.day)}: {shown.followers.toLocaleString("en-GB")}
        </span>
      </div>
      <div
        className="relative h-14 touch-none"
        role="img"
        aria-label={`Followers went from ${first.followers.toLocaleString("en-GB")} on ${shortDate(first.day)} to ${values.at(-1)!.toLocaleString("en-GB")} on ${shortDate(points.at(-1)!.day)}.`}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(Math.max(0, Math.min(points.length - 1, Math.round(((e.clientX - r.left) / r.width) * (points.length - 1)))));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          <polyline points={line} fill="none" stroke="var(--text-dim)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1="0" y2="100" stroke="var(--border-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
        </svg>
        {/* Dots as HTML so they stay round on a stretched chart. */}
        <span
          className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-bg-card"
          style={{ left: `${x(hover ?? points.length - 1)}%`, top: `${y(shown.followers)}%` }}
        />
      </div>
    </div>
  );
}

function PostRow({ post: p, usual }: { post: Post; usual: number }) {
  const ratio = usual ? p.views / usual : 0;
  return (
    <li className="space-y-1.5 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <a href={p.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 min-w-0 flex-1 text-sm hover:text-accent">
          {p.caption.trim() || "(no caption)"}
        </a>
        {ratio >= 1.5 && <span className="shrink-0 rounded-full bg-good-soft px-2 py-0.5 text-xs font-medium text-good">{ratio.toFixed(1)}× usual</span>}
        {usual > 0 && ratio > 0 && ratio <= 0.5 && <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">{ratio.toFixed(1)}× usual</span>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
        <span className="text-text-dim">{shortDate(p.postedAt)}</span>
        <span>{compact(p.views)} views</span>
        <span>{compact(p.likes)} likes</span>
        <span className={p.comments > 0 ? "rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent" : ""}>
          {compact(p.comments)} comment{p.comments === 1 ? "" : "s"}
        </span>
        {p.platform === "tiktok" && <span>{compact(p.shares)} shares</span>}
      </div>
    </li>
  );
}
