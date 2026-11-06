"use client";

import { useEffect, useState } from "react";
import { CURRENCIES } from "../_lib/currencies";
import { SPELLINGS, type CreatorProfile } from "../_lib/scripts/types";
import { TextBox } from "../_lib/text-box";
import { Busy, useBusy } from "../_lib/ui";
import { Field, Section, input } from "../projects/fields";

/* The creator profile scripts are written from (who you are, how you talk)
   and your rules, which are added to every script request. */

export function CreatorProfileSection() {
  const [p, setP] = useState<CreatorProfile | null>(null);
  const [status, setStatus] = useState("");
  const [saving, save] = useBusy();
  const [newRule, setNewRule] = useState("");

  useEffect(() => {
    fetch("/api/hub/scripts/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => json && setP(json as CreatorProfile))
      .catch(() => {});
  }, []);
  if (!p) return null;
  const set = <K extends keyof CreatorProfile>(k: K, v: CreatorProfile[K]) => setP((x) => x && { ...x, [k]: v });
  const box = (k: "facts" | "voiceSample" | "products", label: string, hint: string, placeholder: string, rows = 4) => (
    <Field label={label} hint={hint}>
      <TextBox aria-label={label} rows={rows} className={input} value={p[k]} onValue={(v) => set(k, v)} placeholder={placeholder} />
    </Field>
  );

  return (
    <div id="creator-profile" className="scroll-mt-20">
      <Section title="Creator profile (for scripts)">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save(async () => {
              setStatus("");
              const rules = newRule.trim()
                ? [
                    ...p.rules,
                    {
                      id: crypto.randomUUID(),
                      text: newRule.trim(),
                      createdAt: new Date().toISOString(),
                    },
                  ]
                : p.rules;
              const res = await fetch("/api/hub/scripts/profile", {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  ...p,
                  rules: rules.filter((r) => r.text.trim()),
                }),
              });
              const json = await res.json().catch(() => ({}));
              if (!res.ok) return setStatus(json.error ?? "Couldn't save it.");
              setP(json as CreatorProfile);
              setNewRule("");
              setStatus("Saved.");
            });
          }}
        >
          <p className="text-sm text-text-muted">Scripts are written in your voice from this. Only what you write here is used as fact about you.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <input className={input} value={p.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Handle">
              <input className={input} value={p.handle} onChange={(e) => set("handle", e.target.value)} placeholder="@yourhandle" />
            </Field>
            <Field label="Spelling">
              <select className={input} value={p.spelling} onChange={(e) => set("spelling", e.target.value as CreatorProfile["spelling"])}>
                {SPELLINGS.map((s) => (
                  <option key={s} value={s}>
                    {s} English
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Currency in scripts">
              <select className={input} value={p.currency} onChange={(e) => set("currency", e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Niches">
            <input className={input} value={p.niches} onChange={(e) => set("niches", e.target.value)} placeholder="e.g. tech, parenting, fitness" />
          </Field>
          {box(
            "facts",
            "True facts about you that can go in scripts",
            "Only what's written here gets used: family, pets, job, routines, where you live. Anything else a script needs is left as a [placeholder] for you to fill in.",
            "e.g. Dad of 2 (Ava, 6, and Leo, 3). Live in Manchester. Work from home. Gym 3 mornings a week.",
          )}
          {box(
            "voiceSample",
            "How you talk",
            "A short sample of you talking or writing, as you'd say it to camera.",
            "Paste a caption you wrote, or type a few lines as you'd say them…",
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Words you use">
              <input className={input} value={p.wordsUsed} onChange={(e) => set("wordsUsed", e.target.value)} placeholder="e.g. honestly, mate, knackered" />
            </Field>
            <Field label="Words you'd never say">
              <input className={input} value={p.wordsNever} onChange={(e) => set("wordsNever", e.target.value)} placeholder="e.g. obsessed, bestie, hun" />
            </Field>
          </div>
          {box("products", "Products you genuinely use (optional)", "Things you actually use and could mention.", "e.g. iPhone 15 Pro, Oura ring, Huel", 2)}

          <div className="space-y-2">
            <p className="text-xs font-medium text-text-muted">Your rules - added to every script request</p>
            {p.rules.length === 0 && (
              <p className="text-sm text-text-dim">None yet. When a script isn&apos;t right, &quot;Not right?&quot; suggests one you can save.</p>
            )}
            {p.rules.map((r, i) => (
              <div key={r.id} className="flex items-center gap-2">
                <input
                  aria-label={`Rule ${i + 1}`}
                  className={`${input} min-w-0 flex-1`}
                  value={r.text}
                  onChange={(e) =>
                    set(
                      "rules",
                      p.rules.map((x) => (x.id === r.id ? { ...x, text: e.target.value } : x)),
                    )
                  }
                />
                <button
                  type="button"
                  aria-label={`Delete rule ${i + 1}`}
                  onClick={() =>
                    set(
                      "rules",
                      p.rules.filter((x) => x.id !== r.id),
                    )
                  }
                  className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs hover:border-accent hover:text-accent"
                >
                  Delete
                </button>
              </div>
            ))}
            <input
              aria-label="New rule"
              className={input}
              value={newRule}
              onChange={(e) => setNewRule(e.target.value)}
              placeholder="Add a rule, e.g. Never open with a question."
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              disabled={saving}
              aria-busy={saving}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
            >
              <Busy busy={saving} label="Saving…">
                Save profile
              </Busy>
            </button>
            {status && <span className="text-sm text-text-muted">{status}</span>}
          </div>
        </form>
      </Section>
    </div>
  );
}
