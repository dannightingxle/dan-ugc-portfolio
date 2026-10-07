import { lookupBrands } from "../../../hub/_lib/trendtrack";
import { trendTrackFor } from "../../../hub/_lib/trendtrack-access";
import { apiUser } from "../../../hub/_lib/api-auth";
import { meter } from "../../../hub/_lib/meter";
import { trendTrackError } from "../../../hub/_lib/api-errors";

export async function GET(request: Request) {
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  const params = new URL(request.url).searchParams;
  const q = params.get("q")?.trim().slice(0, 200) ?? "";
  if (q.length < 2) return Response.json({ error: "Type at least 2 characters." }, { status: 400 });
  try {
    const ctx = await trendTrackFor(auth.user);
    const result = await lookupBrands(ctx, q, params.get("sample") === "1");
    if (result.source === "live") await meter(auth.user, ctx, "lookup", 0);
    return Response.json(result);
  } catch (e) {
    return trendTrackError(e);
  }
}
