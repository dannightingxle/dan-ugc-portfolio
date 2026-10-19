"use client";

import { useState } from "react";
import { shortDate } from "../../_lib/ui";
import { EFFORT_LABEL, IDEA_EFFORTS, ideaCopy, type BrandData, type Idea, type IdeaEffort, type IdeaStatus } from "../../_lib/studio/brand-types";
import { Section } from "../../projects/fields";
import { ActionButton, call, useAction } from "../../projects/[id]/studio/studio";

/* The ideas inbox: ideas found in the posts beating their usual views from
   the creators you track and your idea accounts, plus the sounds going round.
   Save them, pick them for this week, or say they're not for you (which the
   next look takes into account). */

const API = "/api/hub/studio/brand";
// Stats newer than this are reused for a look at ideas, rather than paying Apify again.
const FRESH_MS = 12 * 3_600_000;

const VIEWS: [IdeaStatus, string][] = [
  ["new", "New"],
  ["saved", "Saved"],
  ["week", "This week"],
  ["planned", "Planned"],
  ["dismissed", "Not for me"],
];
const REASONS = ["Not my niche", "Too much work", "Done it already", "Don't like the format"];

export function IdeasTab({
  brand,
  apify,
  onBrand,
  edit,
  goSetup,
  goEdits,
}: {
  brand: BrandData;
  apify: boolean;
  onBrand: (b: Partial<BrandData>) => void;
  edit: (b: BrandData) => void;
  goSetup: () => void;
  /** Set when edits on the Mac are switched on for you. */
  goEdits?: () => void;
}) {
  const [view, setView] = useState<IdeaStatus>("new");
  const [effort, setEffort] = useState<IdeaEffort | "all">("all");
  const [phase, setPhase] = useState<"stats" | "ideas">("ideas");
  const scan = useAction();
  const count = (s: IdeaStatus) => brand.ideas.filter((i) => i.status === s).length;
  const shown = brand.ideas.filter((i) => i.status === view && (effort === "all" || i.effort === effort));
  const empty = !brand.tracked.length && !brand.ideaAccounts.length;

  async function setStatus(id: string, status: IdeaStatus, reason = "") {
    // Moves at once; the server's copy replaces it when it answers.
    onBrand({ ideas: brand.ideas.map((i) => (i.id === id ? { ...i, status, reason } : i)) });
    try {
      onBrand({ ideas: (await call<BrandData>(`${API}/ideas`, "PATCH", { id, status, reason })).ideas });
    } catch {
      onBrand({ ideas: brand.ideas });
    }
  }

  return (
    <div className="space-y-5">
      {empty && (
        <p className="rounded-xl bg-bg-elevated px-4 py-3 text-sm text-text-muted">
          Ideas come from the creators you track and accounts that share content ideas.{" "}
          <button type="button" onClick={goSetup} className="font-medium text-accent">
            Add some →
          </button>
        </p>
      )}

      <Section title="Find ideas" action={brand.lastScan && <span className="text-xs text-text-dim">Last looked {shortDate(brand.lastScan.at)}</span>}>
        <p className="text-sm text-text-muted">
          Looks at the posts beating their usual views from the creators you track, the latest from your idea accounts and the sounds they&apos;re using. Claude watches the best
          few and turns them into ideas for you, with the no-filming ones (a sound, clips you already have and text on screen) marked.
        </p>
        {apify ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await scan.run(async () => {
                if (!brand.stats || Date.now() - Date.parse(brand.stats.at) > FRESH_MS) {
                  setPhase("stats");
                  onBrand({ stats: (await call<BrandData>(`${API}/stats`, "POST", {})).stats });
                }
                setPhase("ideas");
                const r = await call<BrandData>(`${API}/ideas`, "POST", {});
                onBrand({ stats: r.stats, ideas: r.ideas, seen: r.seen, lastScan: r.lastScan });
                setView("new");
              });
            }}
          >
            <ActionButton
              busy={scan.busy}
              seconds={scan.seconds}
              label="Find new ideas"
              busyLabel={phase === "stats" ? "Pulling the latest posts… usually under 2 minutes ·" : "Watching the best ones and writing ideas… usually 2-4 minutes ·"}
            />
            {scan.error && <p className="mt-2 text-sm text-accent">{scan.error}</p>}
          </form>
        ) : (
          <p className="text-sm text-text-muted">
            Finding ideas needs <code>APIFY_TOKEN</code> in Vercel, to read the creators&apos; posts.
          </p>
        )}
        {brand.lastScan && <p className="text-sm">{brand.lastScan.oneLine}</p>}
        {brand.lastScan?.problems.map((p) => (
          <p key={p} className="text-xs text-text-dim">
            {p}
          </p>
        ))}
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border px-3 py-2.5">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" checked={brand.autoIdeas} onChange={(e) => edit({ ...brand, autoIdeas: e.target.checked })} />
          <span className="text-sm">
            <span className="font-medium">Find ideas twice a week</span>
            <span className="block text-text-dim">
              Monday and Thursday mornings before 7am, with fresh stats. On Mondays it runs before your weekly plan, so the plan can use them.
            </span>
          </span>
        </label>
      </Section>

      {(brand.lastScan?.sounds.length ?? 0) > 0 && (
        <Section title="Sounds worth using">
          <ul className="space-y-2 text-sm">
            {brand.lastScan!.sounds.map((s) => (
              <li key={s.url + s.name}>
                {/^https?:\/\//.test(s.url) ? (
                  <a href={s.url} target="_blank" rel="noopener" className="font-medium hover:text-accent">
                    {s.name} ↗
                  </a>
                ) : (
                  <span className="font-medium">{s.name}</span>
                )}
                <span className="block text-text-muted">{s.why}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Ideas">
        <div className="flex flex-wrap gap-1">
          {VIEWS.map(([key, label]) => (
            <Chip key={key} on={view === key} onClick={() => setView(key)}>
              {label} {count(key) > 0 && <span className="opacity-70">{count(key)}</span>}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {(["all", ...IDEA_EFFORTS] as const).map((e) => (
            <Chip key={e} small on={effort === e} onClick={() => setEffort(e)}>
              {e === "all" ? "Any effort" : EFFORT_LABEL[e]}
            </Chip>
          ))}
        </div>
        {shown.length === 0 ? (
          <p className="text-sm text-text-dim">
            {view === "new"
              ? "No new ideas. Find new ideas above, or wait for the next look."
              : view === "week"
                ? "Nothing picked for this week yet. Ideas you pick here go into your next weekly plan."
                : "Nothing here."}
          </p>
        ) : (
          <ul className="space-y-3">
            {shown.map((i) => (
              <IdeaCard
                key={i.id}
                idea={i}
                setStatus={setStatus}
                onMake={
                  goEdits &&
                  (async () => {
                    const r = await call<{ brand: BrandData; sent: boolean }>(`${API}/ideas/make`, "POST", { id: i.id });
                    onBrand({ ideas: r.brand.ideas });
                    return r.sent;
                  })
                }
                goEdits={goEdits}
              />
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Chip({ on, small, onClick, children }: { on: boolean; small?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`shrink-0 rounded-full ${small ? "px-3 py-1 text-xs" : "px-3.5 py-1.5 text-sm"} transition ${on ? "bg-accent text-on-accent" : "border border-border text-text-muted hover:border-accent hover:text-accent"}`}
    >
      {children}
    </button>
  );
}

function IdeaCard({
  idea: i,
  setStatus,
  onMake,
  goEdits,
}: {
  idea: Idea;
  setStatus: (id: string, s: IdeaStatus, reason?: string) => void;
  onMake?: () => Promise<boolean>;
  goEdits?: () => void;
}) {
  const [why, setWhy] = useState(false);
  const [copied, setCopied] = useState(false);
  const make = useAction();
  const [made, setMade] = useState<"sent" | "card" | null>(null);
  const button = "rounded-lg border border-border px-3 py-1.5 text-sm hover:border-accent hover:text-accent";

  return (
    <li className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full px-2 py-0.5 font-medium ${i.effort === "no_filming" ? "bg-good-soft text-good" : "bg-bg-elevated text-text-muted"}`}>
          {EFFORT_LABEL[i.effort]}
        </span>
        {i.pillar && <span className="text-text-dim">{i.pillar}</span>}
        <span className="text-text-dim">· {shortDate(i.foundAt)}</span>
        {/^https?:\/\//.test(i.sourceUrl) && (
          <a href={i.sourceUrl} target="_blank" rel="noopener" className="ml-auto text-accent hover:underline">
            @{i.handle}&apos;s original ↗
          </a>
        )}
      </div>
      <h3 className="font-semibold">{i.title}</h3>
      <p className="text-sm">{i.yourVersion}</p>
      <p className="text-xs text-good">{i.why}</p>

      <details className="rounded-lg bg-bg-elevated px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium">How to make it</summary>
        <div className="mt-2 space-y-2">
          <p>
            <span className="font-medium">Hook:</span> {i.hook}
          </p>
          {i.onScreenText.length > 0 && (
            <div>
              <p className="font-medium">On screen</p>
              <ol className="list-decimal space-y-0.5 pl-5">
                {i.onScreenText.map((t, n) => (
                  <li key={n}>{t}</li>
                ))}
              </ol>
            </div>
          )}
          {i.sound.name && (
            <p>
              <span className="font-medium">Sound:</span>{" "}
              {/^https?:\/\//.test(i.sound.url) ? (
                <a href={i.sound.url} target="_blank" rel="noopener" className="text-accent hover:underline">
                  {i.sound.name} ↗
                </a>
              ) : (
                i.sound.name
              )}
              {i.sound.note && <span className="text-text-muted"> - {i.sound.note}</span>}
            </p>
          )}
          {i.shots.length > 0 && (
            <div>
              <p className="font-medium">Shots</p>
              <ol className="list-decimal space-y-0.5 pl-5">
                {i.shots.map((s, n) => (
                  <li key={n}>{s}</li>
                ))}
              </ol>
            </div>
          )}
          {i.photosSearch.length > 0 && (
            <p>
              <span className="font-medium">Search Photos for:</span> {i.photosSearch.join(", ")}
            </p>
          )}
          <p>
            <span className="font-medium">Caption:</span> {i.caption}
          </p>
          <button
            type="button"
            className={button}
            onClick={async () => {
              await navigator.clipboard.writeText(ideaCopy(i)).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied" : "Copy everything"}
          </button>
        </div>
      </details>

      {why ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-text-muted">Why not?</span>
          {REASONS.map((r) => (
            <button key={r} type="button" className={button} onClick={() => setStatus(i.id, "dismissed", r)}>
              {r}
            </button>
          ))}
          <button type="button" className={button} onClick={() => setStatus(i.id, "dismissed")}>
            Just not
          </button>
          <button type="button" className="px-2 text-sm text-text-dim hover:text-accent" onClick={() => setWhy(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {i.status === "new" && (
            <button type="button" className={button} onClick={() => setStatus(i.id, "saved")}>
              Save
            </button>
          )}
          {(i.status === "new" || i.status === "saved") && (
            <button type="button" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-on-accent hover:bg-accent-hover" onClick={() => setStatus(i.id, "week")}>
              Make it this week
            </button>
          )}
          {i.status === "week" && (
            <button type="button" className={button} onClick={() => setStatus(i.id, "saved")}>
              Not this week
            </button>
          )}
          {onMake && !i.editId && i.status !== "dismissed" && (
            <button
              type="button"
              disabled={make.busy}
              className={button}
              onClick={() => make.run(async () => setMade((await onMake()) ? "sent" : "card"))}
              title={
                i.photosSearch.length
                  ? "Your Mac finds the clips in Apple Photos and your drives, and Claude makes the CapCut draft"
                  : "Makes an edit card: add your clips once you've filmed it"
              }
            >
              {make.busy ? "Making…" : i.photosSearch.length ? "Make it on my Mac" : "Make an edit card"}
            </button>
          )}
          {i.status === "planned" && !i.editId && <span className="text-sm text-text-dim">In a shoot sheet</span>}
          {i.editId && goEdits && (
            <button type="button" className="px-2 text-sm text-accent hover:underline" onClick={goEdits}>
              {made === "sent" ? "Sent to your Mac - see Edits →" : made === "card" ? "Edit card made - add your clips in Edits →" : "In Edits →"}
            </button>
          )}
          {i.status === "dismissed" ? (
            <button type="button" className={button} onClick={() => setStatus(i.id, "saved")}>
              Actually, save it
            </button>
          ) : (
            i.status !== "planned" && (
              <button type="button" className="px-2 text-sm text-text-dim hover:text-accent" onClick={() => setWhy(true)}>
                Not for me
              </button>
            )
          )}
        </div>
      )}
      {i.status === "dismissed" && i.reason && <p className="text-xs text-text-dim">{i.reason}</p>}
      {make.error && <p className="text-sm text-accent">{make.error}</p>}
    </li>
  );
}
