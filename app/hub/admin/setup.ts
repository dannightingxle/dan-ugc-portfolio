import "server-only";
import { adminClient } from "../_lib/supabase/admin";
import { emailsConfirmed } from "../_lib/owners";
import { STRIPE_LIVE, billingEnabled, priceLabel } from "../_lib/billing/stripe";
import { BRAND } from "../_lib/brand";

/* What's set up and what's still missing, for the admin page. "launch" items
   are needed before strangers sign up and pay; "tools" items switch on your
   own features. Each missing item says where to fix it (see LAUNCH.md). */

export type Check = { label: string; ok: boolean; fix: string; group: "launch" | "tools" };

/** Does this table exist yet (i.e. has its migration been run)? */
async function hasTable(table: string) {
  const { error } = await adminClient().from(table).select("*", { head: true, count: "exact" }).limit(1);
  return !error;
}

export async function setupChecks(configInStep: boolean): Promise<Check[]> {
  const env = (k: string) => Boolean(process.env[k]);
  const [m1, m2, m3, m4, confirming, price] = await Promise.all([
    hasTable("hub_projects"),
    hasTable("hub_billing"),
    hasTable("hub_workspaces"),
    hasTable("hub_edits"),
    emailsConfirmed(),
    priceLabel(),
  ]);
  const migrations = [
    [m1, "20261006120000_creator_hub.sql"],
    [m2, "20261007090000_creator_desk_launch.sql"],
    [m3, "20261010120000_creator_studio.sql"],
    [m4, "20261016090000_creator_edits.sql"],
  ] as const;
  const missing = migrations.filter(([ok]) => !ok).map(([, f]) => f);

  return [
    { group: "launch", label: "Database up to date", ok: missing.length === 0, fix: `Run in Supabase → SQL Editor, in order: ${missing.join(", ")} (LAUNCH.md step 3.2).` },
    { group: "launch", label: "Email confirmation on", ok: confirming, fix: "Supabase → Authentication → Sign In / Providers → Email → Confirm email ON (step 3.4)." },
    { group: "launch", label: "Trial history secret set", ok: env("HUB_HASH_SECRET"), fix: "Add HUB_HASH_SECRET in Vercel: a long random value, set once (step 6)." },
    { group: "launch", label: "Stripe connected", ok: billingEnabled, fix: "Add STRIPE_SECRET_KEY and STRIPE_PRICE_ID in Vercel (steps 5-6)." },
    { group: "launch", label: "Price loads from Stripe", ok: Boolean(price), fix: "Check STRIPE_PRICE_ID matches a recurring price in the same Stripe mode as the key." },
    { group: "launch", label: "Stripe webhook connected", ok: env("STRIPE_WEBHOOK_SECRET"), fix: "Add the webhook endpoint in Stripe and STRIPE_WEBHOOK_SECRET in Vercel (step 5.4)." },
    { group: "launch", label: "Stripe live mode", ok: STRIPE_LIVE, fix: "Still on test keys - fine for testing; switch to live keys to take real payments (step 8)." },
    { group: "launch", label: "Database paywall in step", ok: configInStep, fix: "Reload in a minute; if it stays, look for 'hub_config' in Vercel → Logs." },
    { group: "launch", label: "Support email and legal name", ok: Boolean(BRAND.supportEmail && BRAND.legalName), fix: "Add NEXT_PUBLIC_SUPPORT_EMAIL and NEXT_PUBLIC_LEGAL_NAME in Vercel (shown on the legal pages)." },
    { group: "tools", label: "Claude (Studio, personal brand plan)", ok: env("ANTHROPIC_API_KEY"), fix: "Add ANTHROPIC_API_KEY in Vercel (console.anthropic.com → API keys) and set a spend limit." },
    { group: "tools", label: "Apify (automatic stats)", ok: env("APIFY_TOKEN"), fix: "Add APIFY_TOKEN in Vercel (apify.com → Settings → API & Integrations)." },
    { group: "tools", label: "Monday auto-plans", ok: env("CRON_SECRET"), fix: "Add CRON_SECRET in Vercel: any long random value." },
    { group: "tools", label: "TrendTrack (your key)", ok: env("TRENDTRACK_API_KEY"), fix: "Add TRENDTRACK_API_KEY in Vercel." },
  ];
}
