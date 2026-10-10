import "server-only";
import { accountsEnabled } from "./supabase/config";
import { adminClient, adminEnabled } from "./supabase/admin";
import type { HubUser } from "./supabase/server";
import { isOwner } from "./owners";

/* Whose TrendTrack key a request uses. TrendTrack's terms allow personal or
   internal use, so by default each creator connects their own key; owners use
   the server's key; TRENDTRACK_SHARED=true lets everyone use the server's key
   (only once TrendTrack has agreed to that in writing). */

export type TrendTrack =
  | { mode: "live"; key: string; via: "own" | "owner" | "shared" }
  | { mode: "demo" } // nothing set up at all: made-up brands
  | { mode: "none" }; // accounts on, but this creator hasn't connected TrendTrack

const SERVER_KEY = process.env.TRENDTRACK_API_KEY ?? "";

export async function trendTrackFor(user: HubUser | null): Promise<TrendTrack> {
  if (!accountsEnabled) {
    // Single-user: live only behind the HUB_PASSWORD gate, so strangers can't spend credits.
    return SERVER_KEY && process.env.HUB_PASSWORD ? { mode: "live", key: SERVER_KEY, via: "owner" } : { mode: "demo" };
  }
  if (!user) return { mode: "none" };
  const own = await ownKey(user.id);
  if (own) return { mode: "live", key: own.api_key, via: "own" };
  if (SERVER_KEY && (await isOwner(user.email))) return { mode: "live", key: SERVER_KEY, via: "owner" };
  if (SERVER_KEY && process.env.TRENDTRACK_SHARED === "true") return { mode: "live", key: SERVER_KEY, via: "shared" };
  return { mode: "none" };
}

export async function ownKey(userId: string) {
  if (!adminEnabled) return null;
  const { data } = await adminClient()
    .from("hub_trendtrack_keys")
    .select("api_key, workspace")
    .eq("user_id", userId)
    .maybeSingle<{ api_key: string; workspace: string | null }>();
  return data;
}

/** Ask TrendTrack who a key belongs to - checks it works before we save it. */
export async function checkKey(key: string): Promise<{ ok: true; workspace: string } | { ok: false; error: string }> {
  try {
    const res = await fetch("https://api.trendtrack.io/v1/me", { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
    if (res.status === 401 || res.status === 403) return { ok: false, error: "TrendTrack didn't accept that key. Check you copied all of it and that API access is on for your workspace." };
    if (!res.ok) return { ok: false, error: `TrendTrack is having trouble right now (${res.status}). Try again in a minute.` };
    const me = (await res.json()) as { workspace?: { name?: string } };
    return { ok: true, workspace: me.workspace?.name ?? "TrendTrack" };
  } catch {
    return { ok: false, error: "Couldn't reach TrendTrack. Try again in a minute." };
  }
}
