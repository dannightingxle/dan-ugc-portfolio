"use client";

import Link from "next/link";
import { useState } from "react";
import type { Ad, Brand, Paged } from "../_lib/types";
import { useStars } from "../_lib/store";
import { StarButton, StatusPill, Thumb, compact, useApi } from "../_lib/ui";

/* Search a brand, browse its Meta ads, star the ones you're in. */

type Filters = { status: "active" | "all"; mediaType: "all" | "video"; sortBy: "reach" | "longestRunning" | "newest" };

export default function FindAds() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [brand, setBrand] = useState<Brand | null>(null);

  const brands = useApi<Paged<Brand>>(submitted.length >= 2 ? `/api/hub/lookup?q=${encodeURIComponent(submitted)}` : null);

  // In demo mode, open with a brand loaded so there's something to see.
  const demoStart = useApi<Paged<Brand>>("/api/hub/lookup?q=northmoor");
  const shownBrand = brand ?? (!submitted && demoStart.data?.source === "demo" ? demoStart.data.items[0] : null);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-4xl italic sm:text-5xl">Find your ads</h1>
        <p className="mt-2 max-w-xl text-text-muted">
          Search a brand you&apos;ve made content for, then star the ads you&apos;re in. Starred ads land on your dashboard and get
          tracked over time.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(query.trim());
          setBrand(null);
        }}
        className="flex gap-2"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Brand name, website or @instagram"
          className="min-w-0 flex-1 rounded-xl border border-border bg-bg-card px-4 py-3 outline-none focus:border-accent"
        />
        <button className="rounded-xl bg-accent px-5 font-medium text-black hover:bg-accent-hover">Search</button>
      </form>

      {submitted && !shownBrand && (
        <section className="space-y-3">
          {brands.loading && <p className="text-text-dim">Searching…</p>}
          {brands.error && <p className="text-red-400">{brands.error}</p>}
          {brands.data?.items.length === 0 && <p className="text-text-dim">No brands found for “{submitted}”.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {brands.data?.items.map((b) => (
              <button
                key={b.id}
                onClick={() => setBrand(b)}
                className="flex items-center justify-between rounded-xl border border-border bg-bg-card p-4 text-left transition hover:border-accent"
              >
                <span className="font-medium">{b.name}</span>
                <span className="text-sm text-text-dim">
                  {b.liveAds != null && `${b.liveAds} live ads`}
                  {b.reach30d != null && ` · ${compact(b.reach30d)} reach 30d`}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {shownBrand && <BrandAds key={shownBrand.id} brand={shownBrand} onBack={submitted ? () => setBrand(null) : undefined} />}
    </div>
  );
}

function BrandAds({ brand, onBack }: { brand: Brand; onBack?: () => void }) {
  const [filters, setFilters] = useState<Filters>({ status: "active", mediaType: "all", sortBy: "reach" });
  const [partnerOnly, setPartnerOnly] = useState(false);
  const [offset, setOffset] = useState(0);
  const [earlier, setEarlier] = useState<Ad[]>([]);
  const { stars, toggle } = useStars();

  const params = new URLSearchParams({ ...filters, offset: String(offset) });
  const page = useApi<Paged<Ad>>(`/api/hub/advertisers/${encodeURIComponent(brand.id)}/ads?${params}`);

  const ads = [...earlier, ...(page.data?.items ?? [])];

  function set<K extends keyof Filters>(k: K, v: Filters[K]) {
    setFilters((f) => ({ ...f, [k]: v }));
    setEarlier([]);
    setOffset(0);
  }

  const shown = partnerOnly ? ads.filter((a) => a.partner) : ads;
  const total = page.data?.total ?? 0;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {onBack && (
            <button onClick={onBack} className="mb-1 text-sm text-text-dim hover:text-text">
              ← Other results
            </button>
          )}
          <h2 className="text-2xl font-semibold">{brand.name}</h2>
          <p className="text-sm text-text-dim">{total.toLocaleString("en-GB")} ads match</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Chip on={filters.status === "active"} onClick={() => set("status", filters.status === "active" ? "all" : "active")}>
            Running now
          </Chip>
          <Chip on={filters.mediaType === "video"} onClick={() => set("mediaType", filters.mediaType === "video" ? "all" : "video")}>
            Video only
          </Chip>
          <Chip on={partnerOnly} onClick={() => setPartnerOnly(!partnerOnly)}>
            Creator / partnership ads
          </Chip>
          <select
            value={filters.sortBy}
            onChange={(e) => set("sortBy", e.target.value as Filters["sortBy"])}
            className="rounded-full border border-border bg-bg-card px-3 py-1.5 outline-none"
          >
            <option value="reach">Most reach</option>
            <option value="longestRunning">Longest running</option>
            <option value="newest">Newest</option>
          </select>
        </div>
      </div>

      {page.error && <p className="text-red-400">{page.error}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((ad) => (
          <Link
            key={ad.id}
            href={`/hub/ads/${encodeURIComponent(ad.id)}`}
            className="group overflow-hidden rounded-xl border border-border bg-bg-card transition hover:border-border-strong"
          >
            <div className="relative aspect-[4/5]">
              <Thumb ad={ad} className="absolute inset-0 h-full w-full" />
              <div className="absolute right-2 top-2">
                <StarButton starred={Boolean(stars[ad.id])} onClick={() => toggle(ad)} />
              </div>
              {ad.partner && (
                <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white backdrop-blur">
                  Partnership
                </span>
              )}
            </div>
            <div className="space-y-2 p-3">
              <p className="line-clamp-2 min-h-[2.5rem] text-sm text-text-muted">{ad.title || ad.body || "Untitled ad"}</p>
              <div className="flex items-center justify-between">
                <StatusPill status={ad.status} />
                <span className="text-xs text-text-dim">{ad.daysRunning ?? "–"} days</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-semibold">{compact(ad.reach)}</span>
                {ad.reachDelta7d ? <span className="text-xs text-emerald-400">+{compact(ad.reachDelta7d)} 7d</span> : null}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {page.loading && <p className="text-center text-text-dim">Loading ads…</p>}
      {!page.loading && ads.length < total && (
        <div className="text-center">
          <button
            onClick={() => {
              setEarlier(ads);
              setOffset(ads.length);
            }}
            className="rounded-full border border-border px-5 py-2 text-sm text-text-muted hover:border-accent hover:text-text"
          >
            Load more
          </button>
        </div>
      )}
    </section>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-3 py-1.5 transition ${
        on ? "border-accent bg-accent-soft text-accent" : "border-border bg-bg-card text-text-muted hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}
