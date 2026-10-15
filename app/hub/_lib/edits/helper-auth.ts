import "server-only";
import { adminClient } from "../supabase/admin";
import { accountsEnabled } from "../supabase/config";
import { canUse } from "../features";
import { billingFor } from "../billing/stripe";
import { deviceFromRequest, type DeviceAuth } from "./data";
import { isCurrency } from "../currencies";

/* The Creator Desk Helper calls these routes with its device token. The Mac
   only gets work while its owner can still use Edits (feature + plan); that's
   checked here, at most once a minute per person. */

const allowed = new Map<string, { at: number; ok: boolean }>();

async function stillAllowed(userId: string) {
  const hit = allowed.get(userId);
  if (hit && Date.now() - hit.at < 60_000) return hit.ok;
  const { data } = await adminClient().auth.admin.getUserById(userId);
  const u = data.user;
  const meta = u?.user_metadata ?? {};
  const user = u?.email ? { id: u.id, email: u.email, name: (meta.name as string) || u.email, currency: isCurrency(meta.currency) ? meta.currency : ("GBP" as const) } : null;
  const ok = Boolean(user && (await canUse(user, "edits")) && (await billingFor(user)).hasAccess);
  allowed.set(userId, { at: Date.now(), ok });
  return ok;
}

export async function helperApi(request: Request, run: (auth: DeviceAuth) => Promise<unknown>) {
  if (!accountsEnabled) return Response.json({ error: "Not available." }, { status: 404 });
  const auth = await deviceFromRequest(request);
  if (!auth) return Response.json({ error: "This Mac isn't connected - run the helper's connect step again." }, { status: 401 });
  if (!(await stillAllowed(auth.userId))) return Response.json({ error: "Edits aren't switched on for this account." }, { status: 403 });
  try {
    return Response.json((await run(auth)) ?? { ok: true });
  } catch (e) {
    console.error("Creator Desk helper:", e);
    return Response.json({ error: "Something went wrong on Creator Desk." }, { status: 500 });
  }
}
