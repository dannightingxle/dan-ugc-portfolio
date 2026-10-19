import "server-only";
import type { HubUser } from "../supabase/server";
import { StudioError, ask } from "./claude";
import { BRAND_ID } from "./data";
import { getBrand, saveBrand } from "./brand";
import { SYSTEM_TRIALS } from "./prompts";
import { videoBlocks, watchVideos } from "./videos";
import { TrialResult, trialEditBrief, type BrandData, type Trial } from "./brand-types";
import { addEvents, createEdit, getEdit, updateEdit } from "../edits/data";

/* Trial reels: five versions of one reel, each opening differently, made into
   CapCut drafts on the Mac, posted as Instagram trial reels, and the winner
   written into the winners file so later plans and ideas learn from it. */

export type TrialSource = { kind: "post"; url: string } | { kind: "edit"; editId: string } | { kind: "paste"; text: string };

const MAX_TRIALS = 60;

export async function makeTrial(user: HubUser, source: TrialSource): Promise<{ brand: BrandData; trial: Trial; sent: boolean }> {
  const brand = await getBrand(user.id);
  let material = "";
  let url = "";
  let draft = "";
  let label = "";
  let watched: Awaited<ReturnType<typeof watchVideos>> = { videos: [], failed: [] };

  if (source.kind === "post") {
    const post = brand.stats?.posts.find((p) => p.url === source.url);
    url = source.url;
    label = post ? `Your post: "${post.caption.replace(/\s+/g, " ").slice(0, 80)}"` : "Your post";
    watched = await watchVideos(source.url, [], 1);
    material = [
      `The reel: ${source.url}`,
      post && `${post.views} views, ${post.likes} likes, ${post.comments} comments, ${Math.round(post.seconds)}s, posted ${post.postedAt.slice(0, 10)}`,
      post && `Caption: ${post.caption}`,
      post?.sound && `Sound: ${post.sound.original ? "his own audio" : `"${post.sound.name}"${post.sound.url ? ` (${post.sound.url})` : ""}`}`,
      !watched.videos.length && "Couldn't watch it: go by the caption and numbers, and keep the openings to things he can make from the reel itself.",
    ]
      .filter(Boolean)
      .join("\n");
  } else if (source.kind === "edit") {
    const edit = await getEdit(user.id, source.editId);
    if (!edit || edit.project_id !== BRAND_ID) throw new StudioError("That edit card isn't there any more.");
    draft = (edit.draft_name ?? "").split(", ")[0];
    label = `Edit: ${edit.title}`;
    material = [`The reel's video card (it's been edited${draft ? ` into the CapCut draft "${draft}"` : ""}):`, edit.brief].join("\n");
  } else {
    if (!source.text.trim()) throw new StudioError("Paste the reel's script or video card first.");
    label = "Pasted";
    material = `The reel, as Dan described it:\n${source.text}`;
  }

  const context = ["# Personal brand", "## About", brand.about || "(not written yet)", "## File: winners", brand.winners.slice(0, 40_000) || "(empty)"].join("\n\n");
  const result = await ask({
    system: SYSTEM_TRIALS,
    context,
    content: [...videoBlocks(watched), { type: "text", text: `${material}\n\nWrite the 5 trial versions.` }],
    schema: TrialResult,
    effort: "medium",
  });

  const trial: Trial = {
    id: crypto.randomUUID().slice(0, 8),
    createdAt: new Date().toISOString(),
    title: result.title,
    test: result.test,
    source: { kind: source.kind, url, draft, label },
    versions: result.versions.slice(0, 5).map((v, i) => ({ ...v, code: `T${i + 1}`, views: null })),
    winner: null,
    learned: "",
  };
  // From a finished draft it can go straight to the Mac; otherwise it waits for the video to be picked.
  let sent = false;
  if (draft) {
    trial.editId = (await trialCard(user.id, trial, true)).id;
    sent = true;
  }
  const latest = await getBrand(user.id);
  const saved = await saveBrand(user.id, { ...latest, trials: [trial, ...latest.trials].slice(0, MAX_TRIALS) });
  return { brand: saved, trial, sent };
}

async function trialCard(userId: string, trial: Trial, queue: boolean) {
  let edit = await createEdit(userId, { projectId: BRAND_ID, videoCode: "", title: `${trial.title} - trial versions`.slice(0, 300), brief: trialEditBrief(trial) });
  if (queue) {
    edit = await updateEdit(userId, edit.id, { status: "queued", cancel_requested: false });
    await addEvents(edit.id, [{ kind: "status", text: "Sent to your Mac." }]);
  }
  return edit;
}

/** An edit card for a trial that doesn't have one yet: pick the finished video on it, then edit. */
export async function trialToMac(userId: string, id: string) {
  const brand = await getBrand(userId);
  const trial = brand.trials.find((t) => t.id === id);
  if (!trial) throw new StudioError("That trial isn't there any more.");
  if (trial.editId && (await getEdit(userId, trial.editId))) return { brand, editId: trial.editId };
  const edit = await trialCard(userId, trial, Boolean(trial.source.draft));
  const latest = await getBrand(userId);
  const saved = await saveBrand(userId, { ...latest, trials: latest.trials.map((t) => (t.id === id ? { ...t, editId: edit.id } : t)) });
  return { brand: saved, editId: edit.id };
}

/** Each version's views and the winner. A new winner is written into the winners file, so plans and ideas learn from it. */
export async function saveTrialResults(userId: string, id: string, views: (number | null)[], winner: string | null) {
  const brand = await getBrand(userId);
  const trial = brand.trials.find((t) => t.id === id);
  if (!trial) throw new StudioError("That trial isn't there any more.");
  const versions = trial.versions.map((v, i) => ({ ...v, views: views[i] ?? null }));
  const won = winner ? versions.find((v) => v.code === winner) : undefined;
  // Each trial has one line in the winners file, tagged with its id: replaced when the winner changes, removed when it's cleared.
  const tag = `[trial ${trial.id}]`;
  let learned = "";
  let lines = brand.winners.split("\n").filter((l) => !l.includes(tag));
  if (won) {
    const others = versions.filter((v) => v.code !== won.code && v.views != null).map((v) => `${v.code} ${v.views}`);
    learned = `${won.code} won${won.views != null ? ` with ${won.views} views` : ""}${others.length ? ` (${others.join(", ")})` : ""}: ${won.change} - "${won.hook}"`;
    const day = new Date(trial.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    lines = [...lines, `- Trial reel ${day}, "${trial.title}" (testing ${trial.test}): ${learned} ${tag}`];
  }
  const winners = lines.join("\n").trim();
  const saved = await saveBrand(userId, { ...brand, winners, trials: brand.trials.map((t) => (t.id === id ? { ...t, versions, winner: won ? won.code : null, learned } : t)) });
  return saved;
}

export async function deleteTrial(userId: string, id: string) {
  const brand = await getBrand(userId);
  return saveBrand(userId, { ...brand, trials: brand.trials.filter((t) => t.id !== id) });
}
