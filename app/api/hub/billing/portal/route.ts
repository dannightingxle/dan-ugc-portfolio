import { apiUser } from "../../../../hub/_lib/api-auth";
import { STRIPE_LIVE, billingEnabled, billingRow, stripe } from "../../../../hub/_lib/billing/stripe";
import { crossSite } from "../../../../hub/_lib/same-origin";

/* Stripe's customer portal: change card, see invoices, cancel. Returns { url }. */
export async function POST(request: Request) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const auth = await apiUser({ needsAccess: false });
  if (!auth.ok) return auth.response;
  if (!auth.user || !billingEnabled) return Response.json({ error: "Billing isn't set up." }, { status: 400 });
  const row = await billingRow(auth.user.id);
  // (A customer from Stripe's other mode - a test sign-up from before going live - doesn't count.)
  if (!row?.stripe_customer_id || row.livemode !== STRIPE_LIVE) return Response.json({ error: "No subscription yet." }, { status: 400 });
  try {
    const session = await stripe().billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: `${new URL(request.url).origin}/hub/account`,
    });
    return Response.json({ url: session.url });
  } catch (e) {
    console.error("Creator Desk: portal failed", e);
    return Response.json({ error: "Couldn't open billing. Please try again." }, { status: 500 });
  }
}
