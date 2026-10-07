import { apiUser } from "../../../../hub/_lib/api-auth";
import { serverClient } from "../../../../hub/_lib/supabase/server";
import { billingEnabled, billingRow, stripe } from "../../../../hub/_lib/billing/stripe";

/* Deletes the signed-in creator's account and everything in it. Any Stripe
   subscription is cancelled first so they're never charged again. */
export async function POST(request: Request) {
  const auth = await apiUser({ needsAccess: false });
  if (!auth.ok) return auth.response;
  if (!auth.user) return Response.json({ error: "Accounts aren't switched on." }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  if (body?.confirm !== "DELETE") return Response.json({ error: "Type DELETE to confirm." }, { status: 400 });

  if (billingEnabled) {
    const row = await billingRow(auth.user.id);
    if (row?.stripe_subscription_id && !["canceled", "incomplete_expired"].includes(row.status ?? "")) {
      try {
        await stripe().subscriptions.cancel(row.stripe_subscription_id);
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code !== "resource_missing") {
          console.error("Creator Desk: couldn't cancel subscription on delete", e);
          return Response.json({ error: "Couldn't cancel your subscription, so nothing was deleted. Please try again." }, { status: 500 });
        }
      }
    }
  }

  const db = await serverClient();
  const { error } = await db.rpc("hub_delete_account");
  if (error) {
    console.error("Creator Desk: account delete failed", error);
    return Response.json({ error: "Couldn't delete your account. Please try again." }, { status: 500 });
  }
  await db.auth.signOut().catch(() => {});
  return Response.json({ ok: true });
}
