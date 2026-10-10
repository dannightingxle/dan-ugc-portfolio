import { apiUser } from "../../../../hub/_lib/api-auth";
import { crossSite } from "../../../../hub/_lib/same-origin";
import { serverClient } from "../../../../hub/_lib/supabase/server";
import { adminClient, adminEnabled } from "../../../../hub/_lib/supabase/admin";
import { billingEnabled, closeBilling } from "../../../../hub/_lib/billing/stripe";

/* Deletes the signed-in creator's account and everything in it. Every Stripe
   subscription (and open checkout) they have is cancelled first, so they're
   never charged again. */
export async function POST(request: Request) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const auth = await apiUser({ needsAccess: false });
  if (!auth.ok) return auth.response;
  if (!auth.user) return Response.json({ error: "Accounts aren't switched on." }, { status: 400 });
  if (!adminEnabled) return Response.json({ error: "Account deletion isn't available yet - please contact us." }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  if (body?.confirm !== "DELETE") return Response.json({ error: "Type DELETE to confirm." }, { status: 400 });

  if (billingEnabled) {
    try {
      await closeBilling(auth.user);
    } catch (e) {
      console.error("Creator Desk: couldn't close billing on delete", e);
      return Response.json({ error: "Couldn't cancel your subscription, so your account wasn't deleted. Please try again." }, { status: 500 });
    }
  }

  const { error } = await adminClient().auth.admin.deleteUser(auth.user.id);
  if (error) {
    console.error("Creator Desk: account delete failed", error);
    return Response.json({ error: "Couldn't delete your account. Please try again." }, { status: 500 });
  }
  const db = await serverClient();
  await db.auth.signOut().catch(() => {});
  return Response.json({ ok: true });
}
