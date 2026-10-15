import { z } from "zod";
import { pairDevice } from "../../../../hub/_lib/edits/data";
import { accountsEnabled } from "../../../../hub/_lib/supabase/config";

/* The helper swaps the one-time code shown on Creator Desk for its own token. */

const Body = z.object({ code: z.string().min(8).max(20), name: z.string().max(80).default("Mac"), info: z.record(z.string(), z.unknown()).default({}) });

export async function POST(request: Request) {
  if (!accountsEnabled) return Response.json({ error: "Not available." }, { status: 404 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send the code shown on Creator Desk." }, { status: 400 });
  const paired = await pairDevice(parsed.data.code, parsed.data.name, parsed.data.info);
  if (!paired) return Response.json({ error: "That code didn't work - it may have expired. Get a new one on Creator Desk." }, { status: 400 });
  return Response.json({ token: paired.token });
}
