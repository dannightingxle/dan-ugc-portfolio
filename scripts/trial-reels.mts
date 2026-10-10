/* Trial reels autoposter. Run every morning by .github/workflows/trial-reels.yml;
   setup in INSTAGRAM.md.

   Downloads your existing reels, makes a slightly different copy of each one
   (sped up a touch, zoomed and nudged, colour shifted, a fraction of a second
   trimmed, the caption burned in tiny and nearly invisible) and posts the copy
   as a trial reel, shown to non-followers only. The reel reposted least
   recently goes first, so the whole catalogue cycles round and repeats.

   Env: SUPABASE_URL, SUPABASE_SECRET_KEY, INSTAGRAM_ACCESS_TOKEN,
   TRIAL_REELS_PER_DAY (default 5), TRIAL_REELS_GRADUATION (MANUAL or
   SS_PERFORMANCE), COUNT (overrides per-day for one run), DRY_RUN=true. */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const GRAPH = "https://graph.instagram.com/v25.0";
const BUCKET = "trial-reels";
const DAY = 24 * 60 * 60 * 1000;
const MAX_PER_RUN = 25;
const FONTS = "/usr/share/fonts/truetype/dejavu";
const FFMPEG: string = createRequire(import.meta.url)("ffmpeg-static");

type Reel = { id: string; caption?: string; media_url: string; permalink?: string; like_count?: number };
type Variant = { speed: number; zoom: number; x: number; y: number; brightness: number; saturation: number; trim: number; textX: number; textY: number; textSize: number };
type Result = { reel: Reel; variant?: Variant; containerId?: string; mediaId?: string; status: "published" | "failed"; error?: string };

const env = (name: string) => process.env[name]?.trim() ?? "";
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const between = (min: number, max: number, dp = 3) => Number((min + Math.random() * (max - min)).toFixed(dp));

// ---------------------------------------------------------------------------
// Instagram API (with Instagram Login)

async function graph<T>(path: string, token: string, opts: { post?: Record<string, string>; query?: Record<string, string> } = {}) {
  const url = new URL(path.startsWith("https://") ? path : `${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  const res = await fetch(url, opts.post ? { method: "POST", body: new URLSearchParams(opts.post) } : {});
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error ?? {};
    // Never echo the URL: it carries the token.
    throw new Error(e.error_user_msg || e.message || `Instagram API error ${res.status}`);
  }
  return json as T;
}

/** Your own reels that Instagram will hand over a video file for. Reels with
    licensed music come back without media_url, so they drop out here. */
async function listReels(token: string) {
  const reels: Reel[] = [];
  let next: string | undefined = "me/media";
  for (let page = 0; next && page < 20; page++) {
    const res: { data: (Partial<Reel> & { id: string; media_type?: string; media_product_type?: string })[]; paging?: { next?: string } } = await graph(next, token, {
      query: page === 0 ? { fields: "id,caption,media_type,media_product_type,media_url,permalink,like_count", limit: "100" } : {},
    });
    for (const m of res.data) {
      if (m.media_type === "VIDEO" && m.media_product_type === "REELS" && m.media_url) reels.push(m as Reel);
    }
    next = res.paging?.next;
  }
  return reels;
}

/** How many more posts the API will accept in the rolling 24 hours. */
async function quotaLeft(token: string, userId: string) {
  const res = await graph<{ data: { quota_usage: number; config?: { quota_total: number } }[] }>(`${userId}/content_publishing_limit`, token, {
    query: { fields: "quota_usage,config" },
  });
  const row = res.data[0];
  return row ? (row.config?.quota_total ?? 50) - row.quota_usage : 50;
}

/** Waits for Instagram to process an uploaded video. */
async function processed(token: string, containerId: string) {
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    const { status_code, status } = await graph<{ status_code: string; status?: string }>(containerId, token, { query: { fields: "status_code,status" } });
    if (status_code === "FINISHED") return;
    if (status_code === "ERROR" || status_code === "EXPIRED") throw new Error(status || `Instagram couldn't process the video (${status_code})`);
    await new Promise((r) => setTimeout(r, 10_000));
  }
  throw new Error("Instagram was still processing the video after 15 minutes");
}

// ---------------------------------------------------------------------------
// Video

function randomVariant(): Variant {
  return {
    speed: between(1.02, 1.06),
    zoom: between(1.02, 1.05),
    x: between(0, 1, 2),
    y: between(0, 1, 2),
    brightness: between(-0.02, 0.02),
    saturation: between(0.97, 1.05),
    trim: between(0, 0.3, 2),
    textX: Math.round(between(40, 1040, 0)),
    textY: Math.round(between(200, 1720, 0)),
    textSize: Math.round(between(16, 24, 0)),
  };
}

/** The caption as near-invisible subtitles (ASS format, on a 1080x1920 canvas
    that libass scales to the real video). */
function hiddenCaption(caption: string | undefined, v: Variant) {
  const words = (caption ?? "")
    .replace(/[^\p{L}\p{N} .,!?'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .join(" ");
  const text = words || randomUUID().slice(0, 8);
  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Hidden,DejaVu Sans,${v.textSize},&HD9FFFFFF,&HFF000000,&HFF000000,&HFF000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,9:00:00.00,Hidden,,0,0,0,,{\\pos(${v.textX},${v.textY})}${text}
`;
}

async function render(src: string, out: string, caption: string | undefined, v: Variant) {
  const ass = `${out}.ass`;
  await writeFile(ass, hiddenCaption(caption, v));
  const z = v.zoom;
  const video = [
    `setpts=PTS/${v.speed}`,
    `scale=trunc(iw*${z}/2)*2:trunc(ih*${z}/2)*2`,
    `crop=trunc(iw/${z}/2)*2:trunc(ih/${z}/2)*2:(iw-ow)*${v.x}:(ih-oh)*${v.y}`,
    `eq=brightness=${v.brightness}:saturation=${v.saturation}`,
    `ass=filename=${ass}${existsSync(FONTS) ? `:fontsdir=${FONTS}` : ""}`,
    // Instagram's reel size (letterboxed if the original isn't 9:16); also keeps files under Supabase's 50 MB upload limit.
    "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1",
  ].join(",");
  await promisify(execFile)(
    FFMPEG,
    // prettier-ignore
    [
      "-hide_banner", "-loglevel", "error", "-y",
      "-ss", String(v.trim), "-i", src,
      "-map", "0:v:0", "-map", "0:a:0?", "-map_metadata", "-1",
      "-vf", video, "-af", `atempo=${v.speed}`,
      "-r", "30", "-c:v", "libx264", "-preset", "fast", "-crf", "21", "-maxrate", "4M", "-bufsize", "8M", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
      "-movflags", "+faststart", out,
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );
}

// ---------------------------------------------------------------------------
// Token: long-lived tokens last 60 days, so swap in a fresh one weekly.

async function accessToken(db: SupabaseClient) {
  const seed = env("INSTAGRAM_ACCESS_TOKEN");
  const seedHash = createHash("sha256").update(seed).digest("hex");
  const { data, error } = await db.from("ig_token").select("access_token, seed_hash, refreshed_at").maybeSingle<{ access_token: string; seed_hash: string; refreshed_at: string }>();
  if (error) throw new Error(`Supabase: ${error.message}`);

  // A new token pasted into GitHub replaces the stored one.
  let row = data;
  if (!row || row.seed_hash !== seedHash) {
    row = { access_token: seed, seed_hash: seedHash, refreshed_at: new Date().toISOString() };
    const { error } = await db.from("ig_token").upsert({ id: true, ...row, expires_at: null });
    if (error) throw new Error(`Supabase: ${error.message}`);
  }
  if (Date.now() - Date.parse(row.refreshed_at) < 7 * DAY) return row.access_token;

  try {
    const res = await graph<{ access_token: string; expires_in: number }>("https://graph.instagram.com/refresh_access_token", row.access_token, {
      query: { grant_type: "ig_refresh_token" },
    });
    const now = Date.now();
    await db
      .from("ig_token")
      .update({ access_token: res.access_token, refreshed_at: new Date(now).toISOString(), expires_at: new Date(now + res.expires_in * 1000).toISOString() })
      .eq("id", true);
    return res.access_token;
  } catch (e) {
    console.warn(`Couldn't refresh the Instagram token (will retry next run): ${message(e)}`);
    return row.access_token;
  }
}

// ---------------------------------------------------------------------------

async function main() {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SECRET_KEY");
  if (!url || !key || !env("INSTAGRAM_ACCESS_TOKEN")) throw new Error("Needs SUPABASE_URL, SUPABASE_SECRET_KEY and INSTAGRAM_ACCESS_TOKEN (see INSTAGRAM.md).");
  const db: SupabaseClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const dry = env("DRY_RUN") === "true";
  const graduation = env("TRIAL_REELS_GRADUATION") === "SS_PERFORMANCE" ? "SS_PERFORMANCE" : "MANUAL";
  const wanted = Number(env("COUNT") || env("TRIAL_REELS_PER_DAY") || 5);
  let count = Math.max(0, Math.min(MAX_PER_RUN, Number.isFinite(wanted) ? Math.floor(wanted) : 5));
  if (count === 0) return console.log("TRIAL_REELS_PER_DAY is 0: paused.");

  const token = await accessToken(db);
  const me = await graph<{ user_id: string; username: string }>("me", token, { query: { fields: "user_id,username" } });

  const { data: history, error } = await db
    .from("ig_trial_posts")
    .select("source_media_id, media_id")
    .order("created_at", { ascending: false })
    .limit(10000)
    .returns<{ source_media_id: string; media_id: string | null }[]>();
  if (error) throw new Error(`Supabase: ${error.message}`);
  const reposts = new Set(history.map((h) => h.media_id).filter(Boolean));
  // Position in the history, newest first: a higher number was reposted longer ago.
  const recency = new Map<string, number>();
  history.forEach((h, i) => recency.has(h.source_media_id) || recency.set(h.source_media_id, i));

  // Never reposted first (most liked first), then whichever was reposted longest ago.
  const pool = (await listReels(token)).filter((r) => !reposts.has(r.id));
  pool.sort((a, b) => (recency.get(b.id) ?? Infinity) - (recency.get(a.id) ?? Infinity) || (b.like_count ?? 0) - (a.like_count ?? 0));
  if (pool.length === 0) throw new Error("No reels to repost (reels with licensed music can't be downloaded through the API).");

  const left = await quotaLeft(token, me.user_id);
  count = Math.min(count, left);
  // With fewer reels than posts, the same reel goes out more than once (each copy altered differently).
  const picks = Array.from({ length: count }, (_, i) => pool[i % pool.length]);
  console.log(`@${me.username}: ${pool.length} reels in rotation, ${left} API posts left today, posting ${count} (${graduation}).`);
  for (const r of picks) console.log(`  ${r.permalink ?? r.id}  ${(r.caption ?? "").slice(0, 60).replace(/\s+/g, " ")}`);
  if (dry || count === 0) return;

  const dir = await mkdtemp(join(tmpdir(), "trial-reels-"));
  const uploaded: string[] = [];
  try {
    // Render and upload one at a time (CPU-bound), then let Instagram process them all at once.
    const results: Result[] = [];
    const pending: (Result & { containerId: string })[] = [];
    for (const [i, reel] of picks.entries()) {
      const variant = randomVariant();
      try {
        const src = join(dir, `${reel.id}.mp4`);
        if (!existsSync(src)) {
          const res = await fetch(reel.media_url);
          if (!res.ok) throw new Error(`Download failed (${res.status})`);
          await writeFile(src, Buffer.from(await res.arrayBuffer()));
        }
        const out = join(dir, `post-${i}.mp4`);
        await render(src, out, reel.caption, variant);

        const path = `${randomUUID()}.mp4`;
        const { error } = await db.storage.from(BUCKET).upload(path, await readFile(out), { contentType: "video/mp4" });
        if (error) throw new Error(`Upload failed: ${error.message}`);
        uploaded.push(path);

        const { id } = await graph<{ id: string }>(`${me.user_id}/media`, token, {
          post: {
            media_type: "REELS",
            video_url: db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
            caption: reel.caption ?? "",
            trial_params: JSON.stringify({ graduation_strategy: graduation }),
          },
        });
        pending.push({ reel, variant, containerId: id, status: "failed" });
      } catch (e) {
        results.push({ reel, variant, status: "failed", error: message(e) });
      }
    }

    await Promise.all(
      pending.map(async (p) => {
        try {
          await processed(token, p.containerId);
          const { id } = await graph<{ id: string }>(`${me.user_id}/media_publish`, token, { post: { creation_id: p.containerId } });
          results.push({ ...p, mediaId: id, status: "published" });
        } catch (e) {
          results.push({ ...p, error: message(e) });
        }
      }),
    );

    const { error: logError } = await db.from("ig_trial_posts").insert(
      results.map((r) => ({
        source_media_id: r.reel.id,
        source_permalink: r.reel.permalink ?? null,
        container_id: r.containerId ?? null,
        media_id: r.mediaId ?? null,
        status: r.status,
        error: r.error ?? null,
        variant: r.variant ?? null,
      })),
    );
    if (logError) console.warn(`Couldn't write the log: ${logError.message}`);

    for (const r of results) console.log(`${r.status === "published" ? "✓" : "✗"} ${r.reel.permalink ?? r.reel.id}${r.error ? `: ${r.error}` : ""}`);
    const failed = results.filter((r) => r.status === "failed").length;
    // A failed run makes GitHub email you.
    if (failed) throw new Error(`${failed} of ${results.length} reposts failed.`);
  } finally {
    await rm(dir, { recursive: true, force: true });
    if (uploaded.length) await db.storage.from(BUCKET).remove(uploaded);
  }
}

main().catch((e) => {
  console.error(message(e));
  process.exit(1);
});
