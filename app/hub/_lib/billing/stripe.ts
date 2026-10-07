import "server-only";
import { createHmac } from "node:crypto";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "../supabase/config";
import { adminClient, adminEnabled } from "../supabase/admin";
import { serverClient, type HubUser } from "../supabase/server";
import { isOwner } from "../owners";
import { OPEN_ACCESS, type Billing, type Offer } from "./types";

/* Stripe subscriptions. A card is taken at sign-up and the trial starts:
   FOUNDER_TRIAL_DAYS (90) for the first FOUNDER_SLOTS (50) creators, then
   TRIAL_DAYS (7), and never twice for the same person. Billing switches on
   when STRIPE_SECRET_KEY, STRIPE_PRICE_ID and SUPABASE_SECRET_KEY are all set;
   until then everyone signed in has full access. Stripe is the source of
   truth - hub_billing mirrors the customer's best subscription. */

const KEY = process.env.STRIPE_SECRET_KEY ?? "";
export const PRICE_ID = process.env.STRIPE_PRICE_ID ?? "";
export const billingEnabled = Boolean(KEY && PRICE_ID) && adminEnabled;
/** Live or test mode - subscriptions and trials from the other mode never count. */
export const STRIPE_LIVE = /^(sk|rk)_live_/.test(KEY);
/** Vercel previews never set the database's paywall switch - only production (or a server outside Vercel). */
const MANAGES_CONFIG = (process.env.VERCEL_ENV ?? "production") === "production";

const num = (v: string | undefined, fallback: number) => (v && Number.isFinite(Number(v)) ? Number(v) : fallback);
export const TRIAL = {
  founderSlots: num(process.env.FOUNDER_SLOTS, 50),
  founderDays: num(process.env.FOUNDER_TRIAL_DAYS, 90),
  days: num(process.env.TRIAL_DAYS, 7),
};

/** Checkout links last this long (Stripe's minimum); founder spots are held slightly longer. */
export const CHECKOUT_MINUTES = 31;
const HOLD_MINUTES = 33;

/** Subscription states that keep the desk open (past_due = card failed, Stripe is retrying). */
const LIVE = new Set(["trialing", "active", "past_due"]);
const ENDED = new Set(["canceled", "incomplete_expired"]);

let client: Stripe | null = null;
export function stripe() {
  if (!client) {
    // STRIPE_API_HOST points at a local mock for automated tests only.
    const mock = process.env.STRIPE_API_HOST ? new URL(process.env.STRIPE_API_HOST) : null;
    client = new Stripe(KEY, mock ? { host: mock.hostname, port: mock.port, protocol: mock.protocol.replace(":", "") as "http" } : {});
  }
  return client;
}

/** Keyed one-way hash for "has this person had a trial": lower-case, no
    +tags, no dots for Gmail. Keyed with a server secret so a leaked table
    can't be reversed with a list of emails - set HUB_HASH_SECRET once and
    never change it. */
const HASH_SECRET = process.env.HUB_HASH_SECRET || process.env.SUPABASE_SECRET_KEY || "creator-desk";
export function emailKey(email: string) {
  const [rawLocal = "", rawDomain = ""] = email.trim().toLowerCase().split("@");
  let local = rawLocal.split("+")[0];
  let domain = rawDomain;
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
    domain = "gmail.com";
  }
  return createHmac("sha256", HASH_SECRET).update(`${local}@${domain}`).digest("hex");
}

/* ---- Keeping the database's paywall switch in step with this deploy ---- */

let configSynced = false;
async function syncConfig() {
  if (configSynced || !adminEnabled || !MANAGES_CONFIG) return;
  configSynced = true;
  const { error } = await adminClient().from("hub_config").update({ enforce_billing: billingEnabled, live_mode: STRIPE_LIVE }).eq("id", true);
  if (error) {
    configSynced = false;
    console.error("Creator Desk: couldn't update hub_config", error);
  }
}

/** Mark owners in hub_billing so the database lets them save without a
    subscription. Checked in the database each time (not remembered per
    server), so it's back straight away if it was ever cleared. */
async function markOwner(userId: string) {
  if (!adminEnabled) return;
  const { data } = await adminClient().from("hub_billing").select("owner").eq("user_id", userId).maybeSingle<{ owner: boolean }>();
  if (data?.owner) return;
  await adminClient().from("hub_billing").upsert({ user_id: userId, owner: true, updated_at: new Date().toISOString() });
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
  comped: boolean;
  owner: boolean;
  livemode: boolean | null;
};

/** A trial or paid period that should have rolled over by now means we missed an update from Stripe. */
function isStale(r: Row) {
  if (!r.stripe_customer_id || !LIVE.has(r.status ?? "") || r.livemode !== STRIPE_LIVE) return false;
  const end = r.status === "trialing" ? r.trial_end : r.current_period_end;
  return Boolean(end && new Date(end).getTime() + 60 * 60_000 < Date.now());
}

export async function billingFor(user: HubUser): Promise<Billing> {
  await syncConfig();
  if (await isOwner(user.email)) {
    await markOwner(user.id);
    return { ...OPEN_ACCESS, enabled: billingEnabled, owner: true };
  }
  if (!billingEnabled) return OPEN_ACCESS;

  const db = await serverClient();
  const read = async () => (await db.from("hub_billing").select("*").eq("user_id", user.id).maybeSingle<Row>()).data;
  let data = await read();
  if (data?.owner && adminEnabled) {
    // No longer an owner (taken off HUB_OWNER_EMAILS): remove the free access that came with it.
    await adminClient().from("hub_billing").update({ owner: false }).eq("user_id", user.id);
    data = { ...data, owner: false };
  }
  if (data && isStale(data)) {
    await syncCustomer(data.stripe_customer_id!, user.id).catch((e) => console.error("Creator Desk: re-sync failed", e));
    data = await read();
  }
  // A subscription from the other Stripe mode (e.g. a test sign-up before going live) doesn't count.
  const current = data?.livemode === STRIPE_LIVE ? data : null;
  const subscribed = LIVE.has(current?.status ?? "");
  return {
    enabled: true,
    owner: false,
    comped: Boolean(data?.comped),
    hasAccess: Boolean(data?.comped) || subscribed,
    status: current?.status ?? null,
    trialEnd: current?.trial_end ?? null,
    periodEnd: current?.current_period_end ?? null,
    cancelAtPeriodEnd: current?.cancel_at_period_end ?? false,
    founder: current?.founder ?? false,
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

/** Founder trials started plus spots held in checkout. Works for signed-out visitors (landing page). */
export async function founderSpotsTaken(): Promise<number> {
  const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const { data, error } = await db.rpc("hub_founder_spots_taken");
  if (error) {
    console.error("Creator Desk: couldn't count founder spots", error);
    return TRIAL.founderSlots; // fail closed: no founder trial if we can't count
  }
  return Number(data) || 0;
}

/** Has this person had a free trial before - on this account, or one they deleted? */
export async function hadTrialBefore(user: HubUser, row: Row | null) {
  if (row?.had_subscription && row.livemode === STRIPE_LIVE) return true;
  const { data, error } = await adminClient()
    .from("hub_trial_history")
    .select("email_key")
    .eq("email_key", emailKey(user.email))
    .eq("livemode", STRIPE_LIVE)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/** What to show someone: the price, and the trial they'd get if they started now. */
export async function currentOffer(hadTrial = false): Promise<Offer> {
  await syncConfig(); // the landing page is usually the first thing a new deploy serves
  const [price, taken] = await Promise.all([priceLabel(), founderSpotsTaken()]);
  const spotsLeft = Math.max(0, TRIAL.founderSlots - taken);
  const founder = !hadTrial && spotsLeft > 0;
  return {
    price,
    trialDays: hadTrial ? 0 : founder ? TRIAL.founderDays : TRIAL.days,
    founder,
    spotsLeft,
    founderSlots: TRIAL.founderSlots,
  };
}

/** Hold a founder spot while this creator checks out. False if they're all taken. */
export async function reserveFounderSpot(user: HubUser): Promise<boolean> {
  const { data, error } = await adminClient().rpc("hub_reserve_founder_spot", {
    p_user: user.id,
    p_email_key: emailKey(user.email),
    p_slots: TRIAL.founderSlots,
    p_minutes: HOLD_MINUTES,
  });
  if (error) console.error("Creator Desk: couldn't reserve a founder spot", error);
  return data === true;
}

/* ---- Writing billing state (server only) ---- */

export async function billingRow(userId: string): Promise<Row | null> {
  const { data } = await adminClient().from("hub_billing").select("*").eq("user_id", userId).maybeSingle<Row>();
  return data;
}

/** The creator's Stripe customer in the current mode, created on first checkout. */
export async function ensureCustomer(user: HubUser): Promise<string> {
  const row = await billingRow(user.id);
  if (row?.stripe_customer_id && row.livemode === STRIPE_LIVE) return row.stripe_customer_id;
  const customer = await stripe().customers.create(
    { email: user.email, name: user.name, metadata: { user_id: user.id } },
    // A double click mustn't create two customers.
    { idempotencyKey: `creator-desk-customer-${STRIPE_LIVE ? "live" : "test"}-${user.id}` },
  );
  // Starting afresh in this mode (e.g. after test sign-ups before going live).
  const { error } = await adminClient().from("hub_billing").upsert({
    user_id: user.id,
    stripe_customer_id: customer.id,
    livemode: customer.livemode,
    ...(row?.livemode !== customer.livemode && {
      stripe_subscription_id: null,
      status: null,
      price_id: null,
      trial_end: null,
      current_period_end: null,
      cancel_at_period_end: false,
      founder: false,
      had_subscription: false,
    }),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return customer.id;
}

/** Close any other checkout this customer has open, so they can't end up paying twice. */
export async function expireOpenCheckouts(customerId: string) {
  const open = await stripe().checkout.sessions.list({ customer: customerId, status: "open", limit: 10 });
  for (const s of open.data) await stripe().checkout.sessions.expire(s.id).catch(() => {});
}

/** Remember that this person has had a trial (kept even after they delete their account). */
export async function recordTrial(email: string, founder: boolean, livemode: boolean, userId?: string) {
  const admin = adminClient();
  const key = emailKey(email);
  const { data: prior, error: readError } = await admin
    .from("hub_trial_history")
    .select("founder")
    .eq("email_key", key)
    .eq("livemode", livemode)
    .maybeSingle<{ founder: boolean }>();
  if (readError) throw readError;
  const { error } = await admin
    .from("hub_trial_history")
    .upsert({ email_key: key, livemode, founder: Boolean(prior?.founder) || founder }, { onConflict: "email_key,livemode" });
  if (error) throw error;
  if (userId) await admin.from("hub_founder_reservations").delete().eq("user_id", userId);
}

/** Cancel straight away every subscription that hasn't already ended. */
async function cancelAll(subs: Stripe.Subscription[]) {
  for (const s of subs.filter((s) => !ENDED.has(s.status))) await stripe().subscriptions.cancel(s.id);
}

/** Before an account is deleted: stop anything that could still charge them,
    and remember they've had a trial so signing up again doesn't give another. */
export async function closeBilling(user: HubUser) {
  const row = await billingRow(user.id);
  // A customer from Stripe's other mode (a test sign-up before going live) can't be charged from here.
  if (!row?.stripe_customer_id || row.livemode !== STRIPE_LIVE) return;
  await expireOpenCheckouts(row.stripe_customer_id);
  const subs = await subscriptionsOf(row.stripe_customer_id);
  await cancelAll(subs);
  if (subs.some((s) => s.trial_end != null)) {
    await recordTrial(user.email, row.founder || subs.some((s) => s.metadata?.founder === "true"), STRIPE_LIVE);
  }
}

const customerIdOf = (c: string | Stripe.Customer | Stripe.DeletedCustomer) => (typeof c === "string" ? c : c.id);

/** The customer's subscriptions, newest first. */
export async function subscriptionsOf(customerId: string) {
  const list = await stripe().subscriptions.list({ customer: customerId, status: "all", limit: 20 });
  return [...list.data].sort((a, b) => b.created - a.created);
}

/** A live subscription wins over older ended ones, so a stray update about an
    old subscription can never overwrite the one that's actually running. */
function best(subs: Stripe.Subscription[]) {
  return subs.find((s) => LIVE.has(s.status)) ?? subs[0] ?? null;
}

const iso = (s: number | null | undefined) => (s ? new Date(s * 1000).toISOString() : null);

/** Copy a customer's current state from Stripe into hub_billing (and the trial
    history). Always re-reads Stripe, so webhooks arriving late or out of order
    can't leave stale data. Safe to call any number of times. */
export async function syncCustomer(customerRef: string | Stripe.Customer | Stripe.DeletedCustomer, userIdHint?: string) {
  const customerId = customerIdOf(customerRef);
  const admin = adminClient();
  let subs = await subscriptionsOf(customerId);
  // Never two at once (say, two checkouts finished side by side): keep the first, cancel the rest.
  const running = subs.filter((s) => LIVE.has(s.status));
  if (running.length > 1) {
    for (const extra of running.slice(0, -1)) {
      // (Another update may be cancelling it at the same moment.)
      await stripe().subscriptions.cancel(extra.id).catch((e) => console.error("Creator Desk: couldn't cancel a duplicate subscription", extra.id, e));
    }
    subs = await subscriptionsOf(customerId);
  }
  const sub = best(subs);

  let userId = sub?.metadata?.user_id || userIdHint || null;
  if (!userId) {
    const { data } = await admin.from("hub_billing").select("user_id").eq("stripe_customer_id", customerId).maybeSingle<{ user_id: string }>();
    userId = data?.user_id ?? null;
  }
  if (!userId) {
    const customer = await stripe().customers.retrieve(customerId);
    if (!customer.deleted) userId = customer.metadata?.user_id ?? null;
  }
  if (!userId) {
    console.error("Creator Desk: Stripe customer with no matching user", customerId);
    return;
  }
  // Any error other than "no such account" is thrown, so Stripe retries the webhook later.
  const { data: found, error: lookupError } = await admin.auth.admin.getUserById(userId);
  if (lookupError && lookupError.status !== 404) throw lookupError;
  if (!found?.user) {
    // The account's been deleted: make sure nothing of theirs can still charge them.
    await expireOpenCheckouts(customerId);
    await cancelAll(subs);
    return;
  }
  if (!sub) return;

  const existing = await billingRow(userId);
  const item = sub.items.data[0];
  const founder = Boolean(existing?.founder) || sub.metadata?.founder === "true";
  const { error } = await admin.from("hub_billing").upsert({
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    status: sub.status,
    price_id: item?.price.id ?? null,
    trial_end: iso(sub.trial_end),
    current_period_end: iso(item?.current_period_end),
    cancel_at_period_end: sub.cancel_at_period_end || Boolean(sub.cancel_at),
    founder,
    had_subscription: true,
    livemode: sub.livemode,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    if (error.code === "23503") return; // account deleted mid-sync
    throw error;
  }

  // Remember that this person has had a trial, even if they later delete their account.
  if (found.user.email && subs.some((s) => s.trial_end != null)) await recordTrial(found.user.email, founder, sub.livemode, userId);
}
