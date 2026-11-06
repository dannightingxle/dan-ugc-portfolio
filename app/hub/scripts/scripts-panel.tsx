"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  DESTINATIONS,
  FEEDBACK_PICKS,
  FORMATS,
  LENGTHS,
  type Answer,
  type Feedback,
  type Length,
  type Script,
  type ScriptRequest,
  type ScriptVersion,
} from "../_lib/scripts/types";
import { type Task, useElapsed } from "../_lib/studio/tasks-client";
import { FilePicker, useUploading, type Upload } from "../_lib/attachments";
import { TextBox } from "../_lib/text-box";
import { Busy, Spinner, useBusy } from "../_lib/ui";
import { useConfirm } from "../_lib/popups";
import { Field, input } from "../projects/fields";
import { PackView } from "./pack";

/* Scripts for a job, or the standalone ones: "Write a script" opens the
   request; each script keeps every version, newest first. A script that asks
   questions shows them with an answer box each; "Not right?" rewrites it from
   your feedback; a suggested rule can be saved to your profile. Writing runs
   in the background, so the page can be left. */

type Run = {
  request?: ScriptRequest;
  uploads?: Upload[];
  scriptId?: string;
  answers?: Answer[];
  feedback?: Feedback;
};
type List = { scripts: Script[]; task: Task | null };

function onHashChange(fn: () => void) {
  window.addEventListener("hashchange", fn);
  return () => window.removeEventListener("hashchange", fn);
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const FROM: Record<ScriptVersion["from"], string> = {
  request: "first go",
  answers: "with your answers",
  feedback: "after your feedback",
};

export function ScriptsPanel({ scope, prefill }: { scope: string; prefill?: Partial<ScriptRequest> }) {
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const api = `/api/hub/scripts?scope=${encodeURIComponent(scope)}`;

  // Loaded on opening, and again every few seconds while one is being written.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    fetch(api)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!live) return;
        if (res.ok) setList(json as List);
        else setError(json.error ?? "Couldn't load your scripts.");
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api, tick]);
  const running = list?.task?.status === "running";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((n) => n + 1), 3000);
    return () => clearInterval(t);
  }, [running]);

  // Opened from a "Write script" button elsewhere (…#write-script).
  const asked = useSyncExternalStore(
    onHashChange,
    () => window.location.hash === "#write-script",
    () => false,
  );
  const [chosen, setOpen] = useState<boolean | null>(null);
  const open = chosen ?? asked;
  useEffect(() => {
    if (asked) top.current?.scrollIntoView({ block: "start" });
  }, [asked]);

  async function start(run: Run) {
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/hub/scripts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope, ...run }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Couldn't start it.");
      setList((l) => ({ scripts: l?.scripts ?? [], task: json as Task }));
      setOpen(false);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setSending(false);
    }
  }

  const task = list?.task;
  const elapsed = useElapsed(task?.startedAt, running);
  const latest = list?.scripts.reduce((m, s) => (s.updatedAt > m ? s.updatedAt : m), "") ?? "";
  const failed = task?.status === "failed" && (task.finishedAt ?? "") > latest ? task.error : "";

  return (
    <div ref={top} id="write-script" className="scroll-mt-20 space-y-4">
      <ProfileNudge />
      {!open && (
        <button
          type="button"
          disabled={running || sending}
          onClick={() => setOpen(true)}
          className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60"
        >
          Write a script
        </button>
      )}
      {open && <ScriptForm prefill={prefill} sending={sending} onCancel={() => setOpen(false)} onSubmit={(request, uploads) => start({ request, uploads })} />}

      {running && (
        <p className="flex items-center gap-2 text-sm text-text-muted" role="status">
          <Spinner /> {task?.step && task.step !== "Starting" ? `${task.step}…` : "Writing the script…"} {elapsed} · you can leave this page, it carries on.
        </p>
      )}
      {failed && <p className="text-sm text-accent">{failed}</p>}
      {error && <p className="text-sm text-accent">{error}</p>}

      {!list ? (
        <p className="text-sm text-text-dim">Loading scripts…</p>
      ) : (
        list.scripts.map((s, i) => (
          <ScriptCard
            key={`${s.id}:${s.versions.length}`}
            script={s}
            startOpen={i === 0}
            busy={running || sending}
            onRun={(run) => start({ scriptId: s.id, ...run })}
            onDeleted={() =>
              setList(
                (l) =>
                  l && {
                    ...l,
                    scripts: l.scripts.filter((x) => x.id !== s.id),
                  },
              )
            }
            scope={scope}
          />
        ))
      )}
    </div>
  );
}

/** A nudge to fill in the profile, while there's nothing in it that would make a script sound like you. */
function ProfileNudge() {
  const [empty, setEmpty] = useState(false);
  useEffect(() => {
    fetch("/api/hub/scripts/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => p && setEmpty(!p.facts?.trim() && !p.voiceSample?.trim() && !p.niches?.trim()))
      .catch(() => {});
  }, []);
  if (!empty) return null;
  return (
    <p className="rounded-xl border border-accent/30 bg-accent-soft/40 p-3 text-sm">
      Scripts are written in your voice from your creator profile, and it&apos;s empty.{" "}
      <Link href="/hub/account#creator-profile" className="font-medium text-accent underline">
        Fill in your profile
      </Link>{" "}
      so they sound like you.
    </p>
  );
}

const BLANK: ScriptRequest = {
  brand: "",
  product: "",
  brief: "",
  length: 30,
  format: "",
  experience: "",
  mustSay: "",
  mustNotSay: "",
  destination: "",
};

function ScriptForm({
  prefill,
  sending,
  onSubmit,
  onCancel,
}: {
  prefill?: Partial<ScriptRequest>;
  sending: boolean;
  onSubmit: (r: ScriptRequest, u: Upload[]) => void;
  onCancel: () => void;
}) {
  const [r, setR] = useState<ScriptRequest>({ ...BLANK, ...prefill });
  const [uploads, setUploads] = useState<Upload[]>([]);
  const uploading = useUploading();
  const set = <K extends keyof ScriptRequest>(k: K, v: ScriptRequest[K]) => setR((x) => ({ ...x, [k]: v }));
  const ready = r.brand.trim() && r.product.trim();
  return (
    <form
      aria-label="Write a script"
      className="space-y-3 rounded-2xl border border-border bg-bg p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onSubmit(r, uploads);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Brand *">
          <input className={input} value={r.brand} onChange={(e) => set("brand", e.target.value)} required />
        </Field>
        <Field label="Product *">
          <input
            className={input}
            value={r.product}
            onChange={(e) => set("product", e.target.value)}
            placeholder="What it is, e.g. Rise Oats protein porridge"
            required
          />
        </Field>
      </div>
      <fieldset className="space-y-1">
        <legend className="text-xs font-medium text-text-muted">Length *</legend>
        <div className="flex gap-2">
          {LENGTHS.map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={r.length === l}
              onClick={() => set("length", l as Length)}
              className={`rounded-lg border px-4 py-1.5 text-sm ${r.length === l ? "border-accent bg-accent-soft font-medium text-accent" : "border-border hover:border-border-strong"}`}
            >
              {l}s
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Format">
          <select className={input} value={r.format} onChange={(e) => set("format", e.target.value)}>
            <option value="">Not sure / let Claude pick</option>
            {FORMATS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </Field>
        <Field label="Where it's going">
          <select className={input} value={r.destination} onChange={(e) => set("destination", e.target.value)}>
            <option value="">Not said</option>
            {DESTINATIONS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="The brief" hint="Paste the brief, the email or the messages. Links in it are opened.">
        <TextBox aria-label="The brief" rows={6} className={input} value={r.brief} onValue={(v) => set("brief", v)} placeholder="Paste the brief…" />
      </Field>
      <FilePicker accept="image/*,application/pdf,video/*" label="Brief files - PDFs, screenshots or a video (optional)" onChange={setUploads} />
      <Field
        label="Your real experience with it"
        hint="Only what you write here (and your profile) is used as your experience. Anything missing is left as a [placeholder]."
      >
        <TextBox
          aria-label="Your real experience with it"
          rows={3}
          className={input}
          value={r.experience}
          onValue={(v) => set("experience", v)}
          placeholder="Have you used it? What happened? What surprised you?"
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Must say">
          <TextBox aria-label="Must say" rows={2} className={input} value={r.mustSay} onValue={(v) => set("mustSay", v)} />
        </Field>
        <Field label="Must not say">
          <TextBox aria-label="Must not say" rows={2} className={input} value={r.mustNotSay} onValue={(v) => set("mustNotSay", v)} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={!ready || sending || uploading}
          className="rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60"
        >
          <Busy busy={sending} label="Starting…">
            {uploading ? "Waiting for your files to upload…" : "Write the script"}
          </Busy>
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-text-muted hover:text-accent">
          Cancel
        </button>
      </div>
    </form>
  );
}

function ScriptCard({
  script,
  startOpen,
  busy,
  onRun,
  onDeleted,
  scope,
}: {
  script: Script;
  startOpen: boolean;
  busy: boolean;
  onRun: (r: Run) => Promise<boolean>;
  onDeleted: () => void;
  scope: string;
}) {
  const [open, setOpen] = useState(startOpen);
  const [index, setIndex] = useState(0);
  const confirm = useConfirm();
  const v = script.versions[index];
  if (!v) return null;
  const newest = index === 0;
  return (
    <article className="space-y-4 rounded-2xl border border-border bg-bg-card p-4" aria-label={script.title}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button type="button" onClick={() => setOpen((o) => !o)} className="min-w-0 text-left" aria-expanded={open}>
          <p className="font-semibold">{script.title}</p>
          <p className="text-xs text-text-dim">
            {when(script.updatedAt)} · {script.versions.length} version
            {script.versions.length === 1 ? "" : "s"}
          </p>
        </button>
        {open && script.versions.length > 1 && (
          <select aria-label="Version" className={`${input} w-auto py-1 text-xs`} value={index} onChange={(e) => setIndex(Number(e.target.value))}>
            {script.versions.map((x, i) => (
              <option key={x.id} value={i}>
                Version {script.versions.length - i}
                {i === 0 ? " (newest)" : ""} · {FROM[x.from]} · {when(x.createdAt)}
              </option>
            ))}
          </select>
        )}
      </div>
      {open && (
        <>
          {v.pack.questions.length > 0 ? (
            newest ? (
              <Questions questions={v.pack.questions} busy={busy} onAnswer={(answers) => onRun({ answers })} />
            ) : (
              <p className="text-sm text-text-muted">This version asked questions: {v.pack.questions.join(" ")}</p>
            )
          ) : (
            <>
              <PackView pack={v.pack} version={v} title={script.title} seconds={script.request.length} />
              {v.pack.suggested_rule.trim() && <SuggestedRule rule={v.pack.suggested_rule} />}
              {newest && <NotRight busy={busy} onSend={(feedback) => onRun({ feedback })} />}
            </>
          )}
          <button
            type="button"
            onClick={async () => {
              if (
                !(await confirm({
                  title: `Delete "${script.title}"?`,
                  message: "Every version of it goes. This can't be undone.",
                  confirmLabel: "Delete",
                  danger: true,
                }))
              )
                return;
              const res = await fetch(`/api/hub/scripts?scope=${encodeURIComponent(scope)}&id=${script.id}`, { method: "DELETE" });
              if (res.ok) onDeleted();
            }}
            className="text-xs text-text-dim hover:text-accent"
          >
            Delete this script
          </button>
        </>
      )}
    </article>
  );
}

function Questions({ questions, busy, onAnswer }: { questions: string[]; busy: boolean; onAnswer: (a: Answer[]) => Promise<boolean> }) {
  const [answers, setAnswers] = useState<string[]>(questions.map(() => ""));
  return (
    <form
      aria-label="Questions before the script"
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void onAnswer(questions.map((q, i) => ({ question: q, answer: answers[i] })));
      }}
    >
      <p className="text-sm font-medium">Claude needs a bit more before it can write this one:</p>
      {questions.map((q, i) => (
        <Field key={q} label={q}>
          <TextBox aria-label={q} rows={2} className={input} value={answers[i]} onValue={(v) => setAnswers((a) => a.map((x, j) => (j === i ? v : x)))} />
        </Field>
      ))}
      <button
        disabled={busy || !answers.some((a) => a.trim())}
        className="rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60"
      >
        Write it with these answers
      </button>
    </form>
  );
}

function NotRight({ busy, onSend }: { busy: boolean; onSend: (f: Feedback) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [picks, setPicks] = useState<string[]>([]);
  const [text, setText] = useState("");
  if (!open)
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:border-accent hover:text-accent disabled:opacity-60"
      >
        Not right?
      </button>
    );
  return (
    <form
      aria-label="What's not right"
      className="space-y-3 rounded-xl border border-border bg-bg p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onSend({ picks, text })) setOpen(false);
      }}
    >
      <div className="flex flex-wrap gap-2">
        {FEEDBACK_PICKS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={picks.includes(p)}
            onClick={() => setPicks((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]))}
            className={`rounded-full border px-3 py-1 text-xs ${picks.includes(p) ? "border-accent bg-accent-soft font-medium text-accent" : "border-border hover:border-border-strong"}`}
          >
            {p}
          </button>
        ))}
      </div>
      <TextBox
        aria-label="What else isn't right"
        rows={2}
        className={input}
        value={text}
        onValue={setText}
        placeholder="Anything else? e.g. I'd never say 'knackered'"
      />
      <div className="flex items-center gap-3">
        <button
          disabled={busy || (!picks.length && !text.trim())}
          className="rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60"
        >
          Rewrite it
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-text-muted hover:text-accent">
          Cancel
        </button>
      </div>
    </form>
  );
}

function SuggestedRule({ rule }: { rule: string }) {
  const [text, setText] = useState(rule);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [saving, save] = useBusy();
  return (
    <div className="space-y-2 rounded-xl border border-accent/30 bg-accent-soft/40 p-3 text-sm" aria-label="Suggested rule">
      <p className="text-xs font-semibold text-text-muted">A rule so it doesn&apos;t happen again</p>
      {saved ? (
        <p>
          ✓ Saved to your rules. Every script from now on follows it.{" "}
          <Link href="/hub/account#creator-profile" className="text-accent underline">
            Edit your rules
          </Link>
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="Suggested rule" className={`${input} min-w-0 flex-1`} value={text} onChange={(e) => setText(e.target.value)} />
          <button
            type="button"
            disabled={saving || !text.trim()}
            onClick={() =>
              save(async () => {
                setError("");
                const res = await fetch("/api/hub/scripts/profile", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ rule: text }),
                });
                if (res.ok) setSaved(true);
                else setError((await res.json().catch(() => ({}))).error ?? "Couldn't save it.");
              })
            }
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
          >
            <Busy busy={saving} label="Saving…">
              Save this rule
            </Busy>
          </button>
        </div>
      )}
      {error && <p className="text-accent">{error}</p>}
    </div>
  );
}
