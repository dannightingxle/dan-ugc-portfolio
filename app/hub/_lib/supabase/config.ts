/* Accounts are on when these two public values are set (Vercel → Environment
   Variables). Without them the hub runs single-user, saving to the browser. */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const accountsEnabled = Boolean(SUPABASE_URL && SUPABASE_KEY);

/** Optional invite list: comma-separated emails allowed in. Unset means anyone can sign up. */
export function isAllowed(email: string | undefined | null) {
  const list = (process.env.HUB_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.length === 0 || (Boolean(email) && list.includes(email!.toLowerCase()));
}
