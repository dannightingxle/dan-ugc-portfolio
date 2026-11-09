"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { dropProject, reloadProject } from "../_lib/store";
import { TextBox } from "../_lib/text-box";
import { Spinner } from "../_lib/ui";
import { type Conversation, type ConversationSummary, DEFAULT_NAME, type DwightMessage } from "../_lib/dwight/types";
import { Markdown } from "./markdown";

/* Dwight's chat, shared by the corner panel and the full page: the
   conversation (with what it's doing while it works, what it changed with
   Undo, and buttons to where to go next) and the box to ask in. */

const API = "/api/hub/dwight";
const CURRENT = "dwight:current";
/** Other parts of the page listen for this to reload their to-dos. */
export const TODOS_CHANGED = "creator-desk:todos-changed";

export function rememberedConversation() {
  try {
    return window.localStorage.getItem(CURRENT);
  } catch {
    return null;
  }
}
function remember(id: string | null) {
  try {
    if (id) window.localStorage.setItem(CURRENT, id);
    else window.localStorage.removeItem(CURRENT);
  } catch {}
}

async function call<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
  return json as T;
}

/** Pick up what Dwight changed: the jobs on this page, and the to-do list. */
function pickUp(touched: { jobs?: string[]; removed?: string[]; todos?: boolean }) {
  for (const id of touched.jobs ?? []) void reloadProject(id);
  for (const id of touched.removed ?? []) dropProject(id);
  if (touched.todos) window.dispatchEvent(new Event(TODOS_CHANGED));
}

export function useDwight(startId: string | null) {
  const [name, setName] = useState(DEFAULT_NAME);
  const [list, setList] = useState<ConversationSummary[]>([]);
  const [id, setId] = useState<string | null>(startId);
  const [convo, setConvo] = useState<Conversation | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [tick, setTick] = useState(0);
  const [listTick, setListTick] = useState(0);
  // Replies seen while being written: when one finishes, the page picks up what it changed.
  const watching = useRef(new Set<string>());

  useEffect(() => {
    let live = true;
    call<{ name: string; conversations: ConversationSummary[] }>(API)
      .then((r) => {
        if (!live) return;
        setName(r.name);
        setList(r.conversations);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [listTick]);

  useEffect(() => {
    if (!id) return;
    let live = true;
    call<Conversation>(`${API}?id=${id}`)
      .then((c) => {
        if (!live) return;
        for (const m of c.messages) {
          if (m.status === "working") watching.current.add(m.id);
          else if (watching.current.has(m.id)) {
            watching.current.delete(m.id);
            if (m.touched) pickUp(m.touched);
            setListTick((n) => n + 1);
          }
        }
        setConvo(c);
      })
      .catch((e: Error) => {
        if (!live) return;
        setError(e.message);
        setId(null);
        remember(null);
      });
    return () => {
      live = false;
    };
  }, [id, tick]);

  const shown = convo && convo.id === id ? convo : null;
  const working = Boolean(shown?.messages.some((m) => m.status === "working"));
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => setTick((n) => n + 1), 1500);
    return () => clearInterval(t);
  }, [working]);

  return {
    name,
    list,
    conversation: shown,
    working,
    sending,
    error,
    open(next: string | null) {
      setError("");
      setId(next);
      remember(next);
    },
    async send(text: string) {
      setSending(true);
      setError("");
      try {
        const c = await call<Conversation>(API, "POST", {
          conversationId: id ?? undefined,
          text,
          page: { path: window.location.pathname + window.location.search, title: document.title },
        });
        for (const m of c.messages) if (m.status === "working") watching.current.add(m.id);
        setConvo(c);
        setId(c.id);
        remember(c.id);
        setListTick((n) => n + 1);
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      } finally {
        setSending(false);
      }
    },
    async undo(m: DwightMessage) {
      if (!id) return;
      setError("");
      try {
        pickUp(await call<{ jobs: string[]; removed: string[]; todos: boolean }>(`${API}/undo`, "POST", { conversationId: id, messageId: m.id }));
        setTick((n) => n + 1);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    async rename(next: string) {
      const r = await call<{ name: string }>(API, "PUT", { name: next });
      setName(r.name);
    },
    async remove(target: string) {
      await call(`${API}?id=${target}`, "DELETE");
      if (target === id) {
        setId(null);
        remember(null);
      }
      setListTick((n) => n + 1);
    },
  };
}
export type Dwight = ReturnType<typeof useDwight>;

const STARTERS = [
  "How many videos do I need for my tech jobs to cover me until 29 Nov?",
  "What's due this week?",
  "Who still owes me money?",
  "Add this job: ",
];

export function Thread({ d, compact = false, onPick }: { d: Dwight; compact?: boolean; onPick: (text: string) => void }) {
  const end = useRef<HTMLDivElement>(null);
  const messages = d.conversation?.messages ?? [];
  const last = messages.at(-1);
  // Keep the newest in view as it's written.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, last?.text.length, last?.steps?.length]);

  if (!messages.length)
    return (
      <div className="space-y-3 p-4 text-sm">
        <p className="text-text-muted">
          {`Ask ${d.name} anything about your work: what's due, how much to make before a trip, add a job from a brief, mark one paid. It makes the changes (with Undo) and takes you to the right page.`}
        </p>
        <div className="flex flex-col items-start gap-2">
          {STARTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onPick(s)}
              className="rounded-xl border border-border bg-bg px-3 py-1.5 text-left text-xs hover:border-accent hover:text-accent"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    );

  return (
    <div className={`space-y-4 ${compact ? "p-3" : "p-4"} text-sm`} aria-live="polite">
      {messages.map((m) => (m.role === "you" ? <Yours key={m.id} m={m} /> : <Reply key={m.id} m={m} d={d} />))}
      <div ref={end} />
    </div>
  );
}

function Yours({ m }: { m: DwightMessage }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-accent-soft px-3 py-2">{m.text}</p>
    </div>
  );
}

function Reply({ m, d }: { m: DwightMessage; d: Dwight }) {
  const working = m.status === "working";
  return (
    <div className="space-y-2" aria-label={`${d.name}'s reply`} role="article" aria-busy={working}>
      {(m.steps?.length ?? 0) > 0 && (
        <ul className="space-y-0.5 text-xs text-text-dim">
          {m.steps!.map((s, i) => (
            <li key={i} className="flex items-center gap-1.5">
              {working && i === m.steps!.length - 1 && !m.text ? <Spinner /> : <span aria-hidden>·</span>}
              {s}
            </li>
          ))}
        </ul>
      )}
      {working && !m.text && !m.steps?.length && (
        <p className="flex items-center gap-2 text-text-dim">
          <Spinner /> Thinking…
        </p>
      )}
      {m.text && (m.status === "failed" ? <p className="text-accent">{m.text}</p> : <Markdown text={m.text} />)}
      {(m.changes?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-border bg-bg p-2.5 text-xs" aria-label="What changed">
          <div className="flex items-start justify-between gap-2">
            <ul className={`space-y-0.5 ${m.undone ? "text-text-dim line-through" : ""}`}>
              {m.changes!.map((c) => (
                <li key={c}>✓ {c}</li>
              ))}
            </ul>
            {m.undone ? (
              <span className="shrink-0 text-text-dim">Undone</span>
            ) : (
              m.canUndo && (
                <button type="button" onClick={() => void d.undo(m)} className="shrink-0 font-medium text-text-muted underline hover:text-accent">
                  Undo
                </button>
              )
            )}
          </div>
        </div>
      )}
      {(m.links?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {m.links!.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg border border-accent/40 bg-bg-card px-2.5 py-1 text-xs font-medium text-accent hover:border-accent"
            >
              {l.label} →
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function Composer({ d, draft, setDraft }: { d: Dwight; draft: string; setDraft: (v: string) => void }) {
  const busy = d.sending || d.working;
  const send = async () => {
    if (!draft.trim() || busy) return;
    if (await d.send(draft)) setDraft("");
  };
  return (
    <form
      className="border-t border-border p-2"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      {d.error && <p className="px-1 pb-1 text-xs text-accent">{d.error}</p>}
      <div className="flex items-end gap-2">
        <TextBox
          aria-label={`Ask ${d.name}`}
          rows={2}
          value={draft}
          onValue={setDraft}
          placeholder={`Ask ${d.name}… (paste a brief, an email, anything)`}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          className="max-h-40 min-h-[2.75rem] w-full resize-none rounded-xl border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          disabled={busy || !draft.trim()}
          className="shrink-0 rounded-xl bg-accent px-3.5 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50"
          aria-label="Send"
        >
          {busy ? <Spinner /> : "Send"}
        </button>
      </div>
    </form>
  );
}

/** Your conversations, to pick one up again. */
export function History({ d, onOpen }: { d: Dwight; onOpen: (id: string) => void }) {
  if (!d.list.length) return <p className="p-4 text-sm text-text-dim">No conversations yet.</p>;
  return (
    <ul className="divide-y divide-border text-sm" aria-label="Conversations">
      {d.list.map((c) => (
        <li key={c.id} className="flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => onOpen(c.id)}
            className={`min-w-0 flex-1 truncate text-left hover:text-accent ${c.id === d.conversation?.id ? "font-semibold" : ""}`}
          >
            {c.title || "Untitled"}
          </button>
          <span className="shrink-0 text-xs text-text-dim">{new Date(c.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
          <button
            type="button"
            onClick={() => void d.remove(c.id)}
            aria-label={`Delete ${c.title}`}
            className="shrink-0 text-xs text-text-dim hover:text-accent"
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}
