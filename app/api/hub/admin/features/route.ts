import { z } from "zod";
import { ownerApi } from "../../../../hub/_lib/owner-api";
import { setAudience } from "../../../../hub/_lib/features";
import { AUDIENCES, FEATURES } from "../../../../hub/_lib/features-list";

/* Owners: choose who sees a staged feature (just owners, the beta group, everyone). */
const Body = z.object({ key: z.enum(FEATURES.map((f) => f.key) as [string, ...string[]]), audience: z.enum(AUDIENCES) });

export async function POST(request: Request) {
  const auth = await ownerApi(request);
  if (!auth.ok) return auth.response;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Bad request." }, { status: 400 });
  await setAudience(body.data.key as (typeof FEATURES)[number]["key"], body.data.audience);
  return Response.json({ ok: true });
}
