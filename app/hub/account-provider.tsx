"use client";

import { createContext, useContext, useEffect } from "react";
import { initStore } from "./_lib/store";
import { browserClient } from "./_lib/supabase/browser";
import type { HubUser } from "./_lib/supabase/server";

/* Who's signed in, for any hub component, and the switch that points the data
   store at their account (or at this browser when accounts are off). */

type Account = { enabled: boolean; user: HubUser | null };
const AccountContext = createContext<Account>({ enabled: false, user: null });

export function useAccount() {
  return useContext(AccountContext);
}

export function AccountProvider({ enabled, user, children }: Account & { children: React.ReactNode }) {
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

  return <AccountContext.Provider value={{ enabled, user }}>{children}</AccountContext.Provider>;
}
