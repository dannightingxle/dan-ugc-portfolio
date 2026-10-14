/* Accounts are on when these two public values are set (Vercel → Environment
   Variables). Without them the hub runs single-user, saving to the browser. */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const accountsEnabled = Boolean(SUPABASE_URL && SUPABASE_KEY);

/** A list of emails from an env var. Forgiving about how it was pasted:
    commas, semicolons, spaces or new lines between them, quotes or <> around them. */
export function emailList(value: string | undefined) {
  return (value ?? "")
    .split(/[\s,;]+/)
    .map((e) => e.replace(/^["'<]+|["'>]+$/g, "").trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

/** Optional invite list (HUB_ALLOWED_EMAILS). Unset means anyone can sign up. Owners are always allowed. */
export function isAllowed(email: string | undefined | null) {
  const list = emailList(process.env.HUB_ALLOWED_EMAILS);
  if (list.length === 0) return true;
  const e = (email ?? "").trim().toLowerCase();
  return Boolean(e) && (list.includes(e) || emailList(process.env.HUB_OWNER_EMAILS).includes(e));
}
