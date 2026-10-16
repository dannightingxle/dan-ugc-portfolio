import type { Platform, Post } from "../studio/brand-types";

/* Accounts: the creator's own TikTok / Instagram accounts (personal ones from
   the brand plan, plus each tech UGC job's), with a daily snapshot of
   followers and recent posts. Safe to import anywhere. */

export type AccountGroup = { kind: "personal" } | { kind: "job"; id: string; name: string };

export type Snapshot = { day: string; followers: number | null };

export type AccountView = {
  key: string;
  platform: Platform;
  handle: string;
  group: AccountGroup;
  /** Oldest first, up to 90 days. */
  snapshots: Snapshot[];
  posts: Post[];
  pulledAt: string | null;
};

export type AccountsData = {
  accounts: AccountView[];
  autoDaily: boolean;
  lastRefresh: string | null;
  problems: string[];
  apify: boolean;
};

export const accountKey = (platform: Platform, handle: string) => `${platform}:${handle}`;

export function profileUrl(platform: Platform, handle: string) {
  return platform === "tiktok" ? `https://www.tiktok.com/@${handle}` : `https://www.instagram.com/${handle}/`;
}

/** Middle value of a list (0 when empty). */
export function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

/** Followers now, and the change since the snapshot nearest to `days` ago (null until there's one that old). */
export function followerChange(snapshots: Snapshot[], days: number) {
  const known = snapshots.filter((s) => s.followers != null);
  const now = known.at(-1);
  if (!now) return { now: null, change: null };
  const cutoff = new Date(Date.parse(now.day) - days * 86_400_000).toISOString().slice(0, 10);
  const then = [...known].reverse().find((s) => s.day <= cutoff);
  return { now: now.followers, change: then ? (now.followers ?? 0) - (then.followers ?? 0) : null };
}

/** The account's recent posts in numbers: usual views, and views and posts in the last week. */
export function postSummary(posts: Post[], now = Date.now()) {
  const usual = median(posts.map((p) => p.views));
  const week = posts.filter((p) => p.postedAt && now - Date.parse(p.postedAt) < 7 * 86_400_000);
  return {
    usual,
    weekPosts: week.length,
    weekViews: week.reduce((n, p) => n + p.views, 0),
    withComments: posts.filter((p) => p.comments > 0).length,
  };
}

/** 1,284 / 12.9k / 4.2m */
export function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}m`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}k`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("en-GB");
}
