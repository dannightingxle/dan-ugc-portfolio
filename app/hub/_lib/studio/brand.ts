import "server-only";
import { adminClient } from "../supabase/admin";
import type { HubUser } from "../supabase/server";
import { StudioError, ask } from "./claude";
import { BRAND_ID, saveSheet } from "./data";
import { pullPosts } from "./apify";
import { SYSTEM_BRAND, SYSTEM_IDEAS } from "./prompts";
import { videoBlocks, watchVideos } from "./videos";
import {
  BrandPlanResult,
  EFFORT_LABEL,
  IdeaScanResult,
  PLATFORM_LABEL,
  ideaCandidates,
  ideaEditBrief,
  readBrand,
  soundsInUse,
  summarise,
  type BrandData,
  type Idea,
  type IdeaStatus,
} from "./brand-types";
import type { Upload } from "./jobs";
import { addEvents, createEdit, updateEdit } from "../edits/data";

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
  if (!brand.accounts.length && !brand.tracked.length && !brand.ideaAccounts.length) throw new StudioError("Add your accounts or some creators to track first.");
  const { posts, problems } = await pullPosts(brand.accounts, [...brand.tracked, ...brand.ideaAccounts]);
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
  const picked = brand.ideas.filter((i) => i.status === "week");
  const saved = brand.ideas.filter((i) => i.status === "saved");
  const fresh = brand.ideas.filter((i) => i.status === "new").slice(0, 10);
  const ideas = [
    picked.length && `Ideas Dan picked for this week - make each one a video:\n${picked.map(ideaText).join("\n\n")}`,
    saved.length && `Ideas Dan saved - use them first for the rest of the week where they fit:\n${saved.map(ideaText).join("\n\n")}`,
    fresh.length && `New ideas he hasn't looked at yet - use any that fit:\n${fresh.map(ideaText).join("\n\n")}`,
  ].filter(Boolean);

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
          ...ideas,
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
  const used = new Set([...result.ideasUsed, ...picked.map((i) => i.id)]);
  const updated = await saveBrand(user.id, {
    ...latest,
    ideas: latest.ideas.map((i) => (used.has(i.id) && i.status !== "dismissed" ? { ...i, status: "planned" as const } : i)),
    scriptBank: [`## ${title}\n${result.scriptBankEntry.trim()}`, latest.scriptBank.trim()].filter(Boolean).join("\n\n"),
    lastPlan: { at: new Date().toISOString(), workingForYou: result.workingForYou, notWorking: result.notWorking, fromTracked: result.fromTracked, plan: result.plan },
  });
  return { id, oneLine: result.oneLine, brand: updated };
}

/** An inbox idea as text, for Claude. */
function ideaText(i: Idea) {
  return [
    `### [${i.id}] ${i.title} (${EFFORT_LABEL[i.effort]}, ${i.pillar})`,
    i.yourVersion,
    `Hook: ${i.hook}`,
    i.onScreenText.length && `On screen: ${i.onScreenText.join(" / ")}`,
    i.sound.name && `Sound: ${i.sound.name}${i.sound.url ? ` (${i.sound.url})` : ""}${i.sound.note ? ` - ${i.sound.note}` : ""}`,
    i.shots.length && `Shots: ${i.shots.join("; ")}`,
    i.sourceUrl && `From @${i.handle}: ${i.sourceUrl}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------- the ideas inbox

const WATCH_PER_SCAN = 6;
const MAX_IDEAS = 200;
const MAX_SEEN = 1000;

/** The candidates as a briefing: each post with its numbers, sound and caption. */
function candidateBriefing(brand: BrandData, list: ReturnType<typeof ideaCandidates>) {
  const note = (p: (typeof list)[number]) => [...brand.tracked, ...brand.ideaAccounts].find((h) => h.platform === p.platform && h.handle.replace(/^@/, "").toLowerCase() === p.handle)?.note;
  return list
    .map((p) =>
      [
        `- ${p.url}`,
        `  @${p.handle} on ${PLATFORM_LABEL[p.platform]}${p.ideaAccount ? " (shares content ideas)" : ""}${note(p) ? ` - ${note(p)}` : ""}`,
        `  ${p.ratio.toFixed(1)}x their usual ${k(p.median)} · ${k(p.views)} views · ${k(p.likes)} likes · ${k(p.comments)} comments${p.shares ? ` · ${k(p.shares)} shares` : ""} · ${Math.round(p.seconds)}s · ${day(p.postedAt)}`,
        p.sound && `  Sound: ${p.sound.original ? "their own audio" : `"${p.sound.name}"${p.sound.artist ? ` by ${p.sound.artist}` : ""}${p.sound.url ? ` (${p.sound.url})` : ""}`}${p.template ? " - looks like a format video" : ""}`,
        `  "${p.caption.replace(/\s+/g, " ").slice(0, 400)}"`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");
}

/** Find new ideas in the latest stats: the best candidates watched, the rest read, and the sounds going round. */
export async function scanIdeas(user: HubUser) {
  const brand = await getBrand(user.id);
  if (!brand.tracked.length && !brand.ideaAccounts.length) throw new StudioError("Add some creators to track (or accounts that share content ideas) first.");
  if (!brand.stats?.posts.length) throw new StudioError("Pull the latest stats first.");
  const candidates = ideaCandidates(brand).slice(0, 18);
  const sounds = soundsInUse(brand.stats.posts);
  if (!candidates.length && !sounds.length) {
    return saveBrand(user.id, { ...(await getBrand(user.id)), lastScan: { at: new Date().toISOString(), sounds: [], oneLine: "Nothing new stood out since the last look.", problems: [] } });
  }

  // Watch the most promising ones; the rest go in as numbers and captions.
  const watched = await watchVideos(candidates.slice(0, WATCH_PER_SCAN).map((p) => p.url).join("\n"), [], WATCH_PER_SCAN);
  const taste = brand.ideas.filter((i) => i.status !== "new").slice(0, 40);
  const context = [
    "# Personal brand",
    "## About",
    brand.about || "(not written yet - infer from the accounts and posts)",
    brand.notes && `## Standing notes\n${brand.notes}`,
    "## Dan's taste",
    taste.length
      ? taste.map((i) => `- ${i.status === "dismissed" ? `Not for him${i.reason ? ` (${i.reason})` : ""}` : "Liked"}: ${i.title} - ${i.yourVersion}`).join("\n")
      : "(no feedback yet)",
    "## Ideas already in his inbox",
    brand.ideas.filter((i) => i.status === "new" || i.status === "saved").map((i) => `- ${i.title}`).join("\n") || "(none)",
    "## File: script-bank",
    brand.scriptBank.slice(0, 30_000) || "(empty)",
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await ask({
    system: SYSTEM_IDEAS,
    context,
    content: [
      ...videoBlocks(watched),
      {
        type: "text",
        text: [
          `Today is ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}.`,
          candidates.length ? `## Posts that stood out\n${candidateBriefing(brand, candidates)}` : "No new posts stood out this time.",
          sounds.length
            ? `## Sounds the creators he tracks are using (last 30 days)\n${sounds.map((x) => `- "${x.sound.name}"${x.sound.artist ? ` by ${x.sound.artist}` : ""}${x.sound.url ? ` (${x.sound.url})` : ""}: ${x.handles.size} creators, ${x.posts} posts, best ${x.best.toFixed(1)}x their usual`).join("\n")}`
            : "",
          watched.failed.length ? `Couldn't watch (go by the numbers and caption): ${watched.failed.join("; ")}` : "",
          "Give me the ideas worth making.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    schema: IdeaScanResult,
    effort: "medium",
  });

  const at = new Date().toISOString();
  const latest = await getBrand(user.id);
  const known = new Set(latest.ideas.map((i) => `${i.sourceUrl}|${i.title.toLowerCase()}`));
  const found: Idea[] = result.ideas
    .filter((i) => !known.has(`${i.sourceUrl}|${i.title.toLowerCase()}`))
    .map((i) => ({ ...i, handle: i.handle.replace(/^@/, ""), id: crypto.randomUUID().slice(0, 8), foundAt: at, status: "new" as const, reason: "" }));
  return saveBrand(user.id, {
    ...latest,
    ideas: trimIdeas([...found, ...latest.ideas]),
    seen: [...new Set([...candidates.map((p) => p.url), ...latest.seen])].slice(0, MAX_SEEN),
    lastScan: { at, sounds: result.sounds, oneLine: result.oneLine, problems: watched.failed },
  });
}

/** Keep the inbox to a size: the oldest done-with ideas go first. */
function trimIdeas(ideas: Idea[]) {
  if (ideas.length <= MAX_IDEAS) return ideas;
  const spare = new Set(ideas.filter((i) => i.status === "dismissed" || i.status === "planned").slice(-(ideas.length - MAX_IDEAS)).map((i) => i.id));
  return ideas.filter((i) => !spare.has(i.id)).slice(0, MAX_IDEAS);
}

export async function setIdeaStatus(userId: string, id: string, status: IdeaStatus, reason: string) {
  const brand = await getBrand(userId);
  if (!brand.ideas.some((i) => i.id === id)) throw new StudioError("That idea isn't in your inbox any more.");
  return saveBrand(userId, { ...brand, ideas: brand.ideas.map((i) => (i.id === id ? { ...i, status, reason: status === "dismissed" ? reason : "" } : i)) });
}


/** Turn an idea into an edit card. One that finds its own B-roll goes straight to the Mac; one that needs filming waits for its clips. */
export async function makeIdea(userId: string, id: string) {
  const brand = await getBrand(userId);
  const idea = brand.ideas.find((i) => i.id === id);
  if (!idea) throw new StudioError("That idea isn't in your inbox any more.");
  let edit = await createEdit(userId, { projectId: BRAND_ID, videoCode: "", title: idea.title.slice(0, 300), brief: ideaEditBrief(idea) });
  const sent = idea.photosSearch.length > 0;
  if (sent) {
    edit = await updateEdit(userId, edit.id, { status: "queued", cancel_requested: false });
    await addEvents(edit.id, [{ kind: "status", text: "Sent to your Mac." }]);
  }
  const latest = await getBrand(userId);
  const saved = await saveBrand(userId, { ...latest, ideas: latest.ideas.map((i) => (i.id === id ? { ...i, status: "planned" as const, editId: edit.id } : i)) });
  return { brand: saved, edit, sent };
}