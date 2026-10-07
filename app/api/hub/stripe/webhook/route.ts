import type Stripe from "stripe";
import { billingEnabled, stripe, syncSubscription } from "../../../../hub/_lib/billing/stripe";

/* Stripe tells us about subscription changes here (trial started, payment
   failed, cancelled…). Point a webhook at /api/hub/stripe/webhook in the
   Stripe dashboard and put its signing secret in STRIPE_WEBHOOK_SECRET. */

const SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

export async function POST(request: Request) {
  if (!billingEnabled || !SECRET) return Response.json({ error: "Billing isn't set up." }, { status: 503 });

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, request.headers.get("stripe-signature") ?? "", SECRET);
  } catch {
    return Response.json({ error: "Bad signature." }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription" && session.subscription) {
        const id = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        await syncSubscription(id, session.client_reference_id ?? undefined);
      }
    } else if (SUBSCRIPTION_EVENTS.has(event.type)) {
      await syncSubscription((event.data.object as Stripe.Subscription).id);
    }
  } catch (e) {
    // A 500 makes Stripe retry later.
    console.error("Creator Desk: webhook failed", event.type, e);
    return Response.json({ error: "Sync failed." }, { status: 500 });
  }
  return Response.json({ received: true });
}
