import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/* Instagram API with Instagram Login: just what the trial reels autoposter
   needs. Setup lives in INSTAGRAM.md. */

const GRAPH = "https://graph.instagram.com/v25.0";
const DAY = 24 * 60 * 60 * 1000;

export type Reel = {
  id: string;
  caption?: string;
  media_url: string;
  permalink?: string;
  timestamp: string;
  like_count?: number;
};

type RawMedia = Partial<Reel> & {
  id: string;
  media_type?: string;
  media_product_type?: string;
};

async function graph<T>(path: string, token: string, opts: { post?: Record<string, string>; query?: Record<string, string> } = {}) {
  const url = new URL(path.startsWith("https://") ? path : `${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  const res = await fetch(url, opts.post ? { method: "POST", body: new URLSearchParams(opts.post) } : { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error ?? {};
    // Never echo the URL: it carries the token.
    throw new Error(e.error_user_msg || e.message || `Instagram API error ${res.status}`);
  }
  return json as T;
}

export async function account(token: string) {
  return graph<{ user_id: string; username: string }>("me", token, { query: { fields: "user_id,username" } });
}

/** Your own reels that Instagram will hand over a video file for. Reels with
    licensed music come back without media_url, so they drop out here. */
export async function listReels(token: string) {
  const reels: Reel[] = [];
  let next: string | undefined = "me/media";
  for (let page = 0; next && page < 20; page++) {
    const res: { data: RawMedia[]; paging?: { next?: string } } = await graph(next, token, {
      query: page === 0 ? { fields: "id,caption,media_type,media_product_type,media_url,permalink,timestamp,like_count", limit: "100" } : {},
    });
    for (const m of res.data) {
      if (m.media_type !== "VIDEO" || m.media_product_type !== "REELS" || !m.media_url) continue;
      reels.push(m as Reel);
    }
    next = res.paging?.next;
  }
  return reels;
}

/** How many more posts the API will accept in the rolling 24 hours. */
export async function quotaLeft(token: string, userId: string) {
  const res = await graph<{ data: { quota_usage: number; config?: { quota_total: number } }[] }>(`${userId}/content_publishing_limit`, token, {
    query: { fields: "quota_usage,config" },
  });
  const row = res.data[0];
  return row ? (row.config?.quota_total ?? 50) - row.quota_usage : 50;
}

export type Graduation = "MANUAL" | "SS_PERFORMANCE";

/** Uploads one reel as a trial reel and publishes it once Instagram has
    processed the video. Gives up at `deadline` (ms since epoch). */
export async function postTrialReel(token: string, userId: string, reel: Reel, graduation: Graduation, deadline: number) {
  const { id: containerId } = await graph<{ id: string }>(`${userId}/media`, token, {
    post: {
      media_type: "REELS",
      video_url: reel.media_url,
      caption: reel.caption ?? "",
      trial_params: JSON.stringify({ graduation_strategy: graduation }),
    },
  });

  for (;;) {
    const { status_code, status } = await graph<{ status_code: string; status?: string }>(containerId, token, {
      query: { fields: "status_code,status" },
    });
    if (status_code === "FINISHED") break;
    if (status_code === "ERROR" || status_code === "EXPIRED") {
      return { containerId, status: "failed" as const, error: status || `Instagram couldn't process the video (${status_code})` };
    }
    if (Date.now() + 10_000 > deadline) return { containerId, status: "timeout" as const, error: "Still processing when the run ended" };
    await new Promise((r) => setTimeout(r, 10_000));
  }

  const { id: mediaId } = await graph<{ id: string }>(`${userId}/media_publish`, token, { post: { creation_id: containerId } });
  return { containerId, mediaId, status: "published" as const };
}

/** The current access token. Long-lived tokens last 60 days; this swaps in a
    fresh one weekly, so the token keeps going as long as the cron runs. */
export async function accessToken(db: SupabaseClient) {
  const seed = process.env.INSTAGRAM_ACCESS_TOKEN ?? "";
  const seedHash = createHash("sha256").update(seed).digest("hex");

  const { data, error } = await db.from("ig_token").select("access_token, seed_hash, refreshed_at").maybeSingle();
  if (error) throw new Error(`Supabase: ${error.message}`);
  let row = data;
  if (!row || row.seed_hash !== seedHash) {
    row = { access_token: seed, seed_hash: seedHash, refreshed_at: new Date().toISOString() };
    const { error } = await db.from("ig_token").upsert({ id: true, ...row, expires_at: null });
    if (error) throw new Error(`Supabase: ${error.message}`);
  }

  if (Date.now() - Date.parse(row.refreshed_at) > 7 * DAY) {
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
    } catch {
      // The current token is still good for weeks; try again on the next run.
    }
  }
  return row.access_token;
}
