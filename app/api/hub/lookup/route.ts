import { lookupBrands, source } from "../../../hub/_lib/trendtrack";
import { meter } from "../../../hub/_lib/meter";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return Response.json({ error: "Type at least 2 characters." }, { status: 400 });
  try {
    const result = await lookupBrands(q);
    if (source() === "live") await meter("lookup", 0);
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
