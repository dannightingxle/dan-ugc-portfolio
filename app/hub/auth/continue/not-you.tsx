"use client";

import { browserClient } from "../../_lib/supabase/browser";

export function NotYou() {
  return (
    <button
      type="button"
      onClick={async () => {
        await browserClient().auth.signOut();
        window.location.href = "/hub/login";
      }}
      className="text-sm text-text-dim hover:text-text"
    >
      Not you? Sign out
    </button>
  );
}
