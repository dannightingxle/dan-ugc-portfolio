import { NextResponse } from "next/server";
import { currentUser } from "../../_lib/supabase/server";
import { billingEnabled, stripe, syncSubscription } from "../../_lib/billing/stripe";

/* Where Stripe Checkout sends the creator after they've added their card.
   Syncs the subscription straight away (rather than waiting for the webhook)
   so the desk opens immediately. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const to = (path: string) => NextResponse.redirect(new URL(path, url.origin));
  const user = await currentUser();
  if (!user) return to("/hub/login?next=/hub/billing");
  if (!billingEnabled) return to("/hub");

  const sessionId = url.searchParams.get("session_id");
  if (!sessionId) return to("/hub/billing");
  try {
    const session = await stripe().checkout.sessions.retrieve(sessionId);
    if (session.client_reference_id !== user.id) return to("/hub/billing?error=1");
    if (session.subscription) {
      const id = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      await syncSubscription(id, user.id);
    }
    return to("/hub?welcome=1");
  } catch (e) {
    console.error("Creator Desk: checkout return failed", e);
    return to("/hub/billing?error=1");
  }
}
