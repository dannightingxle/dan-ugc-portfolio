import { apiUser } from "../../../../hub/_lib/api-auth";
import { crossSite } from "../../../../hub/_lib/same-origin";
import {
  CHECKOUT_MINUTES,
  PRICE_ID,
  TRIAL,
  billingEnabled,
  billingFor,
  billingRow,
  ensureCustomer,
  hadTrialBefore,
  reserveFounderSpot,
  stripe,
  subscriptionsOf,
  syncCustomer,
} from "../../../../hub/_lib/billing/stripe";

/* Starts Stripe Checkout: card details, then the free trial begins. Returns
   { url } for the browser to go to. */
export async function POST(request: Request) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const auth = await apiUser({ needsAccess: false });
  if (!auth.ok) return auth.response;
  const user = auth.user;
  if (!user || !billingEnabled) return Response.json({ url: "/hub" });
  if ((await billingFor(user)).hasAccess) return Response.json({ url: "/hub" });

  try {
    const customer = await ensureCustomer(user);
    // Already subscribed (say, the confirmation from Stripe hasn't landed yet)? Never start a second subscription.
    const subs = await subscriptionsOf(customer);
    if (subs.some((s) => ["trialing", "active", "past_due"].includes(s.status))) {
      await syncCustomer(customer, user.id);
      return Response.json({ url: "/hub" });
    }

    const row = await billingRow(user.id);
    const hadTrial = (await hadTrialBefore(user, row)) || subs.some((s) => s.trial_end != null);
    // Founder spots are held for the life of the checkout, so a launch rush can't overshoot the cap.
    const founder = !hadTrial && (await reserveFounderSpot(user));
    const trialDays = hadTrial ? 0 : founder ? TRIAL.founderDays : TRIAL.days;

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
        ...(trialDays > 0 && {
          trial_period_days: trialDays,
          trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
        }),
        metadata: { user_id: user.id, founder: String(founder) },
      },
      metadata: { user_id: user.id },
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_MINUTES * 60,
      success_url: `${origin}/hub/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/hub/billing?canceled=1`,
    });
    return Response.json({ url: session.url });
  } catch (e) {
    console.error("Creator Desk: checkout failed", e);
    return Response.json({ error: "Couldn't start checkout. Please try again." }, { status: 500 });
  }
}
