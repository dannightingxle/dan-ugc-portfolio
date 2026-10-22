"use client";

import { useState } from "react";
import { AUDIENCES, AUDIENCE_LABEL, FEATURES, type Audience, type FeatureKey } from "../_lib/features-list";
import { Busy, useBusy } from "../_lib/ui";

/* Who sees each staged feature, and who's in the beta group. Changes apply
   straight away (within about 30 seconds for people already signed in). */

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
  return json;
}

export function Rollout({ audiences: initial, beta: initialBeta }: { audiences: Record<FeatureKey, Audience>; beta: string[] }) {
  const [audiences, setAudiences] = useState(initial);
  const [beta, setBeta] = useState(initialBeta);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [adding, add] = useBusy();
  const [removing, setRemoving] = useState<string | null>(null);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Who sees what</h2>
        <p className="text-sm text-text-muted">New features start with just you. Move one to your beta group, then to everyone, when it&apos;s ready.</p>
      </div>
      <div className="divide-y divide-border rounded-xl border border-border bg-bg-card">
        {FEATURES.map((f) => (
          <div key={f.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{f.name}</p>
              <p className="text-sm text-text-dim">{f.about}</p>
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-bg-elevated p-1" role="radiogroup" aria-label={`Who sees ${f.name}`}>
              {AUDIENCES.map((a) => (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={audiences[f.key] === a}
                  onClick={async () => {
                    const before = audiences;
                    setAudiences({ ...audiences, [f.key]: a });
                    setError("");
                    await send("/api/hub/admin/features", "POST", { key: f.key, audience: a }).catch((e: Error) => {
                      setAudiences(before);
                      setError(e.message);
                    });
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${audiences[f.key] === a ? "bg-bg-card text-text shadow-sm" : "text-text-dim hover:text-text"}`}
                >
                  {AUDIENCE_LABEL[a]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-bg-card p-4">
        <div>
          <h3 className="font-medium">Beta group ({beta.length})</h3>
          <p className="text-sm text-text-dim">E.g. your mentorship group. Add people by the email they sign up with - before or after they join.</p>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add(async () => {
              setError("");
              try {
                const r = await send("/api/hub/admin/beta", "POST", { email });
                setBeta((list) => [...new Set([r.email as string, ...list])]);
                setEmail("");
              } catch (err) {
                setError((err as Error).message);
              }
            });
          }}
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button disabled={adding} aria-busy={adding} className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60">
            <Busy busy={adding} label="Adding…">
              Add
            </Busy>
          </button>
        </form>
        {beta.length > 0 && (
          <ul className="divide-y divide-border text-sm">
            {beta.map((b) => (
              <li key={b} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0 truncate">{b}</span>
                <button
                  type="button"
                  disabled={removing === b}
                  aria-busy={removing === b}
                  onClick={async () => {
                    setError("");
                    setRemoving(b);
                    await send("/api/hub/admin/beta", "DELETE", { email: b })
                      .then(() => setBeta((list) => list.filter((x) => x !== b)))
                      .catch((e: Error) => setError(e.message));
                    setRemoving(null);
                  }}
                  className="text-xs text-text-dim hover:text-accent disabled:opacity-60"
                >
                  <Busy busy={removing === b} label="Removing…">
                    Remove
                  </Busy>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="text-sm text-accent">{error}</p>}
    </section>
  );
}
