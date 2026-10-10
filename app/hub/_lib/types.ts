/* Shapes the hub UI works with. The TrendTrack adapter (trendtrack.ts) and the
   demo data (demo-data.ts) both produce these, so the pages never care which
   one is behind them. */

export type Brand = {
  /** Facebook page id - TrendTrack's advertiser id. */
  id: string;
  name: string;
  liveAds: number | null;
  reach30d: number | null;
};

export type Ad = {
  id: string;
  status: "active" | "inactive" | "unknown";
  brandId: string;
  brandName: string;
  brandLogo: string | null;
  mediaType: "image" | "video" | "carousel" | "unknown";
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  daysRunning: number | null;
  title: string | null;
  body: string | null;
  transcript: string | null;
  landingPage: string | null;
  reach: number | null;
  estimatedSpend: number | null;
  duplicates: number | null;
  reachDelta7d: number | null;
  reachDelta30d: number | null;
  /** Partnership ad (runs with a creator's handle) - usually a UGC ad. */
  partner: boolean;
  countries: string[];
};

export type ReachPoint = { date: string; reach: number };

export type AdDetail = { ad: Ad; history: ReachPoint[] };

/** Every API response says whether it came from TrendTrack or demo data. */
export type Source = "live" | "demo";

/** Where a creator's ad data comes from; "none" = they haven't connected TrendTrack. */
export type DataSource = Source | "none";

export type Paged<T> = { source: Source; items: T[]; total: number };
