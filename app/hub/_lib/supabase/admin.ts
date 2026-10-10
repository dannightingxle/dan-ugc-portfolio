import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, accountsEnabled } from "./config";

/* Full-access Supabase client for the server only. It bypasses row-level
   security, so it's used just for things creators mustn't do themselves:
   writing billing state from Stripe and storing TrendTrack keys. */

const SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
export const adminEnabled = accountsEnabled && Boolean(SECRET);

let client: SupabaseClient | null = null;

export function adminClient() {
  if (!adminEnabled) throw new Error("SUPABASE_SECRET_KEY is not set");
  client ??= createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
