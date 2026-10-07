import { brandAds, type AdsQuery } from "../../../../../hub/_lib/trendtrack";
import { trendTrackFor } from "../../../../../hub/_lib/trendtrack-access";
import { apiUser } from "../../../../../hub/_lib/api-auth";
import { meter } from "../../../../../hub/_lib/meter";
import { trendTrackError } from "../../../../../hub/_lib/api-errors";

function pick<T extends string>(v: string | null, options: readonly T[], fallback: T): T {
  return options.includes(v as T) ? (v as T) : fallback;
}

export async function GET(request: Request, ctx: RouteContext<"/api/hub/advertisers/[id]/ads">) {
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const p = new URL(request.url).searchParams;
  const q: AdsQuery = {
    status: pick(p.get("status"), ["all", "active", "inactive"], "active"),
    mediaType: pick(p.get("mediaType"), ["all", "image", "video"], "all"),
    sortBy: pick(p.get("sortBy"), ["newest", "longestRunning", "reach"], "reach"),
    offset: Math.min(10_000, Math.max(0, Number(p.get("offset")) || 0)),
  };
  try {
    const tt = await trendTrackFor(auth.user);
    const result = await brandAds(tt, id, q, p.get("sample") === "1");
    if (result.source === "live") await meter(auth.user, tt, "advertiser-ads", result.items.length);
    return Response.json(result);
  } catch (e) {
    return trendTrackError(e);
  }
}
