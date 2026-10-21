"use client";

import { useState } from "react";
import { shortDate } from "../../../_lib/ui";
import { useConfirm } from "../../../_lib/popups";
import type { ChatMessage, ChatSummary, SheetChat } from "../../../_lib/studio/chats";
import { input } from "../../fields";

/* A shoot sheet as a chat, like one in a Claude Project: what you asked for,
   what Claude made or why it couldn't, and your replies - changes to the
   sheet, more context, or "try again". Earlier chats are listed underneath. */

export type OpenChat = Omit<SheetChat, "input"> & { attached: string[] };

/** Links Claude couldn't open, each once, with a reason shared by several shown once above them. */
export function CouldntOpen({ items, after }: { items: string[]; after?: string }) {
  const groups = new Map<string, string[]>();
  for (const item of items) {
    const m = /^(https?:\/\/\S+)\s+[-–—]\s+([\s\S]+)$/.exec(item.trim());
    const [what, why] = m ? [m[1], m[2].trim()] : [item, ""];
    groups.set(why, [...(groups.get(why) ?? []), what]);
  }
  return (
    <div className="space-y-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
      <p className="font-semibold">Claude couldn&apos;t open:</p>
      {[...groups].map(([why, whats]) =>
        why && whats.length > 1 ? (
          <div key={why}>
            <p>
              {whats.length} links - {why}
            </p>
            <ul className="list-disc pl-5">
              {whats.map((w) => (
                <li key={w} className="break-all">
                  {w}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ul key={why || whats[0]} className="list-disc pl-5">
            {whats.map((w) => (
              <li key={w} className="break-words">
                <span className="break-all">{w}</span>
                {why && ` - ${why}`}
              </li>
            ))}
          </ul>
        ),
      )}
      {after && <p>{after}</p>}
    </div>
  );
}

export function ChatView({
  chat,
  busy,
  writing,
  stopped,
  error,
  onReply,
  onNew,
  goEdits,
}: {
  chat: OpenChat | null;
  busy: boolean;
  /** "Reading the linked pages… 0:12" while Claude works on this chat. */
  writing: string | null;
  /** Why the last run stopped without a word from Claude (cut off, say). */
  stopped: string;
  error: string;
  onReply: (text: string) => Promise<boolean>;
  onNew: () => void;
  goEdits?: () => void;
}) {
  const [reply, setReply] = useState("");
  const messages = chat?.messages ?? [];
  const last = messages.at(-1);
  const hasSheet = Boolean(chat?.sheetId);
  const lastSheet = [...messages].reverse().find((m) => m.sheetId);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim() || busy) return;
    if (await onReply(reply.trim())) setReply("");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 truncate font-semibold">{chat?.title ?? "New shoot sheet"}</h3>
        <button type="button" onClick={onNew} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:border-accent hover:text-accent">
          + New shoot sheet
        </button>
      </div>
      <ol className="space-y-3" aria-label="Conversation">
        {messages.map((m, i) => (
          <Message key={m.at + i} m={m} first={i === 0} attached={i === 0 ? (chat?.attached ?? []) : []} latestSheet={m === lastSheet} goEdits={goEdits} />
        ))}
        {writing && (
          <li className="max-w-[85%] rounded-2xl rounded-tl-sm bg-bg-elevated px-4 py-3 text-sm text-text-muted">
            <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent align-[-1px]" aria-hidden />
            {writing}
            <span className="mt-1 block text-xs text-text-dim">Running in the background: you can leave this page, or start something on another job.</span>
          </li>
        )}
        {!writing && last?.role === "you" && (
          <li className="max-w-[85%] rounded-2xl rounded-tl-sm bg-warn-soft px-4 py-3 text-sm text-warn">
            {stopped || "This one didn't finish."} Reply below to try again.
          </li>
        )}
      </ol>
      <form onSubmit={send} className="space-y-2">
        <label className="block">
          <span className="sr-only">Reply to Claude</span>
          <textarea
            rows={3}
            className={input}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send(e);
            }}
            aria-label="Reply to Claude"
            placeholder={
              hasSheet
                ? "Ask for changes: swap video 3 for a street interview, shorter hooks, add the new deadline…"
                : "Add what was missing (paste the brief's text, a working link), or just say try again…"
            }
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={busy || !reply.trim()} className="rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-on-accent transition hover:bg-accent-hover disabled:opacity-60">
            {hasSheet ? "Change the sheet" : "Send and try again"}
          </button>
          <span className="text-xs text-text-dim">
            {busy && !writing ? "Another shoot sheet is being written for this job - reply when it's done." : hasSheet ? "Claude changes this sheet as you ask and keeps the rest." : "Claude makes the sheet again with what you add."}
          </span>
        </div>
        {error && <p className="text-sm text-accent">{error}</p>}
      </form>
    </div>
  );
}

function Message({ m, first, attached, latestSheet, goEdits }: { m: ChatMessage; first: boolean; attached: string[]; latestSheet: boolean; goEdits?: () => void }) {
  if (m.role === "you") {
    return (
      <li className="ml-auto max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-accent-soft px-4 py-3 text-sm">
        <span className="mb-1 block text-xs font-semibold text-text-dim">{first ? "You asked for" : "You"}</span>
        {m.text}
        {attached.length > 0 && !m.text.includes("Attached:") && <span className="mt-1 block text-xs text-text-dim">Attached: {attached.join(", ")}</span>}
      </li>
    );
  }
  if (m.failed) {
    return (
      <li className="max-w-[85%] rounded-2xl rounded-tl-sm bg-warn-soft px-4 py-3 text-sm text-warn">
        <span className="mb-1 block text-xs font-semibold">Claude</span>
        {m.text}
        <span className="mt-1 block text-xs">Add what&apos;s missing below, or just say try again.</span>
      </li>
    );
  }
  return (
    <li className="max-w-[85%] space-y-2 rounded-2xl rounded-tl-sm bg-good-soft px-4 py-3 text-sm text-good">
      <span className="block text-xs font-semibold">Claude</span>
      <p>{m.text.trim().replace(/([^.!?])$/, "$1.")}</p>
      {(m.couldntOpen ?? []).length > 0 && <CouldntOpen items={m.couldntOpen ?? []} after="If any of these matter, paste their text or a working link in a reply and Claude will work them in." />}
      {m.sheetId && (
        <div className="flex flex-wrap gap-4">
          <a href={`/hub/studio/sheets/${m.sheetId}`} target="_blank" rel="noopener" className="font-semibold underline">
            Open the shoot sheet →
          </a>
          {latestSheet && goEdits && (
            <button type="button" onClick={goEdits} className="font-semibold underline">
              Edit cards are ready - once you&apos;ve filmed, edit them →
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/** Earlier shoot sheet chats for this job. */
export function ChatList({ chats, openId, runningId, onOpen, onDelete }: { chats: ChatSummary[]; openId: string | null; runningId?: string; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  const confirm = useConfirm();
  if (!chats.length) return null;
  return (
    <ul className="divide-y divide-border" aria-label="Shoot sheet chats">
      {chats.map((c) => {
        const state =
          c.id === runningId ? ["Writing…", "text-accent"] : !c.last || c.last.role === "you" ? ["Didn't finish", "text-warn"] : c.last.failed ? ["Needs you", "text-warn"] : ["Sheet ready", "text-good"];
        return (
          <li key={c.id} className={`flex items-center gap-2 py-2 ${c.id === openId ? "font-semibold" : ""}`}>
            <button type="button" onClick={() => onOpen(c.id)} className="min-w-0 flex-1 text-left hover:text-accent" aria-current={c.id === openId ? "true" : undefined}>
              <span className="block truncate">{c.title}</span>
              <span className="text-xs font-normal text-text-dim">
                <span className={state[1]}>{state[0]}</span> · {shortDate(c.updatedAt)}
              </span>
            </button>
            {c.id !== runningId && (
              <button
                type="button"
                aria-label={`Delete chat ${c.title}`}
                onClick={async () => {
                  if (!(await confirm({ title: "Delete this chat?", message: "Its shoot sheet stays in the list below.", confirmLabel: "Delete", danger: true }))) return;
                  onDelete(c.id);
                }}
                className="shrink-0 px-1 text-xs text-text-dim hover:text-accent"
              >
                ✕
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
