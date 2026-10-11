import { z } from "zod";
import { SheetData } from "./types";

/* The personal brand plan: your accounts, the creators you track, the latest
   stats for both, and the weekly plan made from them. */

export const PLATFORMS = ["tiktok", "instagram"] as const;
export type Platform = (typeof PLATFORMS)[number];
export const PLATFORM_LABEL: Record<Platform, string> = { tiktok: "TikTok", instagram: "Instagram" };

export type Handle = { platform: Platform; handle: string; note: string };

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
};

export type BrandData = {
  about: string;
  accounts: Handle[];
  tracked: Handle[];
  winners: string;
  scriptBank: string;
  notes: string;
  autoPlan: boolean;
  stats: { at: string; posts: Post[]; problems: string[] } | null;
  lastPlan: { at: string; workingForYou: string[]; notWorking: string[]; fromTracked: { handle: string; idea: string; url: string }[]; plan: string } | null;
};

export function emptyBrand(): BrandData {
  return { about: "", accounts: [], tracked: [], winners: "", scriptBank: "", notes: "", autoPlan: false, stats: null, lastPlan: null };
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
  scriptBankEntry: z.string().describe("This batch's hooks and angles, one line per video"),
  oneLine: z.string(),
});
export type BrandPlanResult = z.infer<typeof BrandPlanResult>;
