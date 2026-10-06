import { adDetail, source } from "../../../../hub/_lib/trendtrack";
import { meter } from "../../../../hub/_lib/meter";

export async function GET(_request: Request, ctx: RouteContext<"/api/hub/ads/[id]">) {
  const { id } = await ctx.params;
  try {
    const result = await adDetail(id);
    if (source() === "live") meter("dan", "ad-detail", 1 + result.history.length);
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
