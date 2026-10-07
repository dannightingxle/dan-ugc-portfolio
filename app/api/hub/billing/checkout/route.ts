import { apiUser } from "../../../../hub/_lib/api-auth";
import {
  PRICE_ID,
  billingEnabled,
  billingFor,
  billingRow,
  currentOffer,
  ensureCustomer,
  stripe,
  syncSubscription,
} from "../../../../hub/_lib/billing/stripe";

/* Starts Stripe Checkout: card details, then the free trial begins. Returns
   { url } for the browser to go to. */
export async function POST(request: Request) {
  const auth = await apiUser({ needsAccess: false });
  if (!auth.ok) return auth.response;
  const user = auth.user;
  if (!user || !billingEnabled) return Response.json({ url: "/hub" });
  if ((await billingFor(user)).hasAccess) return Response.json({ url: "/hub" });

  try {
    const row = await billingRow(user.id);
    // Paid moments ago and the webhook hasn't landed yet? Don't start a second subscription.
    if (row?.stripe_subscription_id) {
      const existing = await stripe().subscriptions.retrieve(row.stripe_subscription_id);
      if (["trialing", "active", "past_due"].includes(existing.status)) {
        await syncSubscription(existing.id, user.id);
        return Response.json({ url: "/hub" });
      }
    }

    const offer = await currentOffer(row?.had_subscription ?? false);
    const customer = await ensureCustomer(user);
    const origin = new URL(request.url).origin;
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: user.id,
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      // Card required up front, even with a free trial.
      payment_method_collection: "always",
      allow_promotion_codes: true,
      subscription_data: {
        ...(offer.trialDays > 0 && {
          trial_period_days: offer.trialDays,
          trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
        }),
        metadata: { user_id: user.id, founder: String(offer.founder) },
      },
      metadata: { user_id: user.id },
      success_url: `${origin}/hub/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/hub/billing?canceled=1`,
    });
    return Response.json({ url: session.url });
  } catch (e) {
    console.error("Creator Desk: checkout failed", e);
    return Response.json({ error: "Couldn't start checkout. Please try again." }, { status: 500 });
  }
}
