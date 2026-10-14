import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_KEY, SUPABASE_URL, accountsEnabled } from "./config";
import { isCurrency, type Currency } from "../currencies";

/** Supabase client for route handlers and server components, acting as the signed-in user. */
export async function serverClient() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(toSet) {
        try {
          toSet.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server components can't set cookies; proxy.ts keeps the session fresh instead.
        }
      },
    },
  });
}

/** currency: what totals are shown in (set on the account page). */
export type HubUser = { id: string; email: string; name: string; currency: Currency };

/** The signed-in user, or null (also null when accounts aren't set up). */
export async function currentUser(): Promise<HubUser | null> {
  if (!accountsEnabled) return null;
  const db = await serverClient();
  const { data } = await db.auth.getUser();
  if (!data.user) return null;
  const email = data.user.email ?? "";
  const meta = data.user.user_metadata ?? {};
  return { id: data.user.id, email, name: (meta.name as string | undefined) || email.split("@")[0], currency: isCurrency(meta.currency) ? meta.currency : "GBP" };
}
