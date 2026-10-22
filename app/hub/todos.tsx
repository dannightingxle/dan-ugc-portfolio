"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { isArchived, paymentDue, useProjects, type Project } from "./_lib/store";
import { CHECK_IN_AFTER_DAYS, REPEATS, REPEAT_LABEL, checkInOn, finish, localDay, placeOf, unfinish, type Repeat, type Todo } from "./_lib/todos/types";
import { input } from "./projects/fields";
import { money, shortDate } from "./_lib/ui";
import { useFeature } from "./account-provider";

/* Your to-dos, at the top of the home page: what to do, chase and check in on.
   Your own (one-offs and repeating ones, for a job or not), work you've sent
   off that's waited CHECK_IN_AFTER_DAYS without approval, and from your jobs:
   chases that are due and invoices that are overdue. */

const API = "/api/hub/todos";

async function call<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Something went wrong (${res.status}).`);
  return json as T;
}

const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

export function YourTodos() {
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [error, setError] = useState("");
  const { projects, save } = useProjects();
  const followups = useFeature("followups");
  const today = localDay();
  // Read the clock once a render, not during it.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    call<{ todos: Todo[] }>(API, "GET").then((r) => setTodos(r.todos), (e: Error) => setError(e.message));
  }, []);

  // Changes go to the server one at a time, in order, so quick ticks don't overwrite each other;
  // the screen takes the server's list once nothing else is on its way.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);
  function send(url: string, method: string, body?: unknown) {
    pending.current++;
    setError("");
    queue.current = queue.current
      .then(() => call<{ todos: Todo[] }>(url, method, body))
      .then(
        (r) => {
          if (pending.current === 1) setTodos(r.todos);
        },
        (e: Error) => setError(e.message),
      )
      .finally(() => pending.current--);
  }
  function patch(t: Todo, changes: Partial<Todo>) {
    setTodos((list) => list && list.map((x) => (x.id === t.id ? { ...x, ...changes } : x)));
    send(API, "PATCH", { id: t.id, ...changes });
  }
  function remove(t: Todo) {
    setTodos((list) => list && list.filter((x) => x.id !== t.id));
    send(`${API}?id=${t.id}`, "DELETE");
  }
  /** Ticking: one of a count done, or this time round finished. */
  const tick = (t: Todo) => (t.left != null && t.left > 1 ? patch(t, { left: t.left - 1 }) : patch(t, finish(t, today)));

  const job = (id: string) => projects.find((p) => p.id === id);
  const live = projects.filter((p) => !isArchived(p));
  // From your jobs: chases due today or earlier, and invoices past their due date.
  const chases = followups ? live.filter((p) => p.waitingOn.trim() && p.chaseOn && p.chaseOn <= today).sort((a, b) => a.chaseOn.localeCompare(b.chaseOn)) : [];
  const unpaid = projects.filter((p) => paymentDue(p)?.overdue);
  function chased(p: Project) {
    const next = new Date(`${today}T12:00:00`);
    next.setDate(next.getDate() + CHECK_IN_AFTER_DAYS);
    save({ ...p, lastContact: today, chaseOn: localDay(next) });
  }

  const list = todos ?? [];
  const by = (place: ReturnType<typeof placeOf>) => list.filter((t) => now && placeOf(t, today, now) === place);
  const todo = by("todo").sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || a.createdAt.localeCompare(b.createdAt));
  const checkins = by("checkin").sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  const waiting = by("waiting").sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  const later = by("later").sort((a, b) => a.due.localeCompare(b.due));
  const done = by("done").sort((a, b) => b.doneAt.localeCompare(a.doneAt));
  const count = todo.length + checkins.length + chases.length + unpaid.length;

  return (
    <section className="space-y-4" aria-labelledby="todos-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="todos-heading" className="font-serif text-3xl italic sm:text-4xl">
            Your to-dos
          </h2>
          <p className="mt-1 text-sm text-text-muted">What to do, chase and check in on.</p>
        </div>
        {todos && <span className="text-sm text-text-dim">{count === 0 ? "All clear" : `${count} to do`}</span>}
      </div>

      <AddTodo jobs={live} onAdded={setTodos} />
      {error && <p className="text-sm text-accent">{error}</p>}

      {!todos ? (
        !error && <p className="text-sm text-text-muted">Loading your to-dos…</p>
      ) : (
        <>
          {count > 0 && (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-bg-card" aria-label="To do">
              {checkins.map((t) => (
                <li key={t.id} className="space-y-2 bg-warn-soft px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-warn">Check in - still not approved</p>
                    <p className="text-sm font-medium">{t.text}</p>
                    <Meta t={t} job={job(t.projectId)} extra={`Submitted ${when(t.submittedAt)}`} />
                  </div>
                  <Decide t={t} onApproved={() => patch(t, finish(t, today))} onChanges={() => patch(t, { submittedAt: "" })}>
                    <button type="button" onClick={() => patch(t, { submittedAt: new Date().toISOString() })} className="rounded-lg border border-border px-3 py-1 text-xs hover:border-accent hover:text-accent">
                      Chased - check again in {CHECK_IN_AFTER_DAYS} days
                    </button>
                  </Decide>
                </li>
              ))}
              {chases.map((p) => (
                <li key={`chase-${p.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <Link href={`/hub/projects/${p.id}`} className="min-w-0 flex-1 hover:text-accent">
                    <p className="text-xs text-text-dim">Chase {p.brand || "the brand"}</p>
                    <p className="text-sm font-medium">{p.waitingOn}</p>
                  </Link>
                  <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">{p.chaseOn < today ? `Chase since ${shortDate(p.chaseOn)}` : "Chase today"}</span>
                  <button type="button" onClick={() => chased(p)} className="rounded-lg border border-border px-3 py-1 text-xs hover:border-accent hover:text-accent">
                    Chased
                  </button>
                </li>
              ))}
              {unpaid.map((p) => (
                <li key={`paid-${p.id}`}>
                  <Link href={`/hub/projects/${p.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-bg-elevated">
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-text-dim">Chase payment</span>
                      <span className="block text-sm font-medium">
                        {p.brand} - {money(p.fee, p.feeCurrency)}
                      </span>
                    </span>
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">Overdue since {shortDate(paymentDue(p)?.date)}</span>
                  </Link>
                </li>
              ))}
              {todo.map((t) => (
                <TodoRow key={t.id} t={t} job={job(t.projectId)} today={today} onTick={() => tick(t)} onSubmit={() => patch(t, { submittedAt: new Date().toISOString() })} onEdit={(text) => patch(t, { text })} onDelete={() => remove(t)} />
              ))}
            </ul>
          )}
          {count === 0 && <p className="rounded-2xl border border-dashed border-border-strong p-4 text-sm text-text-muted">Nothing to do right now. Add one above - emails to answer, videos to make, anything.</p>}

          {waiting.length > 0 && (
            <details className="rounded-2xl border border-border bg-bg-card px-4 py-3" open>
              <summary className="cursor-pointer text-sm font-medium">
                Awaiting approval ({waiting.length}) <span className="font-normal text-text-dim">- back in your to-dos after {CHECK_IN_AFTER_DAYS} days if not approved</span>
              </summary>
              <ul className="mt-2 divide-y divide-border" aria-label="Awaiting approval">
                {waiting.map((t) => (
                  <li key={t.id} className="space-y-2 py-2.5">
                    <div>
                      <p className="text-sm">{t.text}</p>
                      <Meta t={t} job={job(t.projectId)} extra={`Submitted ${when(t.submittedAt)} · check in ${when(checkInOn(t).toISOString())}`} />
                    </div>
                    <Decide t={t} onApproved={() => patch(t, finish(t, today))} onChanges={() => patch(t, { submittedAt: "" })} />
                  </li>
                ))}
              </ul>
            </details>
          )}

          {(later.length > 0 || done.length > 0) && (
            <details className="rounded-2xl border border-border bg-bg-card px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium">
                Done {later.length > 0 && <span className="font-normal text-text-dim">- and {later.length} repeating one{later.length === 1 ? "" : "s"} coming back</span>}
              </summary>
              <ul className="mt-2 divide-y divide-border" aria-label="Done">
                {[...later, ...done].map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <span className="min-w-0 flex-1 text-sm text-text-muted line-through decoration-text-dim">{t.text}</span>
                    <span className="text-xs text-text-dim">{t.repeat ? `Back ${day(t.due)}` : `Done ${when(t.doneAt)}`}</span>
                    <button type="button" onClick={() => patch(t, unfinish(t))} className="text-xs text-accent hover:underline">
                      Undo
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

function Meta({ t, job, extra }: { t: Todo; job?: Project; extra?: string }) {
  const bits = [t.repeat && REPEAT_LABEL[t.repeat], t.count != null && t.count > 1 && `${t.left ?? t.count} of ${t.count} left`, extra].filter(Boolean);
  if (!job && !bits.length) return null;
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-text-dim">
      {job && (
        <Link href={`/hub/projects/${job.id}`} className="font-medium text-text-muted hover:text-accent">
          {job.brand || job.title || "Job"}
        </Link>
      )}
      {bits.map((b) => (
        <span key={String(b)}>{b}</span>
      ))}
    </p>
  );
}

function Decide({ t, onApproved, onChanges, children }: { t: Todo; onApproved: () => void; onChanges: () => void; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={onApproved} aria-label={`Approved: ${t.text}`} className="rounded-lg bg-good-soft px-3 py-1 text-xs font-medium text-good hover:opacity-80">
        Approved
      </button>
      <button type="button" onClick={onChanges} aria-label={`Needs changes: ${t.text}`} className="rounded-lg border border-border px-3 py-1 text-xs hover:border-accent hover:text-accent">
        Needs changes - back to my to-dos
      </button>
      {children}
    </div>
  );
}

function TodoRow({ t, job, today, onTick, onSubmit, onEdit, onDelete }: { t: Todo; job?: Project; today: string; onTick: () => void; onSubmit: () => void; onEdit: (text: string) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const late = t.due && t.due < today;
  const counted = t.left != null && t.left > 1;
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <button
        type="button"
        onClick={onTick}
        aria-label={counted ? `One done: ${t.text}` : `Done: ${t.text}`}
        title={counted ? "One of these done" : "Done"}
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-border-strong text-[10px] text-text-dim hover:border-accent hover:text-accent"
      >
        {counted ? t.left : ""}
      </button>
      <div className="min-w-0 flex-1">
        {editing != null ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editing.trim()) onEdit(editing.trim());
              setEditing(null);
            }}
          >
            <input autoFocus className={`${input} py-1 text-sm`} value={editing} onChange={(e) => setEditing(e.target.value)} onBlur={() => setEditing(null)} onKeyDown={(e) => e.key === "Escape" && setEditing(null)} aria-label="Change the to-do" maxLength={300} />
          </form>
        ) : (
          <button type="button" onClick={() => setEditing(t.text)} className="text-left text-sm font-medium" title="Change it">
            {t.text}
          </button>
        )}
        <Meta t={t} job={job} />
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {t.due && <span className={`rounded-full px-2 py-0.5 text-xs ${late ? "bg-accent-soft font-medium text-accent" : t.due === today ? "bg-warn-soft text-warn" : "bg-text/5 text-text-dim"}`}>{late ? `Was due ${day(t.due)}` : t.due === today ? "Today" : `By ${day(t.due)}`}</span>}
        <button type="button" onClick={onSubmit} className="rounded-lg border border-border px-2.5 py-1 text-xs hover:border-accent hover:text-accent">
          Work is submitted
        </button>
        <button type="button" onClick={onDelete} aria-label={`Delete: ${t.text}`} className="px-1 text-text-dim hover:text-accent">
          ✕
        </button>
      </div>
    </li>
  );
}

function AddTodo({ jobs, onAdded }: { jobs: Project[]; onAdded: (todos: Todo[]) => void }) {
  const [text, setText] = useState("");
  const [more, setMore] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [repeat, setRepeat] = useState<Repeat>("");
  const [count, setCount] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const n = parseInt(count, 10);
      const r = await call<{ todos: Todo[] }>(API, "POST", { text, projectId, repeat, due, count: n > 0 ? Math.min(n, 99) : null });
      onAdded(r.todos);
      setText("");
      setCount("");
      setDue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={add} className="space-y-2">
      <div className="flex gap-2">
        <input className={`${input} flex-1`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a to-do - e.g. Reply to the Twirl emails" aria-label="New to-do" maxLength={300} />
        <button disabled={!text.trim() || busy} className="shrink-0 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">
          Add
        </button>
      </div>
      {more ? (
        <div className="grid gap-2 sm:grid-cols-4">
          <label className="space-y-1 text-xs text-text-muted">
            <span>For a job</span>
            <select className={input} value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="For a job">
              <option value="">No job</option>
              {jobs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.brand || p.title || "Job"}
                  {p.title && p.brand ? ` - ${p.title}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-text-muted">
            <span>Repeats</span>
            <select className={input} value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)} aria-label="Repeats">
              {REPEATS.map((r) => (
                <option key={r} value={r}>
                  {REPEAT_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-text-muted">
            <span>How many (each time)</span>
            <input type="number" min={1} max={99} className={input} value={count} onChange={(e) => setCount(e.target.value)} placeholder="1" aria-label="How many" />
          </label>
          <label className="space-y-1 text-xs text-text-muted">
            <span>{repeat ? "First due" : "Do by"}</span>
            <input type="date" className={input} value={due} onChange={(e) => setDue(e.target.value)} aria-label={repeat ? "First due" : "Do by"} />
          </label>
        </div>
      ) : (
        <button type="button" onClick={() => setMore(true)} className="text-xs text-accent hover:underline">
          + For a job, repeats, how many, a date
        </button>
      )}
      {error && <p className="text-sm text-accent">{error}</p>}
    </form>
  );
}
