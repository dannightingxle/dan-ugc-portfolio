import { adminClient, adminEnabled } from "../../../hub/_lib/supabase/admin";
import { accessToken, account, listReels, postTrialReel, quotaLeft, type Graduation, type Reel } from "../_lib/instagram";

/* Reposts your existing reels as trial reels (shown to non-followers only).
   Vercel Cron calls this every morning (vercel.json); setup is in INSTAGRAM.md.

   Each run picks the reels reposted least recently (never-reposted first, most
   liked first), so the whole catalogue cycles round and repeats. Every attempt
   is logged in ig_trial_posts.

   Manual runs, with the same Authorization: Bearer $CRON_SECRET header:
     ?dry=1     show what would be posted, post nothing
     ?count=N   post N now instead of TRIAL_REELS_PER_DAY */

export const maxDuration = 300;

const MAX_PER_RUN = 25; // Instagram allows 50 API posts per 24 hours.

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!adminEnabled || !process.env.INSTAGRAM_ACCESS_TOKEN) {
    return Response.json({ error: "Not set up: needs Supabase and INSTAGRAM_ACCESS_TOKEN (see INSTAGRAM.md)." }, { status: 503 });
  }

  const started = Date.now();
  const params = new URL(request.url).searchParams;
  const dry = params.has("dry");
  const trigger = request.headers.get("user-agent")?.startsWith("vercel-cron") ? "cron" : "manual";
  const graduation: Graduation = process.env.TRIAL_REELS_GRADUATION === "SS_PERFORMANCE" ? "SS_PERFORMANCE" : "MANUAL";
  const wanted = Number(params.get("count") ?? process.env.TRIAL_REELS_PER_DAY ?? 5);
  let count = Math.max(0, Math.min(MAX_PER_RUN, Number.isFinite(wanted) ? Math.floor(wanted) : 5));

  const db = adminClient();
  const { data: history, error } = await db
    .from("ig_trial_posts")
    .select("source_media_id, media_id, trigger, created_at")
    .order("created_at", { ascending: false })
    .limit(10000);
  if (error) return Response.json({ error: `Supabase: ${error.message}` }, { status: 500 });

  // Vercel can occasionally deliver a cron twice; only the first one posts.
  if (trigger === "cron" && !dry && history.some((h) => h.trigger === "cron" && started - Date.parse(h.created_at) < 20 * 60 * 60 * 1000)) {
    return Response.json({ skipped: "Already ran in the last 20 hours." });
  }
  if (count === 0) return Response.json({ skipped: "TRIAL_REELS_PER_DAY is 0." });

  try {
    const token = await accessToken(db);
    const me = await account(token);
    const reposts = new Set(history.map((h) => h.media_id).filter(Boolean));
    const lastTried = new Map<string, number>();
    for (const h of history) if (!lastTried.has(h.source_media_id)) lastTried.set(h.source_media_id, Date.parse(h.created_at));

    const pool = (await listReels(token)).filter((r) => !reposts.has(r.id));
    pool.sort((a, b) => (lastTried.get(a.id) ?? 0) - (lastTried.get(b.id) ?? 0) || (b.like_count ?? 0) - (a.like_count ?? 0));

    const left = await quotaLeft(token, me.user_id);
    count = Math.min(count, left, pool.length);
    const picks = pool.slice(0, count);
    const summary = (r: Reel) => ({ source: r.id, permalink: r.permalink, posted: r.timestamp, likes: r.like_count, caption: r.caption?.slice(0, 80) });

    if (dry) {
      return Response.json({ account: me.username, graduation, inPool: pool.length, quotaLeft: left, wouldPost: picks.map(summary) });
    }

    // Leave time to write the log before Vercel stops the function.
    const deadline = started + (maxDuration - 30) * 1000;
    const results = await Promise.all(
      picks.map(async (reel) => {
        try {
          return { reel, ...(await postTrialReel(token, me.user_id, reel, graduation, deadline)) };
        } catch (e) {
          return { reel, status: "failed" as const, error: e instanceof Error ? e.message : String(e) };
        }
      }),
    );

    const { error: logError } = await db.from("ig_trial_posts").insert(
      results.map((r) => ({
        source_media_id: r.reel.id,
        source_permalink: r.reel.permalink ?? null,
        container_id: "containerId" in r ? r.containerId : null,
        media_id: "mediaId" in r ? r.mediaId : null,
        status: r.status,
        error: "error" in r ? r.error : null,
        trigger,
      })),
    );

    return Response.json({
      account: me.username,
      graduation,
      published: results.filter((r) => r.status === "published").length,
      results: results.map((r) => ({ ...summary(r.reel), status: r.status, error: "error" in r ? r.error : undefined })),
      ...(logError ? { logError: logError.message } : {}),
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
