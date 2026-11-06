"use client";

import { useState } from "react";
import { type ScriptPack, type ScriptVersion, packText, scriptText } from "../_lib/scripts/types";
import { spokenWords } from "../_lib/scripts/checks";

/* A script pack as the creator reads it on set: hooks, the script by section
   (visual above the lines, timings shown), the shot list by location and the
   edit map. [Placeholders] stand out; assumptions and flags sit under the
   script. */

/** Text with its [placeholders] highlighted. */
export function Marked({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\])/);
  return (
    <>
      {parts.map((p, i) =>
        /^\[[^\]]+\]$/.test(p) ? (
          <mark key={i} className="rounded bg-warn/20 px-0.5 font-medium text-text">
            {p}
          </mark>
        ) : (
          p
        ),
      )}
    </>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => {});
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent"
    >
      {done ? "Copied" : label}
    </button>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-widest text-text-dim">{children}</h3>;
}

export function PackView({ pack, version, title, seconds }: { pack: ScriptPack; version: ScriptVersion; title: string; seconds: number }) {
  const words = spokenWords(pack);
  const notes: [string, string[]][] = [
    ["Placeholders to fill in", pack.placeholders],
    ["Assumptions", pack.assumptions],
    ["Flags", pack.flags],
  ];
  return (
    <div className="space-y-5" aria-label="Script pack">
      <div className="flex flex-wrap gap-2">
        <CopyButton text={packText(pack, title)} label="Copy the whole pack" />
        <CopyButton text={scriptText(pack)} label="Copy the script only" />
      </div>

      {version.failed.length > 0 && (
        <div role="note" className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-xs">
          <p className="font-semibold">
            This one didn&apos;t pass every check
            {version.retried ? ", even after a second go" : ""}:
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {version.failed.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="space-y-2" aria-label="Hooks">
        <Heading>3 hooks</Heading>
        <ol className="space-y-2">
          {pack.hooks.map((h, i) => (
            <li key={i} className="rounded-xl border border-border bg-bg p-3">
              <p className="text-xs text-text-dim">
                Hook {i + 1} · {h.visual}
              </p>
              <p className="mt-1 font-medium">
                <Marked text={h.text} />
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-2" aria-label="Script">
        <Heading>
          Script · {seconds}s · {words} words
        </Heading>
        <div className="space-y-3">
          {pack.sections.map((s, i) => (
            <div key={i} className="rounded-xl border border-border bg-bg p-3">
              <p className="text-xs text-text-dim">
                <span className="font-semibold text-accent">{s.label}</span> · {s.start_s}-{s.end_s}s · {s.visual}
              </p>
              <div className="mt-1.5 space-y-1">
                {s.lines.map((l, j) => (
                  <p key={j}>
                    <Marked text={l} />
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
        {notes.some(([, items]) => items.length) && (
          <div className="space-y-2 rounded-xl bg-text/5 p-3 text-xs" aria-label="Assumptions and flags">
            {notes
              .filter(([, items]) => items.length)
              .map(([label, items]) => (
                <div key={label}>
                  <p className="font-semibold text-text-muted">{label}</p>
                  <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-text-muted">
                    {items.map((t) => (
                      <li key={t}>
                        <Marked text={t} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        )}
      </section>

      <section className="space-y-2" aria-label="Shot list">
        <Heading>Shot list</Heading>
        <div className="space-y-2">
          {pack.shot_list.map((l) => (
            <div key={l.code} className="rounded-xl border border-border bg-bg p-3">
              <p className="font-medium">
                {l.code} · {l.location}
              </p>
              <ul className="mt-1 space-y-1 text-sm">
                {l.shots.map((s) => (
                  <li key={s.code} className="flex gap-2">
                    <span className="w-7 shrink-0 font-semibold text-accent">{s.code}</span>
                    <span className="min-w-0">{s.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2" aria-label="Edit map">
        <Heading>Edit map</Heading>
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs text-text-dim">
              <th className="w-12 pb-1 font-medium">Shot</th>
              <th className="pb-1 font-medium">Line</th>
              <th className="w-[38%] pb-1 pl-2 font-medium">On screen</th>
            </tr>
          </thead>
          <tbody>
            {pack.edit_map.map((r, i) => (
              <tr key={i} className="border-t border-border align-top">
                <td className="py-1.5 font-semibold text-accent">{r.shot}</td>
                <td className="break-words py-1.5">
                  <Marked text={r.line} />
                </td>
                <td className="break-words py-1.5 pl-2 text-text-muted">
                  {r.on_screen_text ? <Marked text={r.on_screen_text} /> : <span className="text-text-dim">None</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {pack.alt_angles.length > 0 && (
        <section className="space-y-1" aria-label="Other angles">
          <Heading>Other angles</Heading>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-text-muted">
            {pack.alt_angles.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
