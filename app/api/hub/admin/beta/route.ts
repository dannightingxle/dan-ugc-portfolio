import { z } from "zod";
import { ownerApi } from "../../../../hub/_lib/owner-api";
import { adminClient } from "../../../../hub/_lib/supabase/admin";

/* Owners: add or remove people in the beta group (by email). */
const Body = z.object({ email: z.string().trim().toLowerCase().email().max(320) });

async function parse(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => null));
  return body.success ? body.data.email : null;
}

export async function POST(request: Request) {
  const auth = await ownerApi(request);
  if (!auth.ok) return auth.response;
  const email = await parse(request);
  if (!email) return Response.json({ error: "That doesn't look like an email address." }, { status: 400 });
  const { error } = await adminClient().from("hub_beta_members").upsert({ email });
  if (error) return Response.json({ error: "Couldn't add them. Please try again." }, { status: 500 });
  return Response.json({ ok: true, email });
}

export async function DELETE(request: Request) {
  const auth = await ownerApi(request);
  if (!auth.ok) return auth.response;
  const email = await parse(request);
  if (!email) return Response.json({ error: "Bad request." }, { status: 400 });
  const { error } = await adminClient().from("hub_beta_members").delete().eq("email", email);
  if (error) return Response.json({ error: "Couldn't remove them. Please try again." }, { status: 500 });
  return Response.json({ ok: true });
}
