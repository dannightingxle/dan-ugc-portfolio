"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { Ad, AdDetail, Brand, Paged, Source } from "./_lib/types";
import { ImportLocal } from "./import-local";
import { WelcomeBanner } from "./welcome-banner";
import { ExampleTag } from "./projects/fields";
import { paymentDue, useProjects, useStars, type StarredAd } from "./_lib/store";
import { useAccount } from "./account-provider";
import { Sparkline, StarButton, StatusPill, Thumb, compact, gbp, shortDate, useApi } from "./_lib/ui";

/* Dashboard: projects and money first, then every starred ad with live numbers. */

export default function HubHome() {
  const { stars, toggle } = useStars();
  const { projects } = useProjects();
  const { billing } = useAccount();
  const ads = useMemo(() => Object.values(stars).sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0)), [stars]);

  const running = ads.filter((a) => a.status === "active").length;
  const totalReach = ads.reduce((s, a) => s + (a.reach ?? 0), 0);
  const longest = ads.reduce((m, a) => Math.max(m, a.daysRunning ?? 0), 0);

  const earned = projects.filter((p) => p.paymentStatus === "Paid").reduce((s, p) => s + (p.fee ?? 0), 0);
  const invoiced = projects.filter((p) => p.paymentStatus === "Invoiced");
  const awaiting = invoiced.reduce((s, p) => s + (p.fee ?? 0), 0);
  const overdue = invoiced.filter((p) => paymentDue(p)?.overdue).length;
  const pipeline = projects.filter((p) => p.paymentStatus === "Not invoiced").reduce((s, p) => s + (p.fee ?? 0), 0);
  const upNext = projects
    .filter((p) => p.stage !== "Delivered" && p.stage !== "Paid")
    .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"))
    .slice(0, 4);
  // Anything waiting on someone else, soonest chase first (no date goes last).
  const today = new Date().toISOString().slice(0, 10);
  const waiting = projects.filter((p) => p.waitingOn.trim()).sort((a, b) => (a.chaseOn || "9999").localeCompare(b.chaseOn || "9999"));

  return (
    <div className="space-y-12">
      <Suspense>
        <WelcomeBanner />
      </Suspense>
      <ImportLocal />
      <section className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-4xl italic sm:text-5xl">Projects</h1>
            <p className="mt-2 text-text-muted">Your brand deals and what you&apos;re owed.</p>
          </div>
          <Link href="/hub/projects" className="rounded-xl border border-border px-4 py-2 text-sm hover:border-accent hover:text-accent">
            Open board →
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Earned" value={gbp(earned)} accent={earned > 0} />
          <Tile label="Awaiting payment" value={gbp(awaiting)} note={overdue ? `${overdue} overdue` : undefined} />
          <Tile label="In the pipeline" value={gbp(pipeline)} />
          <Tile label="Active projects" value={projects.filter((p) => p.stage !== "Paid").length.toString()} />
        </div>

        {billing.owner && waiting.length > 0 && (
          <div className="rounded-2xl border border-border bg-bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="font-medium">Waiting on</h2>
              <span className="text-xs text-text-dim">Done only when they&apos;ve replied or paid</span>
            </div>
            <ul className="divide-y divide-border">
              {waiting.map((p) => {
                const due = Boolean(p.chaseOn && p.chaseOn <= today);
                return (
                  <li key={p.id}>
                    <Link href={`/hub/projects/${p.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-bg-elevated">
                      <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                        <p className="text-xs text-text-dim">{p.brand}</p>
                        <p className="text-sm font-medium">{p.waitingOn}</p>
                      </div>
                      <span className={`ml-auto rounded-full px-2 py-0.5 text-xs sm:ml-0 ${due ? "bg-warn-soft font-medium text-warn" : "bg-text/5 text-text-dim"}`}>
                        {!p.chaseOn ? "No chase date" : due ? "Chase today" : `Chase ${shortDate(p.chaseOn)}`}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-medium">Coming up</h2>
            <Link href="/hub/projects?new=1" className="text-sm text-accent hover:underline">
              + New project
            </Link>
          </div>
          {upNext.length === 0 ? (
            <p className="px-4 py-6 text-sm text-text-dim">Nothing in progress. Add a project when a brand deal lands.</p>
          ) : (
            <ul className="divide-y divide-border">
              {upNext.map((p) => {
                const done = p.deliverables.filter((d) => d.done).length;
                return (
                  <li key={p.id}>
                    <Link href={`/hub/projects/${p.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-bg-elevated">
                      <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                        <p className="flex items-center gap-1.5 text-xs text-text-dim">
                          {p.brand}
                          {p.example && <ExampleTag />}
                        </p>
                        <p className="truncate text-sm font-medium">{p.title || "Untitled"}</p>
                      </div>
                      <span className="rounded-full bg-text/5 px-2 py-0.5 text-xs text-text-muted">{p.stage}</span>
                      {p.deliverables.length > 0 && (
                        <span className="text-xs text-text-dim">
                          {done}/{p.deliverables.length} done
                        </span>
                      )}
                      <span className="ml-auto text-right text-xs text-text-dim sm:ml-0 sm:w-20">{p.due ? `Due ${shortDate(p.due)}` : "No date"}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="space-y-5">
        <div>
          <h2 className="font-serif text-3xl italic sm:text-4xl">My ads</h2>
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
      </section>
    </div>
  );
}

function Tile({ label, value, accent, note }: { label: string; value: string; accent?: boolean; note?: string }) {
  return (
    <div className="rounded-xl border border-border bg-bg-card p-4">
      <div className="text-xs text-text-dim">{label}</div>
      <div className={`mt-1 text-3xl font-semibold ${accent ? "text-good" : ""}`}>{value}</div>
      {note && <div className="mt-1 text-xs font-medium text-accent">{note}</div>}
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
        <Link href="/hub/find" className="rounded-xl bg-accent px-5 py-2.5 font-medium text-on-accent hover:bg-accent-hover">
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
