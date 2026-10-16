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

async function run(actor: string, input: object, seconds = 240): Promise<Item[]> {
  const url = `${BASE}/v2/acts/${actor.replace("/", "~")}/run-sync-get-dataset-items?timeout=${seconds}&clean=true`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout((seconds + 30) * 1000),
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

/** Followers for each account, keyed "platform:handle". TikTok's come with its posts; Instagram's need a profile lookup. */
function tiktokFollowers(items: Item[]) {
  const out: Record<string, number> = {};
  for (const i of items) {
    const author = (i.authorMeta ?? {}) as Item;
    const handle = str(author.name).toLowerCase();
    if (handle && typeof author.fans === "number") out[`tiktok:${handle}`] = author.fans;
  }
  return out;
}

/** Your own accounts: their latest posts and follower counts. */
export async function pullAccounts(accounts: { platform: Handle["platform"]; handle: string }[]): Promise<{ posts: Post[]; followers: Record<string, number>; problems: string[] }> {
  const handles = (platform: Handle["platform"]) => [...new Set(accounts.filter((h) => h.platform === platform).map((h) => cleanHandle(h.handle)).filter(Boolean))];
  const tt = handles("tiktok");
  const ig = handles("instagram");
  const mine = new Set([...tt, ...ig]);
  const problems: string[] = [];
  const followers: Record<string, number> = {};
  const fail = (label: string) => (e: Error) => (problems.push(`${label}: ${e.message}`), [] as Item[]);

  const [ttItems, igPosts, igProfiles] = await Promise.all([
    tt.length ? run("clockworks/tiktok-profile-scraper", { profiles: tt, resultsPerPage: POSTS_PER_ACCOUNT, profileSorting: "latest", excludePinnedPosts: true }).catch(fail("TikTok")) : [],
    ig.length ? run("apify/instagram-reel-scraper", { username: ig, resultsLimit: POSTS_PER_ACCOUNT, skipPinnedPosts: true }).catch(fail("Instagram")) : [],
    ig.length ? run("apify/instagram-profile-scraper", { usernames: ig }).catch(fail("Instagram followers")) : [],
  ]);
  Object.assign(followers, tiktokFollowers(ttItems));
  for (const p of igProfiles) {
    const handle = str(p.username).toLowerCase();
    if (handle && typeof p.followersCount === "number") followers[`instagram:${handle}`] = p.followersCount;
  }
  const posts = [...tiktok(ttItems, mine), ...instagram(igPosts, mine)];
  for (const [platform, list] of [["tiktok", tt], ["instagram", ig]] as const) {
    for (const h of list) {
      if (!posts.some((p) => p.platform === platform && p.handle === h) && followers[`${platform}:${h}`] == null) {
        problems.push(`Nothing found for @${h} on ${platform === "tiktok" ? "TikTok" : "Instagram"} - check the handle (private accounts can't be read).`);
      }
    }
  }
  return { posts, followers, problems };
}

/** A TikTok or Instagram video, ready to download: where the file is, its caption and what's said in it. */
export type SocialVideo = { label: string; download: string; caption: string; transcript: string; subtitles: string };

const pick = (items: Item[], url: string, keys: string[]) => items.find((i) => keys.some((k) => str(i[k]) === url));

/** Download links for reference videos, keyed by the link given. A video Apify couldn't get is left out. */
export async function fetchSocialVideos(links: { url: string; kind: "tiktok" | "instagram" }[]): Promise<{ videos: Record<string, SocialVideo>; problem: string }> {
  const tt = links.filter((l) => l.kind === "tiktok").map((l) => l.url);
  const ig = links.filter((l) => l.kind === "instagram").map((l) => l.url);
  const videos: Record<string, SocialVideo> = {};
  let problem = "";
  const fail = (e: Error) => ((problem = e.message.replace(/\.$/, "")), [] as Item[]);
  // Short enough to leave the shoot sheet most of its time.
  const [ttItems, igItems] = await Promise.all([
    tt.length ? run("clockworks/tiktok-scraper", { postURLs: tt, shouldDownloadVideos: true, downloadSubtitlesOptions: "DOWNLOAD_AND_TRANSCRIBE_VIDEOS_WITHOUT_SUBTITLES" }, 90).catch(fail) : [],
    ig.length ? run("apify/instagram-reel-scraper", { username: ig, resultsLimit: 1, includeTranscript: true }, 90).catch(fail) : [],
  ]);
  for (const url of tt) {
    const id = /\/video\/(\d+)/.exec(url)?.[1];
    const i = pick(ttItems, url, ["submittedVideoUrl", "input", "webVideoUrl"]) ?? (id ? ttItems.find((x) => str(x.id) === id) : undefined) ?? (tt.length === 1 ? ttItems[0] : undefined);
    if (!i || i.error) continue;
    const meta = (i.videoMeta ?? {}) as Item;
    const download = str(meta.downloadAddr) || (Array.isArray(i.mediaUrls) ? str(i.mediaUrls[0]) : "");
    if (!download) continue;
    const subs = (Array.isArray(meta.subtitleLinks) ? meta.subtitleLinks : []) as Item[];
    const sub = subs.find((x) => /^en/i.test(str(x.language))) ?? subs[0];
    const author = str(((i.authorMeta ?? {}) as Item).name);
    videos[url] = { label: `TikTok${author ? ` by @${author}` : ""}`, download, caption: str(i.text).slice(0, 600), transcript: "", subtitles: str(sub?.downloadLink) || str(meta.transcriptionLink) };
  }
  for (const url of ig) {
    const code = /\/(?:reels?|p|tv)\/([\w-]+)/.exec(url)?.[1];
    const i = pick(igItems, url, ["inputUrl", "url"]) ?? (code ? igItems.find((x) => str(x.shortCode) === code) : undefined) ?? (ig.length === 1 ? igItems[0] : undefined);
    if (!i || i.error || !str(i.videoUrl)) continue;
    const owner = str(i.ownerUsername);
    videos[url] = { label: `Instagram reel${owner ? ` by @${owner}` : ""}`, download: str(i.videoUrl), caption: str(i.caption).slice(0, 600), transcript: str(i.transcript).slice(0, 8000), subtitles: "" };
  }
  return { videos, problem };
}
