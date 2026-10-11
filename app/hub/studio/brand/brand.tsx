"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { compact, shortDate } from "../../_lib/ui";
import { PLATFORM_LABEL, PLATFORMS, summarise, type BrandData, type Handle } from "../../_lib/studio/brand-types";
import type { SheetSummary } from "../../_lib/studio/types";
import { Field, Section, input } from "../../projects/fields";
import { ActionButton, FilePicker, SheetList, call, useAction, type Upload } from "../../projects/[id]/studio/studio";

/* Personal brand: your accounts and the creators you track, their latest
   stats, and a weekly plan + shoot sheet made from what's working. */

type Tab = "week" | "setup" | "files";
const API = "/api/hub/studio/brand";

export function BrandStudio() {
  const [brand, setBrand] = useState<BrandData | null>(null);
  const [sheets, setSheets] = useState<SheetSummary[]>([]);
  const [flags, setFlags] = useState({ claude: true, apify: true });
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<Tab>("week");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");

  useEffect(() => {
    call<{ brand: BrandData; sheets: SheetSummary[]; claude: boolean; apify: boolean }>(API, "GET")
      .then((r) => {
        setBrand(r.brand);
        setSheets(r.sheets);
        setFlags({ claude: r.claude, apify: r.apify });
        if (!r.brand.accounts.length && !r.brand.tracked.length) setTab("setup");
      })
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  // Save edits a moment after typing stops.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<BrandData | null>(null);
  const flush = useCallback(async () => {
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    setSaveState("saving");
    try {
      const { about, accounts, tracked, winners, scriptBank, notes, autoPlan } = next;
      await call(API, "PUT", { about, accounts: accounts.filter((h) => h.handle.trim()), tracked: tracked.filter((h) => h.handle.trim()), winners, scriptBank, notes, autoPlan });
      setSaveState(pending.current ? "saving" : "saved");
    } catch {
      setSaveState("error");
    }
  }, []);
  const edit = useCallback(
    (next: BrandData) => {
      setBrand(next);
      pending.current = next;
      setSaveState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 800);
    },
    [flush],
  );
  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [flush]);

  if (loadError) return <p className="text-accent">{loadError}</p>;
  if (!brand) return <p className="text-text-muted">Opening…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/hub/studio" className="text-sm text-text-dim hover:text-text">
          ← Studio
        </Link>
        <span className={`text-xs ${saveState === "error" ? "font-medium text-accent" : "text-text-dim"}`}>
          {saveState === "saving" ? "Saving…" : saveState === "error" ? "Couldn't save - check your connection" : "Saved automatically"}
        </span>
      </div>
      <div>
        <p className="text-sm font-medium uppercase tracking-widest text-accent">Studio</p>
        <h1 className="font-serif text-4xl">Personal brand</h1>
        <p className="mt-1 text-text-muted">A plan every week from what&apos;s working for you and for the creators you track.</p>
      </div>

      {!flags.claude && (
        <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
          Claude isn&apos;t switched on yet: add <code>ANTHROPIC_API_KEY</code> in Vercel (Production) and redeploy.
        </p>
      )}

      <div className="flex flex-wrap gap-1" role="tablist">
        {(
          [
            ["week", "This week"],
            ["setup", "Accounts & creators"],
            ["files", "Files"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm transition ${tab === key ? "bg-accent text-on-accent" : "text-text-muted hover:bg-bg-elevated"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "week" && <WeekTab brand={brand} apify={flags.apify} sheets={sheets} setSheets={setSheets} onBrand={setBrand} edit={edit} goSetup={() => setTab("setup")} />}
      {tab === "setup" && <SetupTab brand={brand} edit={edit} />}
      {tab === "files" && (
        <div className="space-y-5">
          <Section title="Winners">
            <p className="text-sm text-text-muted">Your best posts and why they worked. Add to it as things take off.</p>
            <textarea rows={10} className={input} value={brand.winners} onChange={(e) => edit({ ...brand, winners: e.target.value })} />
          </Section>
          <Section title="Script bank">
            <p className="text-sm text-text-muted">Every hook and angle already planned, newest first. New plans never reuse these.</p>
            <textarea rows={14} className={input} value={brand.scriptBank} onChange={(e) => edit({ ...brand, scriptBank: e.target.value })} />
          </Section>
        </div>
      )}
    </div>
  );
}

/* ---- This week ---- */

function WeekTab({
  brand,
  apify,
  sheets,
  setSheets,
  onBrand,
  edit,
  goSetup,
}: {
  brand: BrandData;
  apify: boolean;
  sheets: SheetSummary[];
  setSheets: (s: SheetSummary[]) => void;
  onBrand: (b: BrandData) => void;
  edit: (b: BrandData) => void;
  goSetup: () => void;
}) {
  const [videos, setVideos] = useState(5);
  const [filmingOn, setFilmingOn] = useState("");
  const [notes, setNotes] = useState("");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [made, setMade] = useState<{ id: string; oneLine: string } | null>(null);
  const pull = useAction();
  const plan = useAction();
  const groups = brand.stats ? summarise(brand.stats.posts).sort((a, b) => Number(b.mine) - Number(a.mine)) : [];
  const empty = !brand.accounts.length && !brand.tracked.length;

  return (
    <div className="space-y-5">
      {empty && (
        <p className="rounded-xl bg-bg-elevated px-4 py-3 text-sm text-text-muted">
          Start by adding your accounts and the creators you want to learn from.{" "}
          <button type="button" onClick={goSetup} className="font-medium text-accent">
            Add accounts & creators →
          </button>
        </p>
      )}

      <Section
        title="Latest stats"
        action={brand.stats && <span className="text-xs text-text-dim">Pulled {shortDate(brand.stats.at)}</span>}
      >
        {apify ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await pull.run(async () => onBrand(await call<BrandData>(`${API}/stats`, "POST", {})));
            }}
          >
            <ActionButton busy={pull.busy} seconds={pull.seconds} label={brand.stats ? "Refresh stats" : "Pull stats"} busyLabel="Pulling the latest posts… usually under 2 minutes ·" />
            {pull.error && <p className="mt-2 text-sm text-accent">{pull.error}</p>}
          </form>
        ) : (
          <p className="text-sm text-text-muted">
            Automatic stats need <code>APIFY_TOKEN</code> in Vercel. Until then, paste your numbers or add screenshots below and they&apos;ll be used for the plan.
          </p>
        )}
        {brand.stats?.problems.map((p) => (
          <p key={p} className="text-sm text-warn">
            {p}
          </p>
        ))}
        {groups.map((g) => (
          <div key={g.key} className="space-y-2 rounded-xl border border-border p-3">
            <p className="text-sm">
              <span className="font-semibold">@{g.handle}</span> <span className="text-text-dim">{PLATFORM_LABEL[g.platform]}</span>
              {g.mine && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">You</span>}
              <span className="ml-2 text-xs text-text-dim">
                usually {compact(g.median)} views · {g.count} posts
              </span>
            </p>
            <ul className="space-y-1.5">
              {g.top.slice(0, 3).map((p) => (
                <li key={p.url} className="flex gap-3 text-sm">
                  <span className={`w-12 shrink-0 text-right font-semibold ${p.ratio >= 2 ? "text-good" : "text-text-muted"}`}>{p.ratio.toFixed(1)}x</span>
                  <a href={p.url} target="_blank" rel="noopener" className="min-w-0 flex-1 truncate hover:text-accent">
                    {p.caption || "(no caption)"}
                  </a>
                  <span className="shrink-0 text-xs text-text-dim">{compact(p.views)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Section>

      <Section title="This week's plan">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await plan.run(async () => {
              const r = await call<{ id: string; oneLine: string; brand: BrandData }>(`${API}/plan`, "POST", { videos, filmingOn, notes, uploads });
              onBrand(r.brand);
              setMade({ id: r.id, oneLine: r.oneLine });
              setSheets((await call<{ sheets: SheetSummary[] }>(API, "GET")).sheets);
            });
          }}
          className="space-y-4"
        >
          <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
            <Field label="Videos">
              <input type="number" min={1} max={21} className={input} value={videos} onChange={(e) => setVideos(Math.max(1, Math.min(21, Number(e.target.value) || 1)))} />
            </Field>
            <Field label="Filming">
              <input className={input} value={filmingOn} onChange={(e) => setFilmingOn(e.target.value)} placeholder="An hour a day, mornings" />
            </Field>
          </div>
          <Field label="Anything to steer this week?" hint="A launch, a trip, a theme, what flopped… Optional.">
            <textarea rows={2} className={input} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <FilePicker accept="image/png,image/jpeg,image/webp" label="Analytics screenshots (optional)" onChange={setUploads} />
          <ActionButton busy={plan.busy} seconds={plan.seconds} label="Plan my week" busyLabel="Planning your week… usually 1-3 minutes ·" />
          {plan.error && <p className="text-sm text-accent">{plan.error}</p>}
        </form>
        {made && (
          <div className="space-y-2 rounded-xl bg-good-soft px-4 py-3 text-sm text-good">
            <p>{made.oneLine}</p>
            <a href={`/hub/studio/sheets/${made.id}`} target="_blank" rel="noopener" className="inline-block font-semibold underline">
              Open the shoot sheet →
            </a>
          </div>
        )}
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border px-3 py-2.5">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" checked={brand.autoPlan} onChange={(e) => edit({ ...brand, autoPlan: e.target.checked })} />
          <span className="text-sm">
            <span className="font-medium">Plan my week automatically</span>
            <span className="block text-text-dim">Every Monday by 7am: fresh stats and a new plan (5 videos), ready in Shoot sheets.</span>
          </span>
        </label>
      </Section>

      {brand.lastPlan && (
        <Section title={`This week's thinking · ${shortDate(brand.lastPlan.at)}`}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-good">Working for you</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {brand.lastPlan.workingForYou.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-accent">Not working</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {brand.lastPlan.notWorking.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          </div>
          {brand.lastPlan.fromTracked.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold">Worth adapting from creators you track</h3>
              <ul className="mt-1 space-y-1.5 text-sm">
                {brand.lastPlan.fromTracked.map((t) => (
                  <li key={t.url + t.idea}>
                    <span className="font-medium">@{t.handle.replace(/^@/, "")}:</span> {t.idea}{" "}
                    {/^https?:\/\//.test(t.url) && (
                      <a href={t.url} target="_blank" rel="noopener" className="text-accent hover:underline">
                        watch
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h3 className="text-sm font-semibold">The plan</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm text-text-muted">{brand.lastPlan.plan}</p>
          </div>
        </Section>
      )}

      <SheetList sheets={sheets} setSheets={setSheets} />
    </div>
  );
}

/* ---- Accounts & creators ---- */

function HandleList({ title, hint, list, onChange, withNote }: { title: string; hint: string; list: Handle[]; onChange: (l: Handle[]) => void; withNote?: boolean }) {
  return (
    <Section title={title}>
      <p className="text-sm text-text-muted">{hint}</p>
      <ul className="space-y-2">
        {list.map((h, i) => (
          <li key={i} className="flex flex-wrap gap-2">
            <select
              aria-label="Platform"
              className={`${input} w-32`}
              value={h.platform}
              onChange={(e) => onChange(list.map((x, j) => (j === i ? { ...x, platform: e.target.value as Handle["platform"] } : x)))}
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABEL[p]}
                </option>
              ))}
            </select>
            <input
              aria-label="Handle"
              className={`${input} min-w-0 flex-1`}
              value={h.handle}
              placeholder="@handle or profile link"
              onChange={(e) => onChange(list.map((x, j) => (j === i ? { ...x, handle: e.target.value } : x)))}
            />
            {withNote && (
              <input
                aria-label="Why you track them"
                className={`${input} min-w-0 basis-full sm:basis-auto sm:flex-1`}
                value={h.note}
                placeholder="Why: hooks, editing, same niche…"
                onChange={(e) => onChange(list.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))}
              />
            )}
            <button type="button" onClick={() => onChange(list.filter((_, j) => j !== i))} className="px-2 text-sm text-text-dim hover:text-accent" aria-label="Remove">
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onChange([...list, { platform: "tiktok", handle: "", note: "" }])}
        className="rounded-lg border border-border px-3 py-1.5 text-sm hover:border-accent hover:text-accent"
      >
        + Add
      </button>
    </Section>
  );
}

function SetupTab({ brand, edit }: { brand: BrandData; edit: (b: BrandData) => void }) {
  return (
    <div className="space-y-5">
      <Section title="About your brand">
        <p className="text-sm text-text-muted">Who you are, your niche and content pillars, who you&apos;re talking to, your goals and your voice. Every plan starts from this.</p>
        <textarea
          rows={8}
          className={input}
          value={brand.about}
          onChange={(e) => edit({ ...brand, about: e.target.value })}
          placeholder="UK UGC creator and ex performance marketer. Pillars: behind the scenes of UGC, how to land brand deals, paid social tips. Talking to people who want to start UGC. Goal: grow the Skool community. Voice: casual, direct, a bit dry."
        />
      </Section>
      <HandleList title="Your accounts" hint="Your personal brand accounts. Public accounts only." list={brand.accounts} onChange={(accounts) => edit({ ...brand, accounts })} />
      <HandleList
        title="Creators you track"
        hint="Creators doing well that you want to learn from. Their posts that beat their own average get turned into ideas for you."
        list={brand.tracked}
        onChange={(tracked) => edit({ ...brand, tracked })}
        withNote
      />
      <Section title="Standing notes">
        <p className="text-sm text-text-muted">Anything every plan should know (posting days, things to avoid, a series you&apos;re running).</p>
        <textarea rows={3} className={input} value={brand.notes} onChange={(e) => edit({ ...brand, notes: e.target.value })} />
      </Section>
    </div>
  );
}
