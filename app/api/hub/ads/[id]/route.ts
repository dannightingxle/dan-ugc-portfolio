import { adDetail } from "../../../../hub/_lib/trendtrack";
import { trendTrackFor } from "../../../../hub/_lib/trendtrack-access";
import { apiUser } from "../../../../hub/_lib/api-auth";
import { meter } from "../../../../hub/_lib/meter";
import { trendTrackError } from "../../../../hub/_lib/api-errors";

export async function GET(_request: Request, ctx: RouteContext<"/api/hub/ads/[id]">) {
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  try {
    const tt = await trendTrackFor(auth.user);
    const result = await adDetail(tt, id);
    if (result.source === "live") await meter(auth.user, tt, "ad-detail", 1 + result.history.length);
    return Response.json(result);
  } catch (e) {
    return trendTrackError(e);
  }
}
