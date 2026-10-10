"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useProjects } from "../../../_lib/store";
import { shortDate } from "../../../_lib/ui";
import { ACCOUNT_CHECKS, FILES, type SheetSummary, type Workspace } from "../../../_lib/studio/types";
import { Field, Section, input } from "../../fields";

/* Studio: everything a Claude Project held for this job, plus the weekly
   shoot sheet, the Friday review and the account checklist. Edits save by
   themselves; the Claude actions take a minute or two. */

type Upload = { name: string; type: string; data: string };
type Tab = "week" | "setup" | "files" | "review" | "account";
const TABS: [Tab, string][] = [
  ["week", "This week"],
  ["setup", "Set up"],
  ["files", "Files"],
  ["review", "Friday review"],
  ["account", "Account"],
];

async function readUploads(files: FileList | null): Promise<Upload[]> {
  return Promise.all(
    [...(files ?? [])].map(
      (f) =>
        new Promise<Upload>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve({ name: f.name, type: f.type, data: String(r.result).split(",")[1] ?? "" });
          r.onerror = () => reject(r.error);
          r.readAsDataURL(f);
        }),
    ),
  );
}

async function call<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Something went wrong (${res.status}).`);
  return json as T;
}

export function Studio({ projectId }: { projectId: string }) {
  const { projects } = useProjects();
  const project = projects.find((p) => p.id === projectId);
  const api = `/api/hub/studio/${projectId}`;

  const [ws, setWs] = useState<Workspace | null>(null);
  const [sheets, setSheets] = useState<SheetSummary[]>([]);
  const [claude, setClaude] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<Tab>("week");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");

  useEffect(() => {
    call<{ workspace: Workspace; sheets: SheetSummary[]; claude: boolean }>(api, "GET")
      .then((r) => {
        setWs(r.workspace);
        setSheets(r.sheets);
        setClaude(r.claude);
        if (!r.workspace.instructions) setTab("setup");
      })
      .catch((e: Error) => setLoadError(e.message));
  }, [api]);

  // Save edits a moment after typing stops.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Workspace | null>(null);
  const flush = useCallback(async () => {
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    setSaveState("saving");
    try {
      await call(api, "PUT", next);
      setSaveState(pending.current ? "saving" : "saved");
    } catch {
      setSaveState("error");
    }
  }, [api]);
  const edit = useCallback(
    (next: Workspace) => {
      setWs(next);
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
  if (!ws) return <p className="text-text-muted">Opening Studio…</p>;

  const name = project?.brand || "This job";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/hub/projects/${projectId}`} className="text-sm text-text-dim hover:text-text">
          ← {name}
        </Link>
        <span className={`text-xs ${saveState === "error" ? "font-medium text-accent" : "text-text-dim"}`}>
          {saveState === "saving" ? "Saving…" : saveState === "error" ? "Couldn't save - check your connection" : "Saved automatically"}
        </span>
      </div>
      <div>
        <p className="text-sm font-medium uppercase tracking-widest text-accent">{name}</p>
        <h1 className="font-serif text-4xl">Studio</h1>
        {project?.title && <p className="mt-1 text-text-muted">{project.title}</p>}
      </div>

      {!claude && (
        <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
          Claude isn&apos;t switched on yet: add <code>ANTHROPIC_API_KEY</code> in Vercel (Production) and redeploy. You can still edit everything here.
        </p>
      )}

      <div className="flex flex-wrap gap-1" role="tablist">
        {TABS.map(([key, label]) => (
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

      {tab === "week" && <WeekTab api={api} ws={ws} sheets={sheets} setSheets={setSheets} onWorkspace={setWs} goSetup={() => setTab("setup")} />}
      {tab === "setup" && <SetupTab api={api} ws={ws} edit={edit} onWorkspace={setWs} />}
      {tab === "files" && <FilesTab ws={ws} edit={edit} />}
      {tab === "review" && <ReviewTab api={api} ws={ws} onWorkspace={setWs} />}
      {tab === "account" && <AccountTab ws={ws} edit={edit} />}
    </div>
  );
}

/* ---- Running a Claude action: a button that shows how long it's been going ---- */

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setSeconds(0);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, seconds, run };
}

function ActionButton({ busy, seconds, label, busyLabel }: { busy: boolean; seconds: number; label: string; busyLabel: string }) {
  return (
    <button disabled={busy} className="w-full rounded-xl bg-accent py-3 font-semibold text-on-accent transition hover:bg-accent-hover disabled:opacity-70 sm:w-auto sm:px-6">
      {busy ? `${busyLabel} ${seconds}s` : label}
    </button>
  );
}

function FilePicker({ accept, label, onChange }: { accept: string; label: string; onChange: (u: Upload[]) => void }) {
  const [names, setNames] = useState<string[]>([]);
  return (
    <Field label={label} hint={names.length ? names.join(", ") : "Up to 3 MB in total."}>
      <input
        type="file"
        multiple
        accept={accept}
        className="block w-full text-sm text-text-muted file:mr-3 file:rounded-lg file:border file:border-border file:bg-bg-card file:px-3 file:py-1.5 file:text-sm"
        onChange={async (e) => {
          const files = e.target.files;
          setNames([...(files ?? [])].map((f) => f.name));
          onChange(await readUploads(files));
        }}
      />
    </Field>
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => {});
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="rounded-lg border border-border px-3 py-1 text-xs font-medium hover:border-accent hover:text-accent"
    >
      {done ? "Copied" : label}
    </button>
  );
}

/* ---- This week ---- */

function WeekTab({
  api,
  ws,
  sheets,
  setSheets,
  onWorkspace,
  goSetup,
}: {
  api: string;
  ws: Workspace;
  sheets: SheetSummary[];
  setSheets: (s: SheetSummary[]) => void;
  onWorkspace: (w: Workspace) => void;
  goSetup: () => void;
}) {
  const [videos, setVideos] = useState(7);
  const [filmingOn, setFilmingOn] = useState("Monday, Wednesday and Thursday afternoons");
  const [lastWeek, setLastWeek] = useState("");
  const [trending, setTrending] = useState("");
  const [newBrief, setNewBrief] = useState("");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [made, setMade] = useState<{ id: string; oneLine: string } | null>(null);
  const action = useAction();

  async function make(e: React.FormEvent) {
    e.preventDefault();
    await action.run(async () => {
      const r = await call<{ id: string; oneLine: string; workspace: Workspace }>(`${api}/week`, "POST", { videos, filmingOn, lastWeek, trending, newBrief, uploads });
      onWorkspace(r.workspace);
      setMade({ id: r.id, oneLine: r.oneLine });
      setSheets((await call<{ sheets: SheetSummary[] }>(api, "GET")).sheets);
      setNewBrief("");
    });
  }

  return (
    <div className="space-y-5">
      {!ws.instructions && (
        <p className="rounded-xl bg-bg-elevated px-4 py-3 text-sm text-text-muted">
          Set the job up first so the scripts follow the brief.{" "}
          <button type="button" onClick={goSetup} className="font-medium text-accent">
            Set up this job →
          </button>
        </p>
      )}

      <Section title="This week's shoot sheet">
        <form onSubmit={make} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
            <Field label="Videos">
              <input type="number" min={1} max={21} className={input} value={videos} onChange={(e) => setVideos(Math.max(1, Math.min(21, Number(e.target.value) || 1)))} />
            </Field>
            <Field label="Filming">
              <input className={input} value={filmingOn} onChange={(e) => setFilmingOn(e.target.value)} />
            </Field>
          </div>
          <Field label="How last week went" hint="What did best, what flopped. Or leave it for the Friday review to cover.">
            <textarea rows={2} className={input} value={lastWeek} onChange={(e) => setLastWeek(e.target.value)} placeholder="The 'Pingo Laughs' restaurant one hit 40k, the SAY IT!!! ones stalled under 1k…" />
          </Field>
          <Field label="Trending in the niche (optional)" hint="Describe 2-3 videos doing well (hook, format, length) and they'll be adapted for the app.">
            <textarea rows={2} className={input} value={trending} onChange={(e) => setTrending(e.target.value)} />
          </Field>
          <details className="rounded-xl border border-border px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">New brief this week?</summary>
            <div className="mt-3">
              <Field label="Paste the new brief" hint="It replaces the old brief file, so there's only ever one set of rules.">
                <textarea rows={6} className={input} value={newBrief} onChange={(e) => setNewBrief(e.target.value)} />
              </Field>
            </div>
          </details>
          <FilePicker accept="image/png,image/jpeg,image/webp,application/pdf" label="Screenshots or PDFs (optional)" onChange={setUploads} />
          <ActionButton busy={action.busy} seconds={action.seconds} label="Make this week's shoot sheet" busyLabel="Writing your shoot sheet… usually 1-3 minutes ·" />
          {action.error && <p className="text-sm text-accent">{action.error}</p>}
        </form>
        {made && (
          <div className="space-y-2 rounded-xl bg-good-soft px-4 py-3 text-sm text-good">
            <p>{made.oneLine} Its hooks are now in the script bank.</p>
            <a href={`/hub/studio/sheets/${made.id}`} target="_blank" rel="noopener" className="inline-block font-semibold underline">
              Open the shoot sheet →
            </a>
          </div>
        )}
      </Section>

      <Section title="Shoot sheets">
        {sheets.length === 0 ? (
          <p className="text-sm text-text-dim">None yet. Each one opens as its own page - add it to your phone&apos;s home screen for filming days.</p>
        ) : (
          <ul className="divide-y divide-border">
            {sheets.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <a href={`/hub/studio/sheets/${s.id}`} target="_blank" rel="noopener" className="min-w-0 font-medium hover:text-accent">
                  {s.title}
                  <span className="ml-2 text-xs font-normal text-text-dim">
                    {s.videos} videos · {shortDate(s.createdAt)}
                  </span>
                </a>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm(`Delete "${s.title}"? Its hooks stay in the script bank.`)) return;
                    await call(`/api/hub/studio/sheets/${s.id}`, "DELETE");
                    setSheets(sheets.filter((x) => x.id !== s.id));
                  }}
                  className="text-xs text-text-dim hover:text-accent"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/* ---- Set up ---- */

function SetupTab({ api, ws, edit, onWorkspace }: { api: string; ws: Workspace; edit: (w: Workspace) => void; onWorkspace: (w: Workspace) => void }) {
  const [material, setMaterial] = useState("");
  const [filming, setFilming] = useState("solo, phone on a tripod, at home and around town, second phone filming app screens over my shoulder");
  const [voice, setVoice] = useState("casual, direct, a bit dry");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const action = useAction();
  const setUp = Boolean(ws.instructions);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (setUp && !confirm("This rewrites the instructions, brief and app notes from the new material. Winners and script bank stay. Carry on?")) return;
    await action.run(async () => onWorkspace(await call<Workspace>(`${api}/intake`, "POST", { material, filming, voice, uploads })));
  }

  return (
    <div className="space-y-5">
      <Section title={setUp ? "Set up again from new material" : "Set up this job"}>
        <p className="text-sm text-text-muted">
          Paste everything you have: the brief, emails, rates, kickoff messages. Public links (notion.site, Google Docs) get opened too; for a Notion page
          in the client&apos;s workspace, export it to PDF and attach it. You get the filled-in instructions, the brief, app notes and references, plus
          questions for the client - no brackets to fill in.
        </p>
        <form onSubmit={run} className="space-y-4">
          <Field label="Everything you have on the job">
            <textarea rows={10} className={input} value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="Paste the brief, links, emails, rates…" />
          </Field>
          <FilePicker accept="application/pdf,image/png,image/jpeg,image/webp" label="PDFs or screenshots (optional)" onChange={setUploads} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="How you film">
              <input className={input} value={filming} onChange={(e) => setFilming(e.target.value)} />
            </Field>
            <Field label="Your voice (3-4 words)">
              <input className={input} value={voice} onChange={(e) => setVoice(e.target.value)} />
            </Field>
          </div>
          <ActionButton busy={action.busy} seconds={action.seconds} label={setUp ? "Set up again" : "Set up this job"} busyLabel="Reading everything and setting up… ·" />
          {action.error && <p className="text-sm text-accent">{action.error}</p>}
        </form>
      </Section>

      {(ws.clientQuestions.length > 0 || ws.needsDan.length > 0 || ws.couldntOpen.length > 0) && (
        <Section title="To sort out">
          {ws.clientQuestions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Questions for the client</h3>
                <CopyButton text={ws.clientQuestions.map((q) => `- ${q}`).join("\n")} label="Copy all" />
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {ws.clientQuestions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          )}
          {ws.needsDan.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Defaults to check</h3>
              <p className="text-xs text-text-dim">Filled in so nothing&apos;s left blank. Change any that are wrong in the instructions below.</p>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {ws.needsDan.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          )}
          {ws.couldntOpen.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Couldn&apos;t open</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-text-muted">
                {ws.couldntOpen.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          )}
          <button type="button" onClick={() => edit({ ...ws, clientQuestions: [], needsDan: [], couldntOpen: [] })} className="text-xs text-text-dim hover:text-text">
            Clear this list
          </button>
        </Section>
      )}

      <Section title="Project instructions">
        <p className="text-sm text-text-muted">How Claude works on this job: the job, the rules from the brief, how you film, your voice and what to hand back.</p>
        <textarea rows={18} className={`${input} font-mono text-xs leading-relaxed`} value={ws.instructions} onChange={(e) => edit({ ...ws, instructions: e.target.value })} />
      </Section>
    </div>
  );
}

/* ---- Files ---- */

function FilesTab({ ws, edit }: { ws: Workspace; edit: (w: Workspace) => void }) {
  return (
    <div className="space-y-5">
      {FILES.map((f) => (
        <Section key={f.key} title={f.label} action={<span className="text-xs text-text-dim">{ws.files[f.key].length.toLocaleString()} characters</span>}>
          <p className="text-sm text-text-muted">{f.hint}</p>
          <textarea
            rows={f.key === "brief" || f.key === "scriptBank" ? 14 : 8}
            className={`${input} text-sm leading-relaxed`}
            value={ws.files[f.key]}
            onChange={(e) => edit({ ...ws, files: { ...ws.files, [f.key]: e.target.value } })}
          />
        </Section>
      ))}
    </div>
  );
}

/* ---- Friday review ---- */

function ReviewTab({ api, ws, onWorkspace }: { api: string; ws: Workspace; onWorkspace: (w: Workspace) => void }) {
  const [numbers, setNumbers] = useState("");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const action = useAction();
  const review = ws.lastReview;

  return (
    <div className="space-y-5">
      <Section title="Friday review">
        <p className="text-sm text-text-muted">Paste this week&apos;s numbers or add analytics screenshots. You get what to do more and less of, next week&apos;s plan, and a rewritten winners file.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await action.run(async () => onWorkspace(await call<Workspace>(`${api}/review`, "POST", { numbers, uploads })));
          }}
          className="space-y-4"
        >
          <Field label="This week's numbers">
            <textarea rows={6} className={input} value={numbers} onChange={(e) => setNumbers(e.target.value)} placeholder="V1 restaurant mix-up: 42k views, 61% retention, 300 likes…" />
          </Field>
          <FilePicker accept="image/png,image/jpeg,image/webp" label="Analytics screenshots" onChange={setUploads} />
          <ActionButton busy={action.busy} seconds={action.seconds} label="Run the review" busyLabel="Reviewing the week… ·" />
          {action.error && <p className="text-sm text-accent">{action.error}</p>}
        </form>
      </Section>

      {review && (
        <Section title={`Last review · ${shortDate(review.at)}`}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-good">More of</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {review.moreOf.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-accent">Less of</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {review.lessOf.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold">Next week</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm text-text-muted">{review.nextWeek}</p>
          </div>
          <p className="text-xs text-text-dim">The winners file has been rewritten with this week&apos;s results (see Files).</p>
        </Section>
      )}
    </div>
  );
}

/* ---- Account ---- */

function AccountTab({ ws, edit }: { ws: Workspace; edit: (w: Workspace) => void }) {
  const a = ws.account;
  const set = (patch: Partial<Workspace["account"]>) => edit({ ...ws, account: { ...a, ...patch } });
  const done = ACCOUNT_CHECKS.filter((c) => a.checks[c.id]).length;
  return (
    <div className="space-y-5">
      <Section title="Accounts">
        <Field label="Handles" hint="Every account this job posts from, one per line.">
          <textarea rows={3} className={input} value={a.handles} onChange={(e) => set({ handles: e.target.value })} placeholder={"TikTok @danlearnsmarkets\nInstagram @danlearnsmarkets"} />
        </Field>
      </Section>
      <Section title="New account checklist" action={<span className="text-xs text-text-dim">{done}/{ACCOUNT_CHECKS.length}</span>}>
        <ul className="space-y-1">
          {ACCOUNT_CHECKS.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg px-1 py-1.5 hover:bg-bg-elevated">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" checked={Boolean(a.checks[c.id])} onChange={(e) => set({ checks: { ...a.checks, [c.id]: e.target.checked } })} />
                <span className={`text-sm ${a.checks[c.id] ? "text-text-dim line-through" : ""}`}>{c.text}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="text-xs text-text-dim">Once live: 10 minutes of engagement before and after every post - the first hour decides most of the reach.</p>
      </Section>
      <Section title="Notes">
        <textarea rows={4} className={input} value={a.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Feed test results, first-video views, phone used for verification…" />
      </Section>
    </div>
  );
}
