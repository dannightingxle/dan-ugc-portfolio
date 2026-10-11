import "server-only";
import { cleanHandle, type Handle, type Post } from "./brand-types";

/* Public post stats for TikTok and Instagram accounts, via Apify's
   pay-per-result scrapers (clockworks/tiktok-profile-scraper and
   apify/instagram-reel-scraper). Needs APIFY_TOKEN. Each run waits for the
   results (Apify allows up to 5 minutes). */

const TOKEN = process.env.APIFY_TOKEN ?? "";
export const apifyEnabled = Boolean(TOKEN);
// Tests point this at a local stand-in.
const BASE = process.env.APIFY_API_BASE || "https://api.apify.com";

const POSTS_PER_ACCOUNT = 20;

type Item = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === "string" ? v : "");

async function run(actor: string, input: object): Promise<Item[]> {
  const url = `${BASE}/v2/acts/${actor.replace("/", "~")}/run-sync-get-dataset-items?timeout=240&clean=true`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(270_000),
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) throw new Error("Apify didn't accept the token - check APIFY_TOKEN.");
  if (res.status === 402) throw new Error("Your Apify account is out of credit.");
  if (!res.ok) throw new Error(`Apify had a problem (${res.status}).`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function tiktok(items: Item[], mine: Set<string>): Post[] {
  return items
    .filter((i) => !i.isPinned && !i.isAd && str(i.webVideoUrl))
    .map((i) => {
      const author = (i.authorMeta ?? {}) as Item;
      const video = (i.videoMeta ?? {}) as Item;
      const handle = (str(author.name) || str(i.input)).toLowerCase();
      return {
        platform: "tiktok" as const,
        handle,
        mine: mine.has(handle),
        url: str(i.webVideoUrl),
        caption: str(i.text).slice(0, 600),
        views: num(i.playCount),
        likes: num(i.diggCount),
        comments: num(i.commentCount),
        shares: num(i.shareCount),
        seconds: num(video.duration),
        postedAt: str(i.createTimeISO),
      };
    });
}

function instagram(items: Item[], mine: Set<string>): Post[] {
  return items
    .filter((i) => !i.error && !i.isPinned && str(i.url))
    .map((i) => {
      const handle = str(i.ownerUsername).toLowerCase();
      return {
        platform: "instagram" as const,
        handle,
        mine: mine.has(handle),
        url: str(i.url),
        caption: str(i.caption).slice(0, 600),
        views: num(i.videoPlayCount) || num(i.videoViewCount),
        likes: num(i.likesCount),
        comments: num(i.commentsCount),
        shares: 0,
        seconds: num(i.videoDuration),
        postedAt: str(i.timestamp),
      };
    });
}

/** The latest posts for your accounts and the creators you track. */
export async function pullPosts(accounts: Handle[], tracked: Handle[]): Promise<{ posts: Post[]; problems: string[] }> {
  const all = [...accounts, ...tracked];
  const handles = (platform: Handle["platform"]) => [...new Set(all.filter((h) => h.platform === platform).map((h) => cleanHandle(h.handle)).filter(Boolean))];
  const mine = new Set(accounts.map((h) => cleanHandle(h.handle)));
  const tt = handles("tiktok");
  const ig = handles("instagram");
  const problems: string[] = [];

  const [ttPosts, igPosts] = await Promise.all([
    tt.length
      ? run("clockworks/tiktok-profile-scraper", { profiles: tt, resultsPerPage: POSTS_PER_ACCOUNT, profileSorting: "latest", excludePinnedPosts: true })
          .then((items) => tiktok(items, mine))
          .catch((e: Error) => (problems.push(`TikTok: ${e.message}`), []))
      : [],
    ig.length
      ? run("apify/instagram-reel-scraper", { username: ig, resultsLimit: POSTS_PER_ACCOUNT, skipPinnedPosts: true })
          .then((items) => instagram(items, mine))
          .catch((e: Error) => (problems.push(`Instagram: ${e.message}`), []))
      : [],
  ]);
  const posts = [...ttPosts, ...igPosts];
  for (const h of [...tt.map((x) => ["tiktok", x]), ...ig.map((x) => ["instagram", x])]) {
    if (!posts.some((p) => p.platform === h[0] && p.handle === h[1]) && !problems.some((p) => p.startsWith(h[0] === "tiktok" ? "TikTok" : "Instagram"))) {
      problems.push(`No posts found for @${h[1]} on ${h[0] === "tiktok" ? "TikTok" : "Instagram"} - check the handle (private accounts can't be read).`);
    }
  }
  return { posts, problems };
}
