"use client";

import { useEffect, useRef, useState } from "react";
import type { Ad, DataSource, ReachPoint } from "./types";

/* Small shared pieces for the hub pages. */

export function compact(n: number | null | undefined) {
  if (n == null) return "–";
  return new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function gbp(n: number | null | undefined) {
  if (n == null) return "–";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n);
}

export function shortDate(d: string | null | undefined) {
  if (!d) return "–";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Fetch JSON from the hub API. Data/error belong to the URL that produced them,
    so a changed URL reads as loading until its own response lands. */
export function useApi<T>(url: string | null) {
  const [state, setState] = useState<{ url: string | null; data: T | null; error: string | null }>({
    url: null,
    data: null,
    error: null,
  });
  useEffect(() => {
    if (!url) return;
    let live = true;
    fetch(url)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? `Request failed (${r.status})`);
        return json as T;
      })
      .then((data) => live && setState({ url, data, error: null }))
      .catch((e: Error) => live && setState({ url, data: null, error: e.message }));
    return () => {
      live = false;
    };
  }, [url]);
  const current = url !== null && state.url === url;
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: url !== null && !current,
  };
}

export function SourceBadge({ source }: { source: DataSource | undefined }) {
  if (!source) return null;
  if (source === "live")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-good/30 bg-good-soft px-2.5 py-0.5 text-xs text-good">
        <span className="h-1.5 w-1.5 rounded-full bg-good" /> Live TrendTrack data
      </span>
    );
  if (source === "none")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs text-text-dim">
        <span className="h-1.5 w-1.5 rounded-full bg-text-dim" /> TrendTrack not connected
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-warn/30 bg-warn-soft px-2.5 py-0.5 text-xs text-warn">
      <span className="h-1.5 w-1.5 rounded-full bg-warn" /> Demo data
    </span>
  );
}

export function StatusPill({ status }: { status: Ad["status"] }) {
  const live = status === "active";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        live ? "bg-good-soft text-good" : "bg-text/5 text-text-dim"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-good" : "bg-text-dim"}`} />
      {live ? "Running" : "Stopped"}
    </span>
  );
}

/** Ad creative thumbnail, or a branded placeholder when there's no image. */
export function Thumb({ ad, className = "" }: { ad: Ad; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (ad.thumbnailUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={ad.thumbnailUrl}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`object-cover ${className}`}
      />
    );
  }
  const initials = ad.brandName.split(/\s+/).map((w) => w[0]).slice(0, 2).join("");
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-thumb-a to-thumb-b ${className}`}
    >
      <span className="font-serif text-3xl italic text-accent">{initials}</span>
      {ad.mediaType === "video" && <span className="text-[10px] uppercase tracking-widest text-text-dim">Video</span>}
    </div>
  );
}

export function StarButton({ starred, onClick }: { starred: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      aria-pressed={starred}
      aria-label={starred ? "Unstar ad" : "Star ad"}
      className={`flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur transition ${
        starred
          ? "border-accent bg-accent text-on-accent"
          : "border-white/20 bg-black/50 text-white hover:border-accent hover:text-accent"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill={starred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
        <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** Tiny reach trend for cards. Single series, so no legend. */
export function Sparkline({ points, className = "" }: { points: ReachPoint[]; className?: string }) {
  if (points.length < 2) return <div className={className} />;
  const max = Math.max(...points.map((p) => p.reach)) || 1;
  const d = points
    .map((p, i) => `${i ? "L" : "M"}${((i / (points.length - 1)) * 100).toFixed(2)},${(30 - (p.reach / max) * 28).toFixed(2)}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className={className} aria-hidden>
      <path d={`${d} L100,32 L0,32 Z`} fill="var(--accent-soft)" />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/** Reach-over-time chart with a crosshair tooltip. */
export function ReachChart({ points }: { points: ReachPoint[] }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) {
    return <p className="py-10 text-center text-sm text-text-dim">Not enough history yet - check back in a day or two.</p>;
  }
  const W = 640;
  const H = 220;
  const pad = { l: 48, r: 12, t: 12, b: 26 };
  const max = Math.max(...points.map((p) => p.reach)) * 1.08 || 1;
  const x = (i: number) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.reach)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const xTicks = [0, Math.floor((points.length - 1) / 2), points.length - 1];

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const box = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, i)));
  }

  const hp = hover != null ? points[hover] : null;
  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Reach over time, from ${compact(points[0].reach)} to ${compact(points[points.length - 1].reach)}`}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth="1" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-dim)">
              {compact(t)}
            </text>
          </g>
        ))}
        {xTicks.map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} fontSize="11" fill="var(--text-dim)">
            {shortDate(points[i].date)}
          </text>
        ))}
        <path d={`${line} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="var(--accent-soft)" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
        {hp && (
          <g>
            <line x1={x(hover!)} x2={x(hover!)} y1={pad.t} y2={H - pad.b} stroke="var(--text-dim)" strokeDasharray="3 3" />
            <circle cx={x(hover!)} cy={y(hp.reach)} r="5" fill="var(--accent)" stroke="var(--bg-card)" strokeWidth="2" />
          </g>
        )}
      </svg>
      {hp && (
        <div
          className="pointer-events-none absolute top-1 rounded-lg border border-border-strong bg-bg-elevated px-3 py-2 text-xs shadow-lg"
          style={{ left: `${(x(hover!) / W) * 100}%`, transform: `translateX(${hover! > points.length / 2 ? "-110%" : "10%"})` }}
        >
          <div className="text-text-dim">{new Date(hp.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>
          <div className="font-medium text-text">{hp.reach.toLocaleString("en-GB")} reach</div>
        </div>
      )}
    </div>
  );
}
