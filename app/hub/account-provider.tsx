"use client";

import { createContext, useContext, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { initStore } from "./_lib/store";
import { browserClient } from "./_lib/supabase/browser";
import type { HubUser } from "./_lib/supabase/server";
import { OPEN_ACCESS, type Billing } from "./_lib/billing/types";

/* Who's signed in and their billing, for any hub component, plus the switch
   that points the data store at their account (or this browser when accounts
   are off). */

type Account = { enabled: boolean; user: HubUser | null; billing: Billing };
const AccountContext = createContext<Account>({ enabled: false, user: null, billing: OPEN_ACCESS });

export function useAccount() {
  return useContext(AccountContext);
}

/** Pages anyone can see, and the ones a creator without an active plan can still use. */
export const PUBLIC_PATHS = ["/hub/welcome", "/hub/privacy", "/hub/terms", "/hub/login"];
const WITHOUT_ACCESS = [...PUBLIC_PATHS, "/hub/billing", "/hub/account"];
const matches = (path: string, list: string[]) => list.some((p) => path === p || path.startsWith(p + "/"));

export function AccountProvider({ enabled, user, billing, children }: Account & { children: React.ReactNode }) {
  useEffect(() => {
    if (!enabled) initStore({ mode: "local" });
    else if (user) initStore({ mode: "remote", db: browserClient(), userId: user.id });
  }, [enabled, user]);

  // Signing out in another tab (or the session expiring) sends this tab to the login page.
  useEffect(() => {
    if (!enabled || !user) return;
    const { data } = browserClient().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") window.location.href = "/hub/login";
    });
    return () => data.subscription.unsubscribe();
  }, [enabled, user]);

  return <AccountContext.Provider value={{ enabled, user, billing }}>{children}</AccountContext.Provider>;
}

/** Signed in but no trial or subscription: everything except billing and account sends you to start one. */
export function AccessGate({ children }: { children: React.ReactNode }) {
  const { user, billing } = useAccount();
  const path = usePathname();
  const router = useRouter();
  const blocked = Boolean(user) && !billing.hasAccess && !matches(path, WITHOUT_ACCESS);
  useEffect(() => {
    if (blocked) router.replace("/hub/billing");
  }, [blocked, router]);
  return blocked ? null : children;
}

export function isPublicPath(path: string) {
  return matches(path, PUBLIC_PATHS);
}
