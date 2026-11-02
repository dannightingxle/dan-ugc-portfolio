"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AssistMessage } from "../../../_lib/studio/assistant";
import { useTask, useTasks } from "../../../_lib/studio/tasks-client";
import { TextBox } from "../../../_lib/text-box";
import { Spinner } from "../../../_lib/ui";

/* Ask Claude about this job: it sees the job's files, set up, details and
   lists, answers, and makes the changes you ask for (or that what you tell it
   settles) - each answer says what changed, with Undo on the latest. Runs in
   the background, so you can leave the page while it works. */

const SUGGESTIONS = ["Here's the email I signed up with: …", "Which of the client questions still matter?", "What do I need to do before my first post?"];

export function JobAssistant({ projectId, brand, tab, prefill, onChanged, onClose }: { projectId: string; brand: string; tab: string; prefill?: string; onChanged: () => void; onClose: () => void }) {
  const api = `/api/hub/studio/${projectId}/assist`;
  const [messages, setMessages] = useState<AssistMessage[] | null>(null);
  const [text, setText] = useState(prefill ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const { start } = useTasks();
  const task = useTask(projectId, "assist");
  const thinking = sending || task?.status === "running";
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(api, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setMessages(json.messages);
    else setError(json.error ?? "Couldn't load the conversation.");
  }, [api]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);
  // A new prefill (from "Answer these with Claude") replaces an empty box.
  const [seenPrefill, setSeenPrefill] = useState(prefill);
  if (prefill !== seenPrefill) {
    setSeenPrefill(prefill);
    if (prefill && !text.trim()) setText(prefill);
  }
  // When Claude has answered: the conversation, and the job's changes, on the page.
  const finished = task?.status === "done" || task?.status === "failed" ? task.finishedAt : null;
  const seen = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (seen.current === undefined) {
      seen.current = finished;
      return;
    }
    if (!finished || finished === seen.current) return;
    seen.current = finished;
    void load();
    onChanged();
  }, [finished, load, onChanged]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages, thinking]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim() || thinking) return;
    setSending(true);
    setError("");
    const mine = text.trim();
    setMessages((m) => [...(m ?? []), { id: "pending", role: "you", text: mine, at: new Date().toISOString() }]);
    setText("");
    try {
      await start(api, { text: mine, tab });
      await load();
    } catch (err) {
      setError((err as Error).message);
      setText(mine);
      await load();
    } finally {
      setSending(false);
    }
  }
  async function undo(id: string) {
    const res = await fetch(`${api}/undo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messageId: id }) });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setMessages(json.messages);
      onChanged();
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border bg-bg-card p-4">
        <div>
          <p className="font-semibold">Ask Claude about {brand}</p>
          <p className="text-xs text-text-muted">It sees this job&apos;s files, set up and details, and can change them for you.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close Ask Claude" className="shrink-0 rounded-full px-2 py-1 text-xs text-text-dim hover:bg-bg-elevated hover:text-accent">
          ✕
        </button>
      </div>
      <div role="log" aria-label="Conversation with Claude" className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
        {messages === null ? (
          <p className="flex items-center gap-2 text-sm text-text-muted">
            <Spinner /> Loading…
          </p>
        ) : messages.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-text-muted">Answer what set up left open, paste a client&apos;s reply, or ask anything about the job.</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => setText(s.replace(/: …$/, ": "))} className="rounded-full border border-border px-3 py-1 text-xs hover:border-accent hover:text-accent">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={m.role === "you" ? "flex justify-end" : ""}>
              <div
                className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm ${
                  m.role === "you" ? "bg-accent text-on-accent" : m.failed ? "border border-accent/30 bg-accent-soft text-accent" : "border border-border bg-bg-card"
                }`}
              >
                {m.text}
                {m.changes && m.changes.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
                    {m.changes.map((c) => (
                      <span key={c} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${c === "Undone" ? "bg-text/5 text-text-dim" : "bg-accent-soft text-accent"}`}>
                        {c === "Undone" ? "Undone" : `✓ ${c}`}
                      </span>
                    ))}
                    {m.canUndo && (
                      <button type="button" onClick={() => void undo(m.id)} className="ml-auto text-xs font-medium text-text-muted underline hover:text-accent">
                        Undo
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {thinking && (
          <p className="flex items-center gap-2 text-sm text-text-muted">
            <Spinner />
            {task?.status === "running" && task.step && task.step !== "Starting" ? `${task.step}…` : "Claude is reading the job…"}
          </p>
        )}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="shrink-0 space-y-2 border-t border-border bg-bg-card p-3">
        <TextBox
          aria-label="Message to Claude"
          rows={3}
          value={text}
          onValue={setText}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Ask, or tell it something about the job…"
          className="w-full resize-none rounded-xl border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-text-dim">Enter to send · Shift+Enter for a new line</p>
          <button disabled={thinking || !text.trim()} className="rounded-xl bg-accent px-4 py-1.5 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60">
            Send
          </button>
        </div>
        {error && <p className="text-sm text-accent">{error}</p>}
      </form>
    </div>
  );
}
