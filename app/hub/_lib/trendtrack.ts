import type { Ad, AdDetail, Brand, Paged, ReachPoint, Source } from "./types";
import * as demo from "./demo-data";
import type { TrendTrack } from "./trendtrack-access";

/* Server-side TrendTrack client. The API key never reaches the browser: pages
   call /api/hub/*, those routes work out whose key to use (trendtrack-access.ts)
   and call this file. Spec: api.trendtrack.io/v1/openapi.json */

const BASE = "https://api.trendtrack.io/v1";

/** This creator hasn't connected TrendTrack (and isn't asking for sample data). */
export class NotConnected extends Error {}

/** The key to call TrendTrack with, or null to answer from the made-up demo brands. */
function keyFor(ctx: TrendTrack, sample: boolean): string | null {
  if (sample || ctx.mode === "demo") return null;
  if (ctx.mode === "none") throw new NotConnected("Connect TrendTrack to search real ads.");
  return ctx.key;
}

async function tt<T>(key: string, path: string, revalidate: number): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { Authorization: `Bearer ${key}` },
    // Cache upstream responses so repeat views don't burn credits. The key is
    // part of the cache key, so creators never see each other's cached calls.
    next: { revalidate },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("TrendTrack rejected the API key - reconnect TrendTrack in your account.");
    throw new Error(`TrendTrack ${res.status} on ${path}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

/* ---- Raw response shapes (only the fields we read) ---- */

type RawAd = {
  id: string;
  status?: Ad["status"];
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  daysRunning?: number | null;
  media?: { type?: Ad["mediaType"]; thumbnailUrl?: string | null; mediaUrl?: string | null };
  advertiser?: { id?: string | null; name?: string | null; logoUrl?: string | null; facebookPageId?: string | null };
  content?: { title?: string | null; body?: string | null; transcript?: string | null; landingPageUrl?: string | null };
  metrics?: {
    reach?: number | null;
    estimatedSpend?: number | null;
    duplicates?: number | null;
    reachDelta7d?: number | null;
    reachDelta30d?: number | null;
  };
  audience?: { targetedCountries?: string[] };
  flags?: { hasPartnerBadge?: boolean | null };
};

type RawLookup = {
  data: {
    type: "brandtracker" | "advertiser" | "shop";
    advertiser?: { id?: string; name?: string; facebookPageId?: string } | null;
    brandtracker?: { id?: string; name?: string; facebookPageId?: string } | null;
    signals?: { activeAds?: number | null; liveAdsCount?: number | null; reach30d?: number | null } | null;
  }[];
};

function normalizeAd(a: RawAd): Ad {
  return {
    id: a.id,
    status: a.status ?? "unknown",
    brandId: a.advertiser?.facebookPageId ?? a.advertiser?.id ?? "",
    brandName: a.advertiser?.name ?? "Unknown brand",
    brandLogo: a.advertiser?.logoUrl ?? null,
    mediaType: a.media?.type ?? "unknown",
    thumbnailUrl: a.media?.thumbnailUrl ?? null,
    mediaUrl: a.media?.mediaUrl ?? null,
    firstSeenAt: a.firstSeenAt ?? null,
    lastSeenAt: a.lastSeenAt ?? null,
    daysRunning: a.daysRunning ?? null,
    title: a.content?.title ?? null,
    body: a.content?.body ?? null,
    transcript: a.content?.transcript ?? null,
    landingPage: a.content?.landingPageUrl ?? null,
    reach: a.metrics?.reach ?? null,
    estimatedSpend: a.metrics?.estimatedSpend ?? null,
    duplicates: a.metrics?.duplicates ?? null,
    reachDelta7d: a.metrics?.reachDelta7d ?? null,
    reachDelta30d: a.metrics?.reachDelta30d ?? null,
    partner: Boolean(a.flags?.hasPartnerBadge),
    countries: a.audience?.targetedCountries ?? [],
  };
}

/* ---- Public functions used by the API routes ---- */

/** Brand name / domain / Instagram handle -> advertisers. Zero credits. */
export async function lookupBrands(ctx: TrendTrack, q: string, sample = false): Promise<Paged<Brand>> {
  const key = keyFor(ctx, sample);
  if (!key) return demo.lookupBrands(q);
  const raw = await tt<RawLookup>(key, `/lookup?q=${encodeURIComponent(q)}&limit=10`, 3600);
  const seen = new Set<string>();
  const items: Brand[] = [];
  for (const r of raw.data) {
    const who = r.advertiser ?? r.brandtracker;
    const id = who?.facebookPageId ?? (r.type === "advertiser" ? who?.id : undefined);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      name: who?.name ?? id,
      liveAds: r.signals?.liveAdsCount ?? r.signals?.activeAds ?? null,
      reach30d: r.signals?.reach30d ?? null,
    });
  }
  return { source: "live", items, total: items.length };
}

export type AdsQuery = {
  status: "all" | "active" | "inactive";
  mediaType: "all" | "image" | "video";
  sortBy: "newest" | "longestRunning" | "reach";
  offset: number;
};

/** A brand's Meta ads. Costs credits per row returned. */
export async function brandAds(ctx: TrendTrack, brandId: string, q: AdsQuery, sample = false): Promise<Paged<Ad>> {
  // Demo brands always answer from demo data (e.g. sample ads starred earlier).
  const key = brandId.startsWith("demo-") ? null : keyFor(ctx, sample);
  if (!key) return demo.brandAds(brandId, q);
  const params = new URLSearchParams({
    limit: "24",
    offset: String(q.offset),
    status: q.status,
    mediaType: q.mediaType,
    sortBy: q.sortBy,
    order: "desc",
  });
  const raw = await tt<{ data: RawAd[]; pagination: { total: number } }>(
    key,
    `/advertisers/${encodeURIComponent(brandId)}/ads?${params}`,
    3600,
  );
  return { source: "live", items: raw.data.map(normalizeAd), total: raw.pagination.total };
}

/** One ad plus its daily reach history - the "track over time" data. */
export async function adDetail(ctx: TrendTrack, adId: string): Promise<AdDetail & { source: Source }> {
  const key = adId.startsWith("demo-") ? null : keyFor(ctx, false);
  if (!key) return { source: "demo", ...demo.adDetail(adId) };
  const id = encodeURIComponent(adId);
  const [ad, history] = await Promise.all([
    tt<{ data: RawAd }>(key, `/ads/${id}`, 6 * 3600),
    tt<{ data: { date: string; reach: number | null }[] }>(key, `/ads/${id}/reach-history?limit=365`, 6 * 3600),
  ]);
  const points: ReachPoint[] = history.data
    .filter((p): p is ReachPoint => typeof p.reach === "number")
    .sort((a, b) => a.date.localeCompare(b.date));
  return { source: "live", ad: normalizeAd(ad.data), history: points };
}
