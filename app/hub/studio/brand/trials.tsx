"use client";

import { useState } from "react";
import { compact, shortDate } from "../../_lib/ui";
import type { BrandData, Trial } from "../../_lib/studio/brand-types";
import { Field, Section, input } from "../../projects/fields";
import { ActionButton, CopyButton, call, useAction } from "../../projects/[id]/studio/studio";
import { useConfirm } from "../../_lib/popups";

/* Trial reels: five versions of one reel, each opening differently, made into
   CapCut drafts on your Mac and posted as Instagram trial reels (they go to
   non-followers first). Put in each one's views and the winner goes into your
   winners file, so the next plans and ideas learn from it. */

const API = "/api/hub/studio/brand/trials";

export function TrialsTab({ brand, onBrand, goEdits, goWeek }: { brand: BrandData; onBrand: (b: Partial<BrandData>) => void; goEdits?: () => void; goWeek: () => void }) {
  const mine = (brand.stats?.posts ?? []).filter((p) => p.mine).sort((a, b) => Date.parse(b.postedAt || "0") - Date.parse(a.postedAt || "0"));
  const [kind, setKind] = useState<"post" | "paste">(mine.length ? "post" : "paste");
  const [url, setUrl] = useState(mine[0]?.url ?? "");
  const [text, setText] = useState("");
  const [made, setMade] = useState<{ title: string; sent: boolean } | null>(null);
  const write = useAction();

  return (
    <div className="space-y-5">
      <Section title="Make 5 trial versions">
        <p className="text-sm text-text-muted">
          Same reel, five different openings. Post each as an Instagram trial reel (it goes to people who don&apos;t follow you first), see which one wins, then share that one to
          your followers. {goEdits ? "Finished an edit in Edits? It has its own button for this, and the Mac starts from that CapCut draft." : ""}
        </p>
        <div className="flex flex-wrap gap-1">
          {(
            [
              ["post", "One of your posts"],
              ["paste", "Paste the script or video card"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`rounded-full px-3.5 py-1.5 text-sm transition ${kind === k ? "bg-accent text-on-accent" : "border border-border text-text-muted hover:border-accent hover:text-accent"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await write.run(async () => {
              const r = await call<{ brand: BrandData; trial: Trial; sent: boolean }>(API, "POST", kind === "post" ? { kind, url } : { kind, text });
              onBrand({ trials: r.brand.trials });
              setMade({ title: r.trial.title, sent: r.sent });
              setText("");
            });
          }}
          className="space-y-3"
        >
          {kind === "post" ? (
            mine.length ? (
              <Field label="Which reel?" hint="Claude watches it before writing the versions.">
                <select className={input} value={url} onChange={(e) => setUrl(e.target.value)}>
                  {mine.map((p) => (
                    <option key={p.url} value={p.url}>
                      {shortDate(p.postedAt)} · {compact(p.views)} views · {(p.caption || "(no caption)").replace(/\s+/g, " ").slice(0, 70)}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <p className="text-sm text-text-muted">
                Your posts show up here once your stats are pulled.{" "}
                <button type="button" onClick={goWeek} className="font-medium text-accent">
                  Pull them on This week →
                </button>
              </p>
            )
          ) : (
            <Field label="The reel" hint="Its script, or the video card from a shoot sheet (Copy everything).">
              <textarea rows={6} className={input} value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
          )}
          <ActionButton busy={write.busy} seconds={write.seconds} label="Write 5 versions" busyLabel="Writing 5 versions… usually 1-2 minutes ·" />
          {write.error && <p className="text-sm text-accent">{write.error}</p>}
        </form>
        {made && (
          <p className="rounded-xl bg-good-soft px-4 py-3 text-sm text-good">
            5 versions of &ldquo;{made.title}&rdquo; are below.{made.sent ? " Your Mac is making the drafts." : ""}
          </p>
        )}
        <details className="text-sm text-text-muted">
          <summary className="cursor-pointer font-medium text-text">How to post them</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Post each version as a new reel and turn on Trial on the screen where you share it. You need a public professional account to see the option.</li>
            <li>Post them a few hours apart (or one a day) so they don&apos;t compete with each other.</li>
            <li>After 1-3 days, put each one&apos;s views in below. Share the winner to your followers from the reel itself.</li>
          </ul>
        </details>
      </Section>

      {brand.trials.length === 0 ? (
        <p className="text-sm text-text-dim">No trial reels yet.</p>
      ) : (
        brand.trials.map((t) => <TrialCard key={t.id} trial={t} onBrand={onBrand} goEdits={goEdits} />)
      )}
    </div>
  );
}

function TrialCard({ trial: t, onBrand, goEdits }: { trial: Trial; onBrand: (b: Partial<BrandData>) => void; goEdits?: () => void }) {
  const [views, setViews] = useState<(number | null)[]>(t.versions.map((v) => v.views));
  const [winner, setWinner] = useState<string | null>(t.winner);
  const save = useAction();
  const mac = useAction();
  const [macNote, setMacNote] = useState("");
  const confirm = useConfirm();
  const best = () => {
    const known = t.versions.map((v, i) => ({ code: v.code, n: views[i] })).filter((x): x is { code: string; n: number } => x.n != null);
    return known.length ? known.sort((a, b) => b.n - a.n)[0].code : null;
  };
  const changed = views.some((v, i) => v !== t.versions[i].views) || winner !== t.winner;

  return (
    <Section title={t.title} action={<span className="text-xs text-text-dim">{shortDate(t.createdAt)}</span>}>
      <p className="text-sm text-text-muted">
        Testing {t.test.replace(/^[A-Z]/, (c) => c.toLowerCase())}
        {t.source.url ? (
          <>
            {" "}
            ·{" "}
            <a href={t.source.url} target="_blank" rel="noopener" className="text-accent hover:underline">
              the original ↗
            </a>
          </>
        ) : t.source.label ? (
          <span className="text-text-dim"> · {t.source.label}</span>
        ) : null}
      </p>
      {t.learned && <p className="rounded-xl bg-good-soft px-3 py-2 text-sm text-good">{t.learned} - added to your winners file.</p>}

      <ul className="space-y-2">
        {t.versions.map((v, i) => (
          <li key={v.code} className={`space-y-1.5 rounded-xl border p-3 ${winner === v.code ? "border-good" : "border-border"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-bg-elevated px-1.5 py-0.5 font-mono text-xs">{v.code}</span>
              <span className="text-sm font-semibold">{v.change}</span>
              <label className="ml-auto flex items-center gap-2 text-xs text-text-muted">
                Views
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  className="w-24 rounded-lg border border-border bg-bg px-2 py-1 text-sm outline-none transition focus:border-accent"
                  value={views[i] ?? ""}
                  onChange={(e) => setViews(views.map((x, j) => (j === i ? (e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value)))) : x)))}
                />
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                <input type="radio" name={`winner-${t.id}`} className="accent-[var(--good)]" checked={winner === v.code} onChange={() => setWinner(v.code)} />
                Winner
              </label>
            </div>
            <p className="text-sm">&ldquo;{v.hook}&rdquo;</p>
            <details className="text-sm text-text-muted">
              <summary className="cursor-pointer text-xs">Opening, text and caption</summary>
              <div className="mt-1.5 space-y-1">
                <p>
                  <span className="font-medium text-text">Opening:</span> {v.opening}
                </p>
                {v.onScreenText.length > 0 && (
                  <p>
                    <span className="font-medium text-text">On screen:</span> {v.onScreenText.join(" / ")}
                  </p>
                )}
                {!/^same as the original/i.test(v.sound.trim()) && (
                  <p>
                    <span className="font-medium text-text">Sound:</span> {v.sound}
                  </p>
                )}
                <p>
                  <span className="font-medium text-text">Caption:</span> {v.caption}
                </p>
                <CopyButton text={v.caption} label="Copy caption" />
              </div>
            </details>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={save.busy || !changed}
          onClick={() =>
            save.run(async () => {
              const w = winner ?? best();
              const b = await call<BrandData>(API, "PATCH", { id: t.id, views, winner: w });
              setWinner(w);
              onBrand({ trials: b.trials, winners: b.winners });
            })
          }
          className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50"
        >
          {save.busy ? "Saving…" : winner || views.some((v) => v != null) ? "Save results" : "Save"}
        </button>
        {goEdits &&
          (t.editId ? (
            <button type="button" onClick={goEdits} className="px-2 text-sm text-accent hover:underline">
              {macNote || "Drafts in Edits →"}
            </button>
          ) : (
            <button
              type="button"
              disabled={mac.busy}
              onClick={() =>
                mac.run(async () => {
                  const r = await call<{ brand: BrandData }>(`${API}/mac`, "POST", { id: t.id });
                  onBrand({ trials: r.brand.trials });
                  setMacNote(t.source.draft ? "Sent to your Mac - see Edits →" : "Pick the finished video in Edits →");
                })
              }
              className="rounded-xl border border-border px-4 py-2 text-sm hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {mac.busy ? "Making…" : "Make the drafts on my Mac"}
            </button>
          ))}
        <button
          type="button"
          onClick={async () => {
            if (!(await confirm({ title: "Delete these trial versions?", message: "Any drafts on your Mac stay there.", confirmLabel: "Delete", danger: true }))) return;
            const b = await call<BrandData>(API, "DELETE", { id: t.id }).catch(() => null);
            if (b) onBrand({ trials: b.trials });
          }}
          className="ml-auto text-sm text-text-dim hover:text-accent"
        >
          Delete
        </button>
      </div>
      {(save.error || mac.error) && <p className="text-sm text-accent">{save.error || mac.error}</p>}
      {!winner && views.every((v) => v != null) && <p className="text-xs text-text-dim">No winner picked: saving picks the one with the most views.</p>}
    </Section>
  );
}
