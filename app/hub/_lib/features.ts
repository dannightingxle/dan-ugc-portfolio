import "server-only";
import { adminClient, adminEnabled } from "./supabase/admin";
import type { HubUser } from "./supabase/server";
import { isOwner } from "./owners";
import { AUDIENCES, FEATURES, type Audience, type FeatureKey } from "./features-list";

/* Who can use each staged feature. Owners always can; everyone else depends
   on the feature's audience in hub_features (default: owners only). */

let cache: { at: number; audiences: Record<string, Audience> } | null = null;

export async function audiences(): Promise<Record<FeatureKey, Audience>> {
  const base = Object.fromEntries(FEATURES.map((f) => [f.key, "owner" as Audience])) as Record<FeatureKey, Audience>;
  if (!adminEnabled) return base;
  if (cache && Date.now() - cache.at < 30_000) return { ...base, ...cache.audiences };
  const { data, error } = await adminClient().from("hub_features").select("key, audience");
  if (error) {
    console.error("Creator Desk: couldn't read hub_features", error);
    return base; // fail closed: owners only
  }
  const found = Object.fromEntries((data ?? []).filter((r) => (AUDIENCES as readonly string[]).includes(r.audience)).map((r) => [r.key, r.audience as Audience]));
  cache = { at: Date.now(), audiences: found };
  return { ...base, ...found };
}

export async function setAudience(key: FeatureKey, audience: Audience) {
  const { error } = await adminClient().from("hub_features").upsert({ key, audience, updated_at: new Date().toISOString() });
  if (error) throw error;
  cache = null;
}

export async function inBetaGroup(email: string) {
  if (!adminEnabled || !email) return false;
  const { data } = await adminClient().from("hub_beta_members").select("email").eq("email", email.trim().toLowerCase()).maybeSingle();
  return Boolean(data);
}

/** The staged features this person can use. */
export async function featuresFor(user: HubUser | null): Promise<FeatureKey[]> {
  if (!user || !adminEnabled) return [];
  if (await isOwner(user.email)) return FEATURES.map((f) => f.key);
  const aud = await audiences();
  const keys = FEATURES.map((f) => f.key);
  const beta = keys.some((k) => aud[k] === "beta") && (await inBetaGroup(user.email));
  return keys.filter((k) => aud[k] === "everyone" || (aud[k] === "beta" && beta));
}

export async function canUse(user: HubUser | null, key: FeatureKey) {
  return (await featuresFor(user)).includes(key);
}
