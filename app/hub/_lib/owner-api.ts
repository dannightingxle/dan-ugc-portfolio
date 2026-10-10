import "server-only";
import { crossSite } from "./same-origin";
import { adminEnabled } from "./supabase/admin";
import { currentUser, type HubUser } from "./supabase/server";
import { isOwner } from "./owners";

/** For owner-only API routes: same-site, signed in as an owner, else a 404. */
export async function ownerApi(request: Request): Promise<{ ok: true; user: HubUser } | { ok: false; response: Response }> {
  const blocked = crossSite(request);
  if (blocked) return { ok: false, response: blocked };
  const user = adminEnabled ? await currentUser() : null;
  if (!user || !(await isOwner(user.email))) return { ok: false, response: Response.json({ error: "Not found." }, { status: 404 }) };
  return { ok: true, user };
}
