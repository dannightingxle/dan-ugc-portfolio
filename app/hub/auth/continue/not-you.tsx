"use client";

import { browserClient } from "../../_lib/supabase/browser";

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
  return (
    <button
      type="button"
      onClick={async () => {
        await browserClient().auth.signOut({ scope: "local" });
        window.location.href = then;
      }}
      className={className}
    >
      {children}
    </button>
  );
}
