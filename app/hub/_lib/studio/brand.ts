import "server-only";
import { adminClient } from "../supabase/admin";
import type { HubUser } from "../supabase/server";
import { StudioError, ask } from "./claude";
import { BRAND_ID, saveSheet } from "./data";
import { pullPosts } from "./apify";
import { SYSTEM_BRAND } from "./prompts";
import { BrandPlanResult, PLATFORM_LABEL, readBrand, summarise, type BrandData } from "./brand-types";
import type { Upload } from "./jobs";

/* The personal brand plan: stored as a workspace row under BRAND_ID, with
   its shoot sheets alongside the job ones. */

export async function getBrand(userId: string): Promise<BrandData> {
  const { data, error } = await adminClient().from("hub_workspaces").select("data").eq("user_id", userId).eq("project_id", BRAND_ID).maybeSingle<{ data: unknown }>();
  if (error) throw error;
  return readBrand(data?.data);
}

export async function saveBrand(userId: string, brand: BrandData): Promise<BrandData> {
  const { error } = await adminClient()
    .from("hub_workspaces")
    .upsert({ user_id: userId, project_id: BRAND_ID, data: brand, updated_at: new Date().toISOString() });
  if (error) throw error;
  return brand;
}

/** Pull the latest public stats for your accounts and the creators you track. */
export async function refreshStats(userId: string): Promise<BrandData> {
  const brand = await getBrand(userId);
  if (!brand.accounts.length && !brand.tracked.length) throw new StudioError("Add your accounts or some creators to track first.");
  const { posts, problems } = await pullPosts(brand.accounts, brand.tracked);
  return saveBrand(userId, { ...(await getBrand(userId)), stats: { at: new Date().toISOString(), posts, problems } });
}

const k = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}m` : n >= 1_000 ? `${Math.round(n / 100) / 10}k` : String(n));
const day = (iso: string) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "?");

/** The stats as a compact briefing: each account's median and its best and worst posts. */
function statsBriefing(brand: BrandData) {
  if (!brand.stats?.posts.length) return "No stats pulled yet.";
  const lines: string[] = [`Stats pulled ${day(brand.stats.at)}.`];
  const groups = summarise(brand.stats.posts).sort((a, b) => Number(b.mine) - Number(a.mine));
  for (const g of groups) {
    const note = [...brand.accounts, ...brand.tracked].find((h) => h.platform === g.platform && h.handle.replace(/^@/, "").toLowerCase() === g.handle)?.note;
    lines.push(`\n### ${g.mine ? "DAN'S ACCOUNT" : "Tracked"}: @${g.handle} on ${PLATFORM_LABEL[g.platform]} - median ${k(g.median)} views over ${g.count} recent posts${note ? ` (${note})` : ""}`);
    const show = (p: (typeof g.top)[number]) =>
      `- ${p.ratio.toFixed(1)}x · ${k(p.views)} views · ${k(p.likes)} likes · ${k(p.comments)} comments${p.shares ? ` · ${k(p.shares)} shares` : ""} · ${Math.round(p.seconds)}s · ${day(p.postedAt)} · ${p.url}\n  "${p.caption.replace(/\s+/g, " ").slice(0, 280)}"`;
    lines.push("Best:", ...g.top.map(show));
    if (g.mine) lines.push("Weakest:", ...g.bottom.map(show));
  }
  if (brand.stats.problems.length) lines.push(`\nCouldn't read: ${brand.stats.problems.join("; ")}`);
  return lines.join("\n");
}

export async function makeBrandPlan(user: HubUser, input: { videos: number; filmingOn: string; notes: string; uploads: Upload[] }) {
  const brand = await getBrand(user.id);
  const context = [
    "# Personal brand",
    "## About",
    brand.about || "(not written yet - infer from the accounts and posts)",
    "## Accounts",
    brand.accounts.map((a) => `- @${a.handle} on ${PLATFORM_LABEL[a.platform]}`).join("\n") || "(none)",
    "## Creators tracked",
    brand.tracked.map((a) => `- @${a.handle} on ${PLATFORM_LABEL[a.platform]}${a.note ? ` - ${a.note}` : ""}`).join("\n") || "(none)",
    "## File: winners",
    brand.winners || "(empty)",
    "## File: script-bank",
    brand.scriptBank || "(empty)",
  ].join("\n\n");

  const result = await ask({
    system: SYSTEM_BRAND,
    context,
    content: [
      ...input.uploads.flatMap((u): import("@anthropic-ai/sdk").default.Beta.BetaContentBlockParam[] =>
        u.type === "image/png" || u.type === "image/jpeg" || u.type === "image/webp" || u.type === "image/gif"
          ? [{ type: "image", source: { type: "base64", media_type: u.type, data: u.data } }]
          : u.type === "application/pdf"
            ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: u.data }, title: u.name }]
            : [],
      ),
      {
        type: "text",
        text: [
          `Plan this week's content: ${input.videos} videos. Today is ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}. Filming: ${input.filmingOn || "around the week"}.`,
          statsBriefing(brand),
          (input.notes || brand.notes) && `Notes from Dan: ${input.notes || brand.notes}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    schema: BrandPlanResult,
    effort: "medium",
  });

  const title = `Personal brand · ${result.sheet.h1} · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
  const id = await saveSheet(user.id, BRAND_ID, title, result.sheet);
  const latest = await getBrand(user.id);
  const saved = await saveBrand(user.id, {
    ...latest,
    scriptBank: [`## ${title}\n${result.scriptBankEntry.trim()}`, latest.scriptBank.trim()].filter(Boolean).join("\n\n"),
    lastPlan: { at: new Date().toISOString(), workingForYou: result.workingForYou, notWorking: result.notWorking, fromTracked: result.fromTracked, plan: result.plan },
  });
  return { id, oneLine: result.oneLine, brand: saved };
}
