import type { Ad, AdDetail, Brand, Paged, ReachPoint } from "./types";
import type { AdsQuery } from "./trendtrack";

/* Made-up brands and ads so the hub works before TrendTrack is connected.
   Deterministic (seeded), so the same ad always shows the same numbers. */

const BRANDS: Brand[] = [
  { id: "demo-northmoor", name: "Northmoor Nutrition", liveAds: 0, reach30d: 0 },
  { id: "demo-pebble", name: "Pebble & Pip Kids", liveAds: 0, reach30d: 0 },
  { id: "demo-stillwater", name: "Stillwater Sleep", liveAds: 0, reach30d: 0 },
  { id: "demo-fernhill", name: "Fernhill Deodorant", liveAds: 0, reach30d: 0 },
];

const HOOKS = [
  "I didn't think a protein shake could taste like this…",
  "Dads, this one's for you.",
  "POV: you finally slept through the night.",
  "Three reasons I switched and never went back.",
  "My wife made me try this. She was right.",
  "Stop scrolling if you're always tired at 3pm.",
  "I tested this for 30 days so you don't have to.",
  "The school run just got easier.",
];

const BODIES = [
  "Honestly I was sceptical. But two weeks in and it's part of my routine - no faff, tastes great, and the kids keep nicking it.",
  "It's the little things. This saves me ten minutes every morning and that's ten more minutes with a coffee.",
  "I've tried the cheap ones and the fancy ones. This is the one that actually stuck.",
];

const CTAS = ["Link's below - use my code for 20% off.", "Tap Shop Now and try it for yourself.", "Grab yours before they sell out again."];

function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;
const today = () => new Date(new Date().toISOString().slice(0, 10)).getTime();
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

function makeAd(brand: Brand, i: number): Ad {
  const r = rng(brand.id + i);
  const daysRunning = Math.round(3 + r() * 85);
  const active = r() > 0.25;
  const ended = active ? 0 : Math.round(1 + r() * 20);
  const first = today() - (daysRunning + ended) * DAY;
  const reach = Math.round(5_000 + r() ** 2 * 2_400_000);
  const hook = HOOKS[Math.floor(r() * HOOKS.length)];
  const body = BODIES[Math.floor(r() * BODIES.length)];
  const cta = CTAS[Math.floor(r() * CTAS.length)];
  return {
    id: `${brand.id}_ad${i}`,
    status: active ? "active" : "inactive",
    brandId: brand.id,
    brandName: brand.name,
    brandLogo: null,
    mediaType: r() > 0.2 ? "video" : "image",
    thumbnailUrl: null,
    mediaUrl: null,
    firstSeenAt: iso(first),
    lastSeenAt: iso(today() - ended * DAY),
    daysRunning,
    title: hook,
    body: `${hook} ${body}`,
    transcript: `${hook}\n\n${body}\n\n${cta}`,
    landingPage: `https://${brand.name.toLowerCase().replace(/[^a-z]+/g, "")}.example/shop`,
    reach,
    estimatedSpend: Math.round((reach / 1000) * 9),
    duplicates: Math.round(r() * 12),
    reachDelta7d: active ? Math.round(reach * (0.02 + r() * 0.25)) : 0,
    reachDelta30d: active ? Math.round(reach * (0.1 + r() * 0.5)) : Math.round(reach * r() * 0.1),
    partner: r() > 0.45,
    countries: r() > 0.5 ? ["GB"] : ["GB", "IE"],
  };
}

const ADS: Record<string, Ad[]> = Object.fromEntries(
  BRANDS.map((b) => [b.id, Array.from({ length: 18 }, (_, i) => makeAd(b, i))]),
);
for (const b of BRANDS) {
  b.liveAds = ADS[b.id].filter((a) => a.status === "active").length;
  b.reach30d = ADS[b.id].reduce((s, a) => s + (a.reachDelta30d ?? 0), 0);
}

export function lookupBrands(q: string): Paged<Brand> {
  const needle = q.trim().toLowerCase();
  // Any search finds something in demo mode, matches first.
  const items = [...BRANDS].sort(
    (a, b) => Number(b.name.toLowerCase().includes(needle)) - Number(a.name.toLowerCase().includes(needle)),
  );
  return { source: "demo", items, total: items.length };
}

export function brandAds(brandId: string, q: AdsQuery): Paged<Ad> {
  let items = ADS[brandId] ?? [];
  if (q.status !== "all") items = items.filter((a) => a.status === q.status);
  if (q.mediaType !== "all") items = items.filter((a) => a.mediaType === q.mediaType);
  const key = { newest: "firstSeenAt", longestRunning: "daysRunning", reach: "reach" }[q.sortBy] as keyof Ad;
  items = [...items].sort((a, b) => ((b[key] ?? 0) > (a[key] ?? 0) ? 1 : -1));
  return { source: "demo", items: items.slice(q.offset, q.offset + 24), total: items.length };
}

export function adDetail(adId: string): AdDetail {
  const brandId = adId.split("_ad")[0];
  const ad = ADS[brandId]?.find((a) => a.id === adId);
  if (!ad) throw new Error("Ad not found");
  // Cumulative reach shaped like a real ad: slow start, scale, then plateau.
  const r = rng(adId + "h");
  const start = new Date(ad.firstSeenAt!).getTime();
  const end = new Date(ad.lastSeenAt!).getTime();
  const days = Math.max(1, Math.round((end - start) / DAY));
  const history: ReachPoint[] = [];
  for (let d = 0; d <= days; d++) {
    const x = d / days;
    const curve = 1 / (1 + Math.exp(-10 * (x - 0.45)));
    const jitter = 1 + (r() - 0.5) * 0.04;
    history.push({ date: iso(start + d * DAY), reach: Math.round(ad.reach! * curve * jitter) });
  }
  history[history.length - 1].reach = ad.reach!;
  for (const p of history) p.reach = Math.min(p.reach, ad.reach!);
  for (let i = 1; i < history.length; i++) history[i].reach = Math.max(history[i].reach, history[i - 1].reach);
  return { ad, history };
}
