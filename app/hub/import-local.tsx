"use client";

import { useState, useSyncExternalStore } from "react";
import { useAccount } from "./account-provider";
import { importLocalData, localDataToImport, useDataReady } from "./_lib/store";
import { browserClient } from "./_lib/supabase/browser";

const noop = () => () => {};

/** Offer to move projects/stars saved in this browser (from before accounts) into the account. */
export function ImportLocal() {
  const { user, billing } = useAccount();
  const ready = useDataReady();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const local = user && billing.hasAccess && mounted && ready && !done ? localDataToImport() : null;
  if (!local) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/30 bg-accent-soft p-4">
      <p className="text-sm">
        Found {local.projects.length} project{local.projects.length === 1 ? "" : "s"} and {local.stars.length} tracked ad
        {local.stars.length === 1 ? "" : "s"} saved in this browser. Add them to your account?
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await importLocalData(browserClient());
            setDone(true);
          } catch (e) {
            setError((e as Error).message);
          }
          setBusy(false);
        }}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
      >
        {busy ? "Adding…" : "Add to my account"}
      </button>
      {error && <p className="w-full text-sm text-accent">{error}</p>}
    </div>
  );
}
