import { z } from "zod";
import { crossSite } from "../../../../hub/_lib/same-origin";
import { studioApiUser } from "../../../../hub/_lib/studio/data";
import { addRule, getProfile, saveProfile } from "../../../../hub/_lib/scripts/data";
import { SPELLINGS } from "../../../../hub/_lib/scripts/types";
import { CURRENCIES } from "../../../../hub/_lib/currencies";

/* The creator profile scripts are written from, and the rules saved from
   "Not right?". GET it; PUT the whole profile (rules included, so they can be
   edited and deleted); POST {rule} to add one rule. */

const text = (max: number) => z.string().max(max).default("");
const Profile = z.object({
  name: text(200),
  handle: text(200),
  spelling: z.enum(SPELLINGS),
  currency: z.enum(CURRENCIES),
  niches: text(1_000),
  facts: text(10_000),
  voiceSample: text(10_000),
  wordsUsed: text(2_000),
  wordsNever: text(2_000),
  products: text(5_000),
  rules: z
    .array(
      z.object({
        id: z.string().max(40),
        text: z.string().trim().min(1).max(500),
        createdAt: z.string().max(40),
      }),
    )
    .max(50)
    .default([]),
});

export async function GET() {
  const auth = await studioApiUser("scripts");
  if (!auth.ok) return auth.response;
  return Response.json(await getProfile(auth.user));
}

export async function PUT(request: Request) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const auth = await studioApiUser("scripts");
  if (!auth.ok) return auth.response;
  const parsed = Profile.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Bad request." }, { status: 400 });
  return Response.json(await saveProfile(auth.user, parsed.data));
}

export async function POST(request: Request) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const auth = await studioApiUser("scripts");
  if (!auth.ok) return auth.response;
  const parsed = z
    .object({
      rule: z.string().trim().min(1, "Write the rule first.").max(500),
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Bad request." }, { status: 400 });
  return Response.json(await addRule(auth.user, parsed.data.rule));
}
