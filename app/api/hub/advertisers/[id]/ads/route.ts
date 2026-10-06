import { brandAds, source, type AdsQuery } from "../../../../../hub/_lib/trendtrack";
import { meter } from "../../../../../hub/_lib/meter";

function pick<T extends string>(v: string | null, options: readonly T[], fallback: T): T {
  return options.includes(v as T) ? (v as T) : fallback;
}

export async function GET(request: Request, ctx: RouteContext<"/api/hub/advertisers/[id]/ads">) {
  const { id } = await ctx.params;
  const p = new URL(request.url).searchParams;
  const q: AdsQuery = {
    status: pick(p.get("status"), ["all", "active", "inactive"], "active"),
    mediaType: pick(p.get("mediaType"), ["all", "image", "video"], "all"),
    sortBy: pick(p.get("sortBy"), ["newest", "longestRunning", "reach"], "reach"),
    offset: Math.max(0, Number(p.get("offset")) || 0),
  };
  try {
    const result = await brandAds(id, q);
    if (source() === "live") await meter("advertiser-ads", result.items.length);
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
