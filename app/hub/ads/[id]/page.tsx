"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect } from "react";
import type { AdDetail, Source } from "../../_lib/types";
import { newProject, useProjects, useStars } from "../../_lib/store";
import { ReachChart, SourceBadge, StatusPill, Thumb, compact, shortDate, useApi } from "../../_lib/ui";

/* One ad: creative, numbers, reach over time, and its script. */

export default function AdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const adId = decodeURIComponent(id);
  const { data, error, loading } = useApi<AdDetail & { source: Source }>(`/api/hub/ads/${encodeURIComponent(adId)}`);
  const { stars, toggle, refresh } = useStars();
  const { projects, save } = useProjects();
  const router = useRouter();

  // Keep the starred copy's numbers fresh whenever the ad is viewed.
  useEffect(() => {
    if (data) refresh(data.ad);
  }, [data, refresh]);

  if (loading) return <p className="text-text-dim">Loading ad…</p>;
  if (error || !data) return <p className="text-red-400">{error ?? "Ad not found."}</p>;

  const { ad, history } = data;
  const starred = Boolean(stars[ad.id]);
  const linked = projects.filter((p) => p.adIds.includes(ad.id));
  const first = history[0]?.reach ?? 0;
  const weekAgo = history[Math.max(0, history.length - 8)]?.reach ?? first;
  const growth7d = ad.reachDelta7d ?? (history.length ? ad.reach! - weekAgo : null);

  function scriptToProject() {
    const [hook, ...rest] = (ad.transcript ?? ad.body ?? "").split(/\n\n+/);
    const cta = rest.length > 1 ? rest.pop()! : "";
    const p = newProject({
      brand: ad.brandName,
      title: `${ad.brandName} - ${ad.title?.slice(0, 40) ?? "ad"}`,
      stage: "Delivered",
      hook: hook ?? "",
      body: rest.join("\n\n"),
      cta,
      adIds: [ad.id],
    });
    save(p);
    router.push(`/hub/projects?open=${p.id}`);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/hub" className="text-sm text-text-dim hover:text-text">
          ← My ads
        </Link>
        <SourceBadge source={data.source} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-2xl border border-border bg-bg-card">
            {ad.mediaType === "video" && ad.mediaUrl ? (
              <video src={ad.mediaUrl} poster={ad.thumbnailUrl ?? undefined} controls playsInline className="aspect-[4/5] w-full bg-black object-contain" />
            ) : (
              <Thumb ad={ad} className="aspect-[4/5] w-full" />
            )}
          </div>
          <button
            onClick={() => toggle(ad)}
            className={`flex w-full items-center justify-center gap-2 rounded-xl border py-3 font-medium transition ${
              starred ? "border-accent bg-accent-soft text-accent" : "border-border hover:border-accent"
            }`}
          >
            <span aria-hidden>{starred ? "★" : "☆"}</span>
            {starred ? "Tracking this ad" : "Star & track this ad"}
          </button>
        </div>

        <div className="min-w-0 space-y-8">
          <div>
            <p className="text-sm text-text-dim">{ad.brandName}</p>
            <h1 className="mt-1 text-2xl font-semibold leading-snug sm:text-3xl">{ad.title || "Untitled ad"}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-text-dim">
              <StatusPill status={ad.status} />
              {ad.partner && <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px]">Partnership ad</span>}
              <span>
                First seen {shortDate(ad.firstSeenAt)} · last seen {shortDate(ad.lastSeenAt)}
              </span>
              {ad.countries.length > 0 && <span>· {ad.countries.join(", ")}</span>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total reach" value={compact(ad.reach)} />
            <Stat label="Days running" value={ad.daysRunning?.toString() ?? "–"} />
            <Stat label="Reach, last 7 days" value={growth7d ? `+${compact(growth7d)}` : "–"} accent={Boolean(growth7d)} />
            <Stat label="Est. spend" value={compact(ad.estimatedSpend)} hint="TrendTrack's estimate from reach at a 9 CPM" />
          </div>

          <section className="rounded-2xl border border-border bg-bg-card p-4 sm:p-5">
            <h2 className="mb-3 font-medium">Reach over time</h2>
            <ReachChart points={history} />
          </section>

          <ShareCard brand={ad.brandName} reach={ad.reach} days={ad.daysRunning} running={ad.status === "active"} />

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium">Script / transcript</h2>
              <button onClick={scriptToProject} className="rounded-full border border-border px-3 py-1.5 text-sm hover:border-accent">
                Save to a project →
              </button>
            </div>
            <pre className="whitespace-pre-wrap rounded-2xl border border-border bg-bg-card p-4 font-sans text-sm leading-relaxed text-text-muted">
              {ad.transcript || ad.body || "No transcript available for this ad."}
            </pre>
            {linked.length > 0 && (
              <p className="text-sm text-text-dim">
                Linked to:{" "}
                {linked.map((p) => (
                  <Link key={p.id} href={`/hub/projects?open=${p.id}`} className="text-accent hover:underline">
                    {p.title || p.brand}
                  </Link>
                ))}
              </p>
            )}
            {ad.landingPage && (
              <p className="truncate text-sm text-text-dim">
                Landing page:{" "}
                <a href={ad.landingPage} target="_blank" rel="noreferrer" className="text-text-muted hover:text-accent">
                  {ad.landingPage}
                </a>
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-bg-card p-4" title={hint}>
      <div className="text-xs text-text-dim">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent ? "text-good" : ""}`}>{value}</div>
    </div>
  );
}

/** Screenshot-ready brag card for socials. */
function ShareCard({ brand, reach, days, running }: { brand: string; reach: number | null; days: number | null; running: boolean }) {
  return (
    <section className="space-y-2">
      <h2 className="font-medium">Share card</h2>
      <p className="text-sm text-text-dim">Screenshot this for your stories or pitch deck.</p>
      <div className="hub-share max-w-sm rounded-2xl p-6">
        <p className="text-xs font-semibold uppercase tracking-widest opacity-70">My ad for {brand}</p>
        <p className="mt-4 font-serif text-5xl italic leading-none">{compact(reach)}</p>
        <p className="text-sm font-medium opacity-80">people reached</p>
        <p className="mt-4 text-sm font-medium">
          {days ?? "–"} days {running ? "and still running 🔥" : "in market"}
        </p>
      </div>
    </section>
  );
}
