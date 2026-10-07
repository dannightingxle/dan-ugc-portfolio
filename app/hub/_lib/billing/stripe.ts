import "server-only";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "../supabase/config";
import { adminClient, adminEnabled } from "../supabase/admin";
import { serverClient, type HubUser } from "../supabase/server";
import { isOwner } from "../owners";
import { OPEN_ACCESS, type Billing, type Offer } from "./types";

/* Stripe subscriptions. A card is taken at sign-up and the trial starts:
   FOUNDER_TRIAL_DAYS (90) for the first FOUNDER_SLOTS (50) creators, then
   TRIAL_DAYS (7). Billing switches on when STRIPE_SECRET_KEY, STRIPE_PRICE_ID
   and SUPABASE_SECRET_KEY are all set; until then everyone signed in has
   full access. Stripe is the source of truth - hub_billing mirrors it. */

const KEY = process.env.STRIPE_SECRET_KEY ?? "";
export const PRICE_ID = process.env.STRIPE_PRICE_ID ?? "";
export const billingEnabled = Boolean(KEY && PRICE_ID) && adminEnabled;

const num = (v: string | undefined, fallback: number) => (v && Number.isFinite(Number(v)) ? Number(v) : fallback);
export const TRIAL = {
  founderSlots: num(process.env.FOUNDER_SLOTS, 50),
  founderDays: num(process.env.FOUNDER_TRIAL_DAYS, 90),
  days: num(process.env.TRIAL_DAYS, 7),
};

/** Subscription states that keep the desk open (past_due = card failed, Stripe is retrying). */
const ACCESS_STATUSES = new Set(["trialing", "active", "past_due"]);

let client: Stripe | null = null;
export function stripe() {
  if (!client) {
    // STRIPE_API_HOST points at a local mock for automated tests only.
    const mock = process.env.STRIPE_API_HOST ? new URL(process.env.STRIPE_API_HOST) : null;
    client = new Stripe(KEY, mock ? { host: mock.hostname, port: mock.port, protocol: mock.protocol.replace(":", "") as "http" } : {});
  }
  return client;
}

/* ---- Reading a creator's billing ---- */

type Row = {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string | null;
  trial_end: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  founder: boolean;
  had_subscription: boolean;
};

export async function billingFor(user: HubUser): Promise<Billing> {
  if (isOwner(user.email)) return { ...OPEN_ACCESS, enabled: billingEnabled, owner: true };
  if (!billingEnabled) return OPEN_ACCESS;
  const db = await serverClient();
  const { data } = await db.from("hub_billing").select("*").eq("user_id", user.id).maybeSingle<Row>();
  return {
    enabled: true,
    owner: false,
    hasAccess: Boolean(data?.status && ACCESS_STATUSES.has(data.status)),
    status: data?.status ?? null,
    trialEnd: data?.trial_end ?? null,
    periodEnd: data?.current_period_end ?? null,
    cancelAtPeriodEnd: data?.cancel_at_period_end ?? false,
    founder: data?.founder ?? false,
  };
}

/* ---- The offer: price, trial length, founder spots ---- */

let priceCache: { at: number; label: string | null } | null = null;

/** "£9.99/month", from the Stripe price itself so the page never disagrees with checkout. */
export async function priceLabel(): Promise<string | null> {
  if (!billingEnabled) return null;
  if (priceCache && Date.now() - priceCache.at < 10 * 60_000) return priceCache.label;
  let label: string | null = null;
  try {
    const p = await stripe().prices.retrieve(PRICE_ID);
    if (p.unit_amount != null) {
      const amount = new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: p.currency.toUpperCase(),
        minimumFractionDigits: p.unit_amount % 100 === 0 ? 0 : 2,
      }).format(p.unit_amount / 100);
      const every = p.recurring ? (p.recurring.interval_count > 1 ? ` every ${p.recurring.interval_count} ${p.recurring.interval}s` : `/${p.recurring.interval}`) : "";
      label = amount + every;
    }
  } catch (e) {
    console.error("Creator Desk: couldn't load the Stripe price", e);
  }
  priceCache = { at: Date.now(), label };
  return label;
}

/** Founder trials already taken. Works for signed-out visitors too (landing page). */
export async function founderSpotsTaken(): Promise<number> {
  const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const { data, error } = await db.rpc("hub_founder_spots_taken");
  if (error) {
    console.error("Creator Desk: couldn't count founder spots", error);
    return TRIAL.founderSlots; // fail closed: no founder trial if we can't count
  }
  return Number(data) || 0;
}

export async function currentOffer(hadSubscription = false): Promise<Offer> {
  const [price, taken] = await Promise.all([priceLabel(), founderSpotsTaken()]);
  const spotsLeft = Math.max(0, TRIAL.founderSlots - taken);
  const founder = !hadSubscription && spotsLeft > 0;
  return {
    price,
    // No second trial for someone who's subscribed before.
    trialDays: hadSubscription ? 0 : founder ? TRIAL.founderDays : TRIAL.days,
    founder,
    spotsLeft,
    founderSlots: TRIAL.founderSlots,
  };
}

/* ---- Writing billing state (server only) ---- */

export async function billingRow(userId: string): Promise<Row | null> {
  const { data } = await adminClient().from("hub_billing").select("*").eq("user_id", userId).maybeSingle<Row>();
  return data;
}

/** The creator's Stripe customer, created on first checkout. */
export async function ensureCustomer(user: HubUser): Promise<string> {
  const row = await billingRow(user.id);
  if (row?.stripe_customer_id) return row.stripe_customer_id;
  const customer = await stripe().customers.create(
    { email: user.email, name: user.name, metadata: { user_id: user.id } },
    // A double click mustn't create two customers.
    { idempotencyKey: `creator-desk-customer-${user.id}` },
  );
  const { error } = await adminClient().from("hub_billing").upsert({ user_id: user.id, stripe_customer_id: customer.id, updated_at: new Date().toISOString() });
  if (error) throw error;
  return customer.id;
}

const iso = (s: number | null | undefined) => (s ? new Date(s * 1000).toISOString() : null);

/** Copy a subscription's current state from Stripe into hub_billing. Always
    re-reads it from Stripe, so webhooks arriving out of order can't leave stale data. */
export async function syncSubscription(subscriptionId: string, userIdHint?: string) {
  const sub = await stripe().subscriptions.retrieve(subscriptionId);
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const admin = adminClient();

  let userId = sub.metadata?.user_id || userIdHint || null;
  if (!userId) {
    const { data } = await admin.from("hub_billing").select("user_id").eq("stripe_customer_id", customerId).maybeSingle<{ user_id: string }>();
    userId = data?.user_id ?? null;
  }
  if (!userId) {
    console.error("Creator Desk: subscription with no matching user", sub.id);
    return;
  }

  const existing = await billingRow(userId);
  const item = sub.items.data[0];
  const { error } = await admin.from("hub_billing").upsert({
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    status: sub.status,
    price_id: item?.price.id ?? null,
    trial_end: iso(sub.trial_end),
    current_period_end: iso(item?.current_period_end),
    cancel_at_period_end: sub.cancel_at_period_end || Boolean(sub.cancel_at),
    founder: Boolean(existing?.founder) || sub.metadata?.founder === "true",
    had_subscription: true,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
