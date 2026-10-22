"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ALL_EDITS, type EditNote, type NotesChatMessage } from "../../_lib/edits/types";
import { BRAND_ID } from "../../_lib/studio/brand-types";
import { isArchived, useProjects } from "../../_lib/store";
import { input } from "../../projects/fields";
import { CHAT_KEYS_HINT, chatKeys } from "../../_lib/chat-keys";
import { call } from "../../projects/[id]/studio/studio";
import { TextBox } from "../../_lib/text-box";

/* Editing notes: how you want your videos edited, remembered for every future
   edit - like telling Claude Code to remember something. Feedback comes from
   edit chats (Claude saves the lasting bits), from the chat here, or typed in
   as a note. For one job, or for all your edits. */

type Notes = { notes: EditNote[]; chat: NotesChatMessage[]; all?: EditNote[] };
const FROM: Record<EditNote["from"], string> = { edit: "from an edit", chat: "from the chat", you: "added by you" };

export function NotesPage() {
  const { projects } = useProjects();
  const [scope, setScope] = useState(useSearchParams().get("scope") || ALL_EDITS);
  const jobs = projects.filter((p) => !isArchived(p));
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/hub/studio" className="text-sm text-text-muted hover:text-accent">
          ← Studio
        </Link>
        <h1 className="mt-2 font-serif text-4xl italic sm:text-5xl">Editing notes</h1>
        <p className="mt-2 text-text-muted">
          How you want your videos edited. Every edit on your Mac follows these, and they build up as you go: when you give feedback in an edit&apos;s chat that should stick (&ldquo;captions are always
          too big&rdquo;), Claude saves it here. Or tell Claude below, any time.
        </p>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Notes for</span>
        <select className={input} value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Notes for">
          <option value={ALL_EDITS}>All my edits</option>
          <option value={BRAND_ID}>Personal brand</option>
          {jobs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.brand || p.title || "Job"}
            </option>
          ))}
        </select>
      </label>
      <EditingNotes key={scope} scope={scope} />
    </div>
  );
}

/** One scope's notes and its feedback chat. */
export function EditingNotes({ scope, compact = false }: { scope: string; compact?: boolean }) {
  const [data, setData] = useState<Notes | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState("");
  const [adding, setAdding] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const api = `/api/hub/edits/notes`;

  useEffect(() => {
    call<Notes>(`${api}?scope=${encodeURIComponent(scope)}`, "GET").then(setData, (e: Error) => setError(e.message));
  }, [api, scope]);
  useEffect(() => {
    if (pending || data?.chat.length) end.current?.scrollIntoView({ block: "nearest" });
  }, [pending, data?.chat.length]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const text = message.trim();
    if (!text || pending) return;
    setPending(text);
    setMessage("");
    setError("");
    try {
      const r = await call<Notes>(`${api}/chat`, "POST", { scope, message: text });
      setData((d) => ({ ...d, ...r }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMessage(text);
    } finally {
      setPending("");
    }
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!adding.trim()) return;
    try {
      const r = await call<Notes>(api, "POST", { scope, text: adding });
      setData((d) => ({ ...d, ...r }));
      setAdding("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }
  async function remove(n: EditNote) {
    setData((d) => d && { ...d, notes: d.notes.filter((x) => x.id !== n.id) });
    await call(`${api}?scope=${encodeURIComponent(scope)}&id=${n.id}`, "DELETE").catch((err: Error) => setError(err.message));
  }

  if (!data) return error ? <p className="text-sm text-accent">{error}</p> : <p className="text-sm text-text-muted">Loading notes…</p>;
  return (
    <div className="space-y-4">
      <section className={compact ? "space-y-2" : "space-y-3 rounded-2xl border border-border bg-bg-card p-5"} aria-label="Notes">
        {!compact && <h2 className="font-serif text-2xl">Notes</h2>}
        {data.notes.length === 0 ? (
          <p className="text-sm text-text-dim">None yet. They&apos;ll build up from your feedback.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.notes.map((n) => (
              <li key={n.id} className="flex items-start gap-2 rounded-lg bg-bg-elevated px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  {n.text}
                  <span className="ml-2 text-xs text-text-dim">{FROM[n.from]}</span>
                </span>
                <button type="button" onClick={() => remove(n)} aria-label={`Delete note: ${n.text}`} className="shrink-0 px-1 text-text-dim hover:text-accent">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={add} className="flex gap-2">
          <input className={`${input} flex-1`} value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Add a note yourself, e.g. Cuts: no jump cut in the first second" aria-label="Add a note" maxLength={500} />
          <button disabled={!adding.trim()} className="shrink-0 rounded-xl border border-border px-3 text-sm hover:border-accent hover:text-accent disabled:opacity-50">
            Add
          </button>
        </form>
        {scope !== ALL_EDITS && (data.all?.length ?? 0) > 0 && (
          <p className="text-xs text-text-dim">
            Your {data.all!.length} note{data.all!.length === 1 ? "" : "s"} for{" "}
            <Link href={`/hub/studio/notes?scope=${ALL_EDITS}`} className="text-accent hover:underline">
              all your edits
            </Link>{" "}
            apply too.
          </p>
        )}
      </section>

      <section className={compact ? "space-y-2" : "space-y-3 rounded-2xl border border-border bg-bg-card p-5"} aria-label="Tell Claude">
        {!compact && <h2 className="font-serif text-2xl">Tell Claude</h2>}
        <p className="text-xs text-text-dim">Say what you&apos;d change in your own words; Claude turns it into notes (and rewrites or drops ones it changes).</p>
        {(data.chat.length > 0 || pending) && (
          <ol className="max-h-80 space-y-2 overflow-y-auto" aria-label="Notes chat">
            {data.chat.map((m, i) => (
              <li key={m.at + i} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.role === "you" ? "ml-auto rounded-tr-sm bg-accent-soft" : "rounded-tl-sm bg-bg-elevated"}`}>
                {m.text}
              </li>
            ))}
            {pending && (
              <>
                <li className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-accent-soft px-3 py-2 text-sm">{pending}</li>
                <li className="max-w-[85%] rounded-2xl rounded-tl-sm bg-bg-elevated px-3 py-2 text-sm text-text-muted">Updating your notes…</li>
              </>
            )}
            <div ref={end} />
          </ol>
        )}
        <form onSubmit={send} className="space-y-2">
          <TextBox
            rows={3}
            className={input}
            value={message}
            onValue={(v) => setMessage(v)}
            onKeyDown={chatKeys(() => void send(), setMessage)}
            placeholder="e.g. The captions are too big and sit too low - keep them smaller, centred, and never over my face"
            aria-label="Feedback for Claude"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button disabled={!message.trim() || Boolean(pending)} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60">
              Send
            </button>
            <span className="text-xs text-text-dim">{CHAT_KEYS_HINT}</span>
          </div>
        </form>
        {error && <p className="text-sm text-accent">{error}</p>}
      </section>
    </div>
  );
}
