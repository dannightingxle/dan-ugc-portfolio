"use client";

import { browserClient } from "../../_lib/supabase/browser";
import { Busy, useBusy } from "../../_lib/ui";

/** Signs out of this browser only, then goes to `then`. */
export function SignOut({
  then = "/hub/login",
  className = "text-sm text-text-dim hover:text-text",
  children = "Not you? Sign out",
}: {
  then?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [busy, run] = useBusy();
  return (
    <button
      type="button"
      disabled={busy}
      aria-busy={busy}
      onClick={() =>
        run(async () => {
          await browserClient().auth.signOut({ scope: "local" });
          window.location.href = then;
        })
      }
      className={className}
    >
      <Busy busy={busy} label="Signing out…">
        {children}
      </Busy>
    </button>
  );
}
