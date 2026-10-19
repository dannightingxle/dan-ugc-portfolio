import { z } from "zod";
import { SheetData } from "./types";

/* The personal brand plan: your accounts, the creators you track, the latest
   stats for both, the ideas inbox found in their posts, and the weekly plan
   made from them. */

export const PLATFORMS = ["tiktok", "instagram"] as const;
export type Platform = (typeof PLATFORMS)[number];
export const PLATFORM_LABEL: Record<Platform, string> = { tiktok: "TikTok", instagram: "Instagram" };

export type Handle = { platform: Platform; handle: string; note: string };

/** The sound a post uses. "original" means the creator's own audio (talking, not a sound to reuse). */
export type Sound = { name: string; artist: string; original: boolean; url: string };

export type Post = {
  platform: Platform;
  handle: string;
  mine: boolean;
  url: string;
  caption: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  seconds: number;
  postedAt: string;
  sound?: Sound | null;
};

export const IDEA_EFFORTS = ["no_filming", "quick", "filmed"] as const;
export type IdeaEffort = (typeof IDEA_EFFORTS)[number];
export const EFFORT_LABEL: Record<IdeaEffort, string> = { no_filming: "No filming", quick: "Quick to film", filmed: "Filmed" };

export const IDEA_STATUSES = ["new", "saved", "week", "planned", "dismissed"] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

export const IdeaDraft = z.object({
  sourceUrl: z.string().describe("The post this came from, exactly as given. Empty only for an idea built on a sound alone"),
  handle: z.string().describe("Whose post it is, without the @"),
  effort: z
    .enum(IDEA_EFFORTS)
    .describe("no_filming: made from clips Dan already has (B-roll, photos, screen recordings) + sound + text. quick: one simple shot (lip-sync, point-at-text, green screen). filmed: talking head or scripted"),
  title: z.string().describe("The idea in 3-8 words"),
  why: z.string().describe("Why it's worth doing, with the numbers (e.g. '3.4x her usual views, sound used by 3 creators you track this week')"),
  yourVersion: z.string().describe("Dan's version in 2-3 sentences: what the video is, in his niche and voice. Adapted, never a copy"),
  hook: z.string().describe("The opening line or opening text, ready to use"),
  onScreenText: z.array(z.string()).describe("Every text overlay in order, ready to paste"),
  sound: z.object({ name: z.string(), url: z.string(), note: z.string().describe("How to use it, e.g. 'text changes on the beat at 0:03'. Empty if it's Dan talking") }),
  shots: z.array(z.string()).describe("The clips, in order. For no_filming ideas, clips Dan is likely to have already"),
  photosSearch: z.array(z.string()).describe("1-3 word Apple Photos searches that would find those clips (e.g. 'laptop', 'coffee', 'train'). Empty for filmed ideas"),
  caption: z.string().describe("Post caption with a soft CTA"),
  pillar: z.string().describe("Which content pillar it fits, in a few words"),
});
export type IdeaDraft = z.infer<typeof IdeaDraft>;
export type Idea = IdeaDraft & { id: string; foundAt: string; status: IdeaStatus; reason: string };

export const IdeaScanResult = z.object({
  ideas: z.array(IdeaDraft),
  sounds: z.array(z.object({ name: z.string(), url: z.string(), why: z.string().describe("Who's using it and how it's doing, and how Dan could use it") })).describe("Sounds worth using this week, best first. Empty if none stand out"),
  oneLine: z.string(),
});
export type IdeaScanResult = z.infer<typeof IdeaScanResult>;

export type BrandData = {
  about: string;
  accounts: Handle[];
  tracked: Handle[];
  /** Accounts that post content ideas and formats for creators ("no ideas? do this"). */
  ideaAccounts: Handle[];
  winners: string;
  scriptBank: string;
  notes: string;
  autoPlan: boolean;
  /** Look for new ideas on Monday and Thursday mornings. */
  autoIdeas: boolean;
  ideas: Idea[];
  /** Posts already looked at for ideas, so a scan never pays to watch one twice. */
  seen: string[];
  lastScan: { at: string; sounds: IdeaScanResult["sounds"]; oneLine: string; problems: string[] } | null;
  stats: { at: string; posts: Post[]; problems: string[] } | null;
  lastPlan: { at: string; workingForYou: string[]; notWorking: string[]; fromTracked: { handle: string; idea: string; url: string }[]; plan: string } | null;
};

export function emptyBrand(): BrandData {
  return { about: "", accounts: [], tracked: [], ideaAccounts: [], winners: "", scriptBank: "", notes: "", autoPlan: false, autoIdeas: false, ideas: [], seen: [], lastScan: null, stats: null, lastPlan: null };
}

export function readBrand(raw: unknown): BrandData {
  const b = (raw && typeof raw === "object" ? raw : {}) as Partial<BrandData>;
  return { ...emptyBrand(), ...b };
}

/** "@Name", a profile URL or "name" → "name". */
export function cleanHandle(input: string) {
  const s = input.trim().replace(/\/+$/, "");
  const fromUrl = s.match(/(?:tiktok\.com\/@|instagram\.com\/)([\w.]+)/i)?.[1];
  return (fromUrl ?? s).replace(/^@/, "").toLowerCase();
}

/** How a handle's posts usually do, and which ones beat that. */
export function summarise(posts: Post[]) {
  const groups = new Map<string, Post[]>();
  for (const p of posts) {
    const key = `${p.platform}:${p.handle}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.entries()].map(([key, list]) => {
    const sorted = [...list].map((p) => p.views).sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    const scored = list.map((p) => ({ ...p, ratio: median ? p.views / median : 0 })).sort((a, b) => b.ratio - a.ratio);
    return { key, platform: list[0].platform, handle: list[0].handle, mine: list[0].mine, count: list.length, median, top: scored.slice(0, 5), bottom: scored.slice(-3).reverse() };
  });
}

export const BrandPlanResult = z.object({
  workingForYou: z.array(z.string()).describe("What's working on Dan's own accounts, with the numbers"),
  notWorking: z.array(z.string()).describe("What isn't, with the numbers"),
  fromTracked: z
    .array(z.object({ handle: z.string(), idea: z.string().describe("How Dan could adapt it in his own voice and niche - never a copy"), url: z.string() }))
    .describe("The tracked creators' outliers worth adapting"),
  plan: z.string().describe("This week's plan in a few lines: the mix, the pillars, the posting days"),
  sheet: SheetData,
  ideasUsed: z.array(z.string()).describe("The ids of the inbox ideas this plan turns into videos"),
  scriptBankEntry: z.string().describe("This batch's hooks and angles, one line per video"),
  oneLine: z.string(),
});
export type BrandPlanResult = z.infer<typeof BrandPlanResult>;

const DAY = 86_400_000;

/** Posts worth a closer look for ideas: the tracked creators' recent outliers and the idea accounts' latest posts, skipping any already looked at. */
export function ideaCandidates(brand: BrandData, now = Date.now()) {
  const seen = new Set([...brand.seen, ...brand.ideas.map((i) => i.sourceUrl)]);
  const ideaHandles = new Set(brand.ideaAccounts.map((h) => `${h.platform}:${cleanHandle(h.handle)}`));
  const recent = (p: Post, days: number) => !p.postedAt || now - Date.parse(p.postedAt) < days * DAY;
  const out: (Post & { ratio: number; median: number; ideaAccount: boolean; template: boolean })[] = [];
  for (const g of summarise((brand.stats?.posts ?? []).filter((p) => !p.mine))) {
    const ideaAccount = ideaHandles.has(g.key);
    const all = (brand.stats?.posts ?? []).filter((p) => `${p.platform}:${p.handle}` === g.key);
    const scored = all.map((p) => ({ ...p, ratio: g.median ? p.views / g.median : 0, median: g.median, ideaAccount, template: looksTemplate(p) }));
    const fresh = scored.filter((p) => !seen.has(p.url) && recent(p, ideaAccount ? 14 : 30)).sort((a, b) => b.ratio - a.ratio);
    // An idea account's newest ideas are worth reading whatever their views; anyone else's only when they beat their usual.
    out.push(...(ideaAccount ? fresh.slice(0, 3) : fresh.filter((p) => p.ratio >= 1.8).slice(0, 4)));
  }
  // Best first, taking turns between the idea accounts and everyone else so neither crowds out the other.
  const best = (list: typeof out) => list.sort((a, b) => Number(b.template) - Number(a.template) || b.ratio - a.ratio);
  const ideas = best(out.filter((p) => p.ideaAccount));
  const outliers = best(out.filter((p) => !p.ideaAccount));
  return Array.from({ length: Math.max(ideas.length, outliers.length) }, (_, i) => [outliers[i], ideas[i]]).flat().filter((p) => p !== undefined);
}

/** A video where the format does the work, not the person: a reused sound and short. */
export function looksTemplate(p: Post) {
  return Boolean(p.sound && !p.sound.original && p.seconds > 0 && p.seconds <= 25);
}

/** Sounds the creators you track are using: how many of them, and how those posts did against each one's usual. */
export function soundsInUse(posts: Post[], now = Date.now()) {
  const medians = new Map(summarise(posts).map((g) => [g.key, g.median]));
  const by = new Map<string, { sound: Sound; handles: Set<string>; best: number; posts: number }>();
  for (const p of posts) {
    if (p.mine || !p.sound || p.sound.original || !p.sound.name || (p.postedAt && now - Date.parse(p.postedAt) > 30 * DAY)) continue;
    const key = `${p.platform}:${p.sound.url || p.sound.name.toLowerCase()}`;
    const median = medians.get(`${p.platform}:${p.handle}`) ?? 0;
    const s = by.get(key) ?? { sound: p.sound, handles: new Set<string>(), best: 0, posts: 0 };
    s.handles.add(p.handle);
    s.best = Math.max(s.best, median ? p.views / median : 0);
    s.posts++;
    by.set(key, s);
  }
  return [...by.values()]
    .filter((s) => s.handles.size >= 2 || s.best >= 2)
    .sort((a, b) => b.handles.size - a.handles.size || b.best - a.best)
    .slice(0, 10);
}
