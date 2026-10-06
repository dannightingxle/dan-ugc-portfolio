"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Ad, AdDetail, Brand, Paged, Source } from "./_lib/types";
import { STAGES, useProjects, useStars, type StarredAd } from "./_lib/store";
import { Sparkline, StarButton, StatusPill, Thumb, compact, gbp, useApi } from "./_lib/ui";

/* Dashboard: every starred ad with live numbers, plus the project pipeline. */

export default function HubHome() {
  const { stars, toggle } = useStars();
  const { projects } = useProjects();
  const ads = useMemo(() => Object.values(stars).sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0)), [stars]);

  const running = ads.filter((a) => a.status === "active").length;
  const totalReach = ads.reduce((s, a) => s + (a.reach ?? 0), 0);
  const longest = ads.reduce((m, a) => Math.max(m, a.daysRunning ?? 0), 0);

  const earned = projects.filter((p) => p.stage === "Paid").reduce((s, p) => s + (p.fee ?? 0), 0);
  const pipeline = projects.filter((p) => p.stage !== "Paid").reduce((s, p) => s + (p.fee ?? 0), 0);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-serif text-4xl italic sm:text-5xl">My ads</h1>
        <p className="mt-2 text-text-muted">The ads you&apos;re in, and how they&apos;re doing across each brand&apos;s accounts.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Ads tracked" value={ads.length.toString()} />
        <Tile label="Still running" value={running.toString()} accent={running > 0} />
        <Tile label="Combined reach" value={compact(totalReach)} />
        <Tile label="Longest run" value={longest ? `${longest} days` : "–"} />
      </div>

      {ads.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ads.map((ad) => (
            <TrackedAd key={ad.id} ad={ad} onUnstar={() => toggle(ad)} />
          ))}
        </div>
      )}

      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-semibold">Projects</h2>
          <Link href="/hub/projects" className="text-sm text-accent hover:underline">
            Open board →
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {STAGES.map((s) => (
            <Link key={s} href="/hub/projects" className="rounded-xl border border-border bg-bg-card p-3 hover:border-border-strong">
              <div className="text-xs text-text-dim">{s}</div>
              <div className="mt-1 text-xl font-semibold">{projects.filter((p) => p.stage === s).length}</div>
            </Link>
          ))}
        </div>
        <p className="text-sm text-text-dim">
          Earned {gbp(earned)} · {gbp(pipeline)} in the pipeline
        </p>
      </section>
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-bg-card p-4">
      <div className="text-xs text-text-dim">{label}</div>
      <div className={`mt-1 text-3xl font-semibold ${accent ? "text-emerald-400" : ""}`}>{value}</div>
    </div>
  );
}

function TrackedAd({ ad, onUnstar }: { ad: StarredAd; onUnstar: () => void }) {
  const { data } = useApi<AdDetail>(`/api/hub/ads/${encodeURIComponent(ad.id)}`);
  const { refresh } = useStars();
  useEffect(() => {
    if (data) refresh(data.ad);
  }, [data, refresh]);
  const history = data?.history ?? [];

  return (
    <Link
      href={`/hub/ads/${encodeURIComponent(ad.id)}`}
      className="flex gap-3 rounded-2xl border border-border bg-bg-card p-3 transition hover:border-border-strong"
    >
      <div className="relative h-32 w-24 shrink-0 overflow-hidden rounded-lg">
        <Thumb ad={ad} className="absolute inset-0 h-full w-full" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs text-text-dim">{ad.brandName}</p>
            <p className="line-clamp-2 text-sm font-medium">{ad.title || "Untitled ad"}</p>
          </div>
          <div className="scale-90">
            <StarButton starred onClick={onUnstar} />
          </div>
        </div>
        <Sparkline points={history} className="my-2 h-8 w-full" />
        <div className="mt-auto flex items-center justify-between gap-2">
          <StatusPill status={ad.status} />
          <span className="text-xs text-text-dim">{ad.daysRunning ?? "–"}d</span>
          <span className="font-semibold">{compact(ad.reach)}</span>
        </div>
      </div>
    </Link>
  );
}

function EmptyState() {
  const status = useApi<{ source: Source }>("/api/hub/status");
  const { toggle } = useStars();
  const [busy, setBusy] = useState(false);

  // Demo only: star a few sample ads in one click.
  async function addSamples() {
    setBusy(true);
    const brands: Paged<Brand> = await fetch("/api/hub/lookup?q=demo").then((r) => r.json());
    for (const b of brands.items.slice(0, 3)) {
      const ads: Paged<Ad> = await fetch(`/api/hub/advertisers/${b.id}/ads?status=active`).then((r) => r.json());
      ads.items.slice(0, 2).forEach((a) => toggle(a));
    }
    setBusy(false);
  }

  return (
    <div className="rounded-2xl border border-dashed border-border-strong p-10 text-center">
      <p className="text-lg font-medium">No ads starred yet</p>
      <p className="mx-auto mt-1 max-w-md text-text-muted">Search a brand you&apos;ve worked with, find your ads and hit the star.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <Link href="/hub/find" className="rounded-xl bg-accent px-5 py-2.5 font-medium text-black hover:bg-accent-hover">
          Find my ads
        </Link>
        {status.data?.source === "demo" && (
          <button onClick={addSamples} disabled={busy} className="rounded-xl border border-border px-5 py-2.5 hover:border-accent disabled:opacity-60">
            {busy ? "Adding…" : "Add sample ads"}
          </button>
        )}
      </div>
    </div>
  );
}
