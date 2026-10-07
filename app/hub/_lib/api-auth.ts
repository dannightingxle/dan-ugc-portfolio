import "server-only";
import { accountsEnabled } from "./supabase/config";
import { currentUser, type HubUser } from "./supabase/server";
import { billingFor } from "./billing/stripe";

/* Every /api/hub route checks who's calling, even though proxy.ts already
   turns away signed-out visitors (defence in depth). With accounts off, the
   hub is single-user and the old password gate in proxy.ts applies. */

type Result = { ok: true; user: HubUser | null } | { ok: false; response: Response };

export async function apiUser({ needsAccess = true } = {}): Promise<Result> {
  if (!accountsEnabled) return { ok: true, user: null };
  const user = await currentUser();
  if (!user) return { ok: false, response: Response.json({ error: "Not signed in." }, { status: 401 }) };
  if (needsAccess && !(await billingFor(user)).hasAccess) {
    return { ok: false, response: Response.json({ error: "Your trial or subscription has ended.", code: "no_access" }, { status: 402 }) };
  }
  return { ok: true, user };
}
