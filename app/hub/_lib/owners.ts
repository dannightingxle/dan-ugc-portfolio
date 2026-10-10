import "server-only";
import { SUPABASE_KEY, SUPABASE_URL } from "./supabase/config";

/* Owners (HUB_OWNER_EMAILS, comma-separated) never pay, can use the server's
   TrendTrack key and can open /hub/admin. Because that's decided by email,
   it only counts when Supabase makes people confirm their email - otherwise
   anyone could sign up with an owner's address first. */

export function isOwnerEmail(email: string | null | undefined) {
  if (!email) return false;
  return (process.env.HUB_OWNER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

let settings: { until: number; confirming: boolean } | null = null;

/** Is Supabase making new accounts confirm their email? Checked every few
    minutes; fails closed (and tries again sooner) if Supabase can't be reached. */
export async function emailsConfirmed(): Promise<boolean> {
  if (settings && Date.now() < settings.until) return settings.confirming;
  let answer: boolean | null = null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY }, cache: "no-store" });
    if (res.ok) answer = (await res.json()).mailer_autoconfirm === false;
  } catch {}
  settings = { until: Date.now() + (answer === null ? 30_000 : 5 * 60_000), confirming: answer === true };
  return settings.confirming;
}

export async function isOwner(email: string | null | undefined) {
  return isOwnerEmail(email) && (await emailsConfirmed());
}
