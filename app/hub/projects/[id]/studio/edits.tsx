"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { STATUS_LABEL, WHOLE_SHEET, type Device, type DeviceFile, type EditCard, type EditEvent, type EditFile } from "../../../_lib/edits/types";
import type { SheetSummary } from "../../../_lib/studio/types";
import { input } from "../../fields";
import { call, CopyButton } from "./studio";
import { Tooltip, useConfirm } from "../../../_lib/popups";

/* Edit cards: one per video. Pick the clips (from your Mac's latest videos or
   its file picker), press Edit in CapCut, and the Creator Desk Helper on your
   Mac hands it to your Claude Code and CapCut. The conversation shows here and
   you can reply to it. */

type Data = { edits: EditCard[]; devices: Device[]; files: DeviceFile[] };
const BUSY = new Set(["queued", "editing"]);
/** Claude Code on the Mac needs signing in again (expired or missing login). */
const signedOut = (text: string) => /OAuth|401|authenticat|\/login|not logged in|invalid api key/i.test(text);
const mmss = (s?: number | null) => (s == null ? "" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);

export function Edits({ projectId, sheets }: { projectId: string; sheets: SheetSummary[] }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  // Check often while something's happening on the Mac, gently otherwise.
  const busy = Boolean(data?.edits.some((e) => BUSY.has(e.status) || e.pickRequested));
  useEffect(() => {
    const tick = () =>
      call<Data>(`/api/hub/edits?projectId=${encodeURIComponent(projectId)}`, "GET").then(
        (d) => {
          setData(d);
          setError("");
        },
        (e: Error) => setError(e.message),
      );
    void tick();
    const t = setInterval(tick, busy ? 3000 : 15000);
    return () => clearInterval(t);
  }, [projectId, busy]);

  const replace = (card: EditCard) => setData((d) => d && { ...d, edits: d.edits.map((e) => (e.id === card.id ? card : e)) });

  if (error && !data) return <p className="text-accent">{error}</p>;
  if (!data) return <p className="text-text-muted">Loading edit cards…</p>;
  const mac = data.devices.find((d) => d.online) ?? data.devices[0];

  return (
    <div className="space-y-5">
      <MacBar devices={data.devices} />
      <AddCards projectId={projectId} sheets={sheets} onAdded={(cards) => setData((d) => d && { ...d, edits: [...d.edits.filter((e) => !cards.some((c) => c.id === e.id)), ...cards] })} />
      {data.edits.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-strong bg-bg-card p-4 text-sm text-text-muted">
          No edit cards yet. Make them from a shoot sheet above, or paste a video card from one of your Claude Projects.
        </p>
      ) : (
        <div className="space-y-3">
          {data.edits.map((card) => (
            <Card
              key={card.id}
              card={card}
              files={data.files}
              mac={mac}
              open={open === card.id}
              onToggle={() => setOpen(open === card.id ? null : card.id)}
              onChange={replace}
              onDelete={() => setData((d) => d && { ...d, edits: d.edits.filter((e) => e.id !== card.id) })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MacBar({ devices }: { devices: Device[] }) {
  const mac = devices.find((d) => d.online) ?? devices[0];
  if (!mac) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm">
        <span>Connect your Mac to edit these in CapCut with your Claude Code.</span>
        <Link href="/hub/studio/helper" className="font-medium text-accent hover:underline">
          Connect your Mac →
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-bg-card px-4 py-2.5 text-sm">
      <span className="flex items-center gap-2 font-medium">
        <span className={`h-2 w-2 rounded-full ${mac.online ? "bg-good" : "bg-text-dim"}`} />
        {mac.name} {mac.online ? "is connected" : "is offline - start the helper on it"}
      </span>
      {mac.info.capcut && <span className="text-text-dim">CapCut {mac.info.capcut}</span>}
      {mac.online && mac.info.capcutRunning && <span className="text-warn">CapCut is open - close it so edits can save</span>}
      <Link href="/hub/studio/helper" className="ml-auto text-text-muted hover:text-accent">
        Mac helper
      </Link>
    </div>
  );
}

function AddCards({ projectId, sheets, onAdded }: { projectId: string; sheets: SheetSummary[]; onAdded: (cards: EditCard[]) => void }) {
  const [sheetId, setSheetId] = useState(sheets[0]?.id ?? "");
  const [pasting, setPasting] = useState(false);
  const [brief, setBrief] = useState("");
  const [whole, setWhole] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function add(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const r = await call<{ edits: EditCard[] }>("/api/hub/edits", "POST", { projectId, ...body });
      onAdded(r.edits);
      setBrief("");
      setPasting(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        {sheets.length > 0 && (
          <>
            <select className={`${input} w-auto min-w-0 flex-1 sm:flex-none`} value={sheetId} onChange={(e) => setSheetId(e.target.value)} aria-label="Shoot sheet">
              {sheets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.videos} videos)
                </option>
              ))}
            </select>
            <button type="button" disabled={busy || !sheetId} onClick={() => add({ sheetId })} className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60">
              Make edit cards
            </button>
            <button type="button" disabled={busy || !sheetId} onClick={() => add({ sheetId, whole: true })} className="rounded-xl border border-border px-4 py-2 text-sm hover:border-accent hover:text-accent disabled:opacity-60">
              Edit the whole sheet in one go
            </button>
          </>
        )}
        <button type="button" onClick={() => setPasting(!pasting)} className="rounded-xl border border-border px-4 py-2 text-sm hover:border-accent hover:text-accent">
          {pasting ? "Cancel" : "Paste a card or shoot sheet"}
        </button>
      </div>
      {pasting && (
        <div className="space-y-2">
          <textarea
            rows={8}
            className={input}
            value={brief}
            onChange={(e) => {
              setBrief(e.target.value);
              setWhole(looksLikeWholeSheet(e.target.value));
            }}
            placeholder={'One video: press "Copy everything" on its card and paste it here. A whole week: "Expand all", export the shoot sheet as Markdown, and paste or upload it.'}
            aria-label="Video card"
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs hover:border-accent hover:text-accent">
              Upload a .md or .txt file
              <input
                type="file"
                accept=".md,.markdown,.txt,text/markdown,text/plain"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const t = await f.text();
                  setBrief(t);
                  setWhole(looksLikeWholeSheet(t));
                }}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={whole} onChange={(e) => setWhole(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
              It&apos;s a whole shoot sheet - edit every video in one go
            </label>
          </div>
          <button type="button" disabled={busy || !brief.trim()} onClick={() => add({ brief, whole })} className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60">
            Add card
          </button>
        </div>
      )}
      {error && <p className="text-sm text-accent">{error}</p>}
    </div>
  );
}

/** Several video codes (V1, V2, V3…) usually means a whole shoot sheet rather than one card. */
function looksLikeWholeSheet(text: string) {
  return new Set(text.match(/\bV\d{1,2}\b/g) ?? []).size >= 3;
}

function Card({
  card,
  files,
  mac,
  open,
  onToggle,
  onChange,
  onDelete,
}: {
  card: EditCard;
  files: DeviceFile[];
  mac: Device | undefined;
  open: boolean;
  onToggle: () => void;
  onChange: (c: EditCard) => void;
  onDelete: () => void;
}) {
  const [error, setError] = useState("");
  const confirm = useConfirm();
  const api = `/api/hub/edits/${card.id}`;
  async function act(fn: () => Promise<{ edit?: EditCard } | unknown>) {
    setError("");
    try {
      const r = (await fn()) as { edit?: EditCard };
      if (r?.edit) onChange(r.edit);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  const setFiles = (next: EditFile[]) => act(() => call(api, "PATCH", { files: next }));
  const tone =
    card.status === "ready" || card.status === "done"
      ? "bg-good-soft text-good"
      : card.status === "needs_you" || card.status === "failed"
        ? "bg-warn-soft text-warn"
        : BUSY.has(card.status)
          ? "bg-accent-soft text-accent"
          : "bg-text/5 text-text-dim";

  return (
    <article className="rounded-2xl border border-border bg-bg-card">
      <button type="button" onClick={onToggle} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left" aria-expanded={open}>
        {card.videoCode === WHOLE_SHEET ? (
          <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent">Whole sheet</span>
        ) : (
          card.videoCode && <span className="rounded-md bg-bg-elevated px-1.5 py-0.5 font-mono text-xs">{card.videoCode}</span>
        )}
        <span className="min-w-0 flex-1 truncate font-medium">{card.title || "Untitled video"}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{STATUS_LABEL[card.status]}</span>
        {card.files.length > 0 && <span className="text-xs text-text-dim">{card.files.length} clip{card.files.length === 1 ? "" : "s"}</span>}
      </button>
      {open && (
        <div className="space-y-4 border-t border-border px-4 py-4">
          {card.draftName && (
            <p className="rounded-xl bg-good-soft px-3 py-2 text-sm text-good">
              {card.draftName.includes(", ") ? "Drafts" : "Draft"} in CapCut: <strong>{card.draftName}</strong>
            </p>
          )}

          <ClipPicker
            card={card}
            files={files}
            mac={mac}
            setFiles={setFiles}
            onPick={(mode) => act(() => call(`${api}/pick`, "POST", { mode }))}
            onCancelPick={() => act(() => call(`${api}/pick`, "DELETE"))}
          />

          <div className="flex flex-wrap items-center gap-2">
            {BUSY.has(card.status) ? (
              <button type="button" onClick={() => act(() => call(`${api}/stop`, "POST"))} className="rounded-xl border border-border px-4 py-2 text-sm hover:border-accent hover:text-accent">
                Stop
              </button>
            ) : (
              <Tooltip label={!mac ? "Connect your Mac first" : !card.files.length ? "Pick the clips first" : null}>
                <button
                  type="button"
                  disabled={!card.files.length || !mac}
                  onClick={() => act(() => call(`${api}/run`, "POST", { fresh: card.status === "ready" || card.status === "done" || card.status === "failed" }))}
                  className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50"
                >
                  {card.status !== "todo" ? "Edit again from scratch" : card.videoCode === WHOLE_SHEET ? "Edit all the videos in CapCut" : "Edit in CapCut"}
                </button>
              </Tooltip>
            )}
            {card.status === "ready" && (
              <button type="button" onClick={() => act(() => call(api, "PATCH", { status: "done" }))} className="rounded-xl border border-border px-4 py-2 text-sm hover:border-good hover:text-good">
                Looks good - done
              </button>
            )}
            <CopyButton text={card.brief} label="Copy everything" />
            <button
              type="button"
              onClick={async () => {
                if (!(await confirm({ title: "Delete this edit card?", message: "The CapCut draft stays on your Mac.", confirmLabel: "Delete", danger: true }))) return;
                void call(api, "DELETE").then(onDelete, (e: Error) => setError(e.message));
              }}
              className="ml-auto text-sm text-text-dim hover:text-accent"
            >
              Delete card
            </button>
          </div>
          {error && <p className="text-sm text-accent">{error}</p>}

          <details className="rounded-xl border border-border">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">{card.videoCode === WHOLE_SHEET ? "Shoot sheet" : "Video card"}</summary>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-border px-3 py-2 font-sans text-sm text-text-muted">{card.brief}</pre>
          </details>

          <Conversation card={card} onChange={onChange} />
        </div>
      )}
    </article>
  );
}

function ClipPicker({
  card,
  files,
  mac,
  setFiles,
  onPick,
  onCancelPick,
}: {
  card: EditCard;
  files: DeviceFile[];
  mac: Device | undefined;
  setFiles: (f: EditFile[]) => void;
  onPick: (mode: "files" | "folder") => void;
  onCancelPick: () => void;
}) {
  const [browsing, setBrowsing] = useState(false);
  const chosen = new Set(card.files.map((f) => f.path));
  const toggle = (f: DeviceFile) =>
    setFiles(chosen.has(f.path) ? card.files.filter((x) => x.path !== f.path) : [...card.files, { path: f.path, name: f.name, duration: f.duration }]);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">Clips</p>
        <button type="button" disabled={!files.length} onClick={() => setBrowsing(!browsing)} className="rounded-lg border border-border px-3 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-50">
          {browsing ? "Hide your latest clips" : "From your latest clips"}
        </button>
        {card.pickRequested ? (
          <span className="flex items-center gap-2 text-xs text-accent">
            Look at your Mac - the {card.pickMode === "folder" ? "folder" : "file"} picker is open.
            <button type="button" onClick={onCancelPick} className="text-text-dim underline">
              Cancel
            </button>
          </span>
        ) : (
          <>
            <Tooltip label={mac?.online ? null : "Start the helper on your Mac first"}>
              <button type="button" disabled={!mac?.online} onClick={() => onPick("files")} className="rounded-lg border border-border px-3 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-50">
                Choose on my Mac…
              </button>
            </Tooltip>
            <Tooltip label={mac?.online ? null : "Start the helper on your Mac first"}>
              <button type="button" disabled={!mac?.online} onClick={() => onPick("folder")} className="rounded-lg border border-border px-3 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-50">
                Choose a folder…
              </button>
            </Tooltip>
          </>
        )}
      </div>
      {card.files.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {card.files.map((f) => (
            <li key={f.path} className="flex max-w-full items-center gap-1.5 rounded-full bg-bg-elevated py-1 pl-3 pr-1.5 text-xs">
              <Tooltip label={f.path} className="min-w-0">
                <span className="truncate">{f.name}</span>
              </Tooltip>
              {f.duration ? <span className="text-text-dim">{mmss(f.duration)}</span> : null}
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(card.files.filter((x) => x.path !== f.path))} className="rounded-full px-1 text-text-dim hover:text-accent">
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-text-dim">No clips yet. Videos stay on your Mac - only their names go to Creator Desk.</p>
      )}
      {browsing && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {files.map((f) => (
            <Tooltip key={f.path} label={f.path} className="min-w-0">
              <button
                type="button"
                onClick={() => toggle(f)}
                className={`w-full min-w-0 overflow-hidden rounded-lg border text-left text-[11px] ${chosen.has(f.path) ? "border-accent ring-2 ring-accent" : "border-border hover:border-border-strong"}`}
                aria-pressed={chosen.has(f.path)}
              >
                {f.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.thumb} alt="" className="aspect-[9/16] w-full bg-bg-elevated object-cover" />
                ) : (
                  <div className="aspect-[9/16] w-full bg-bg-elevated" />
                )}
                <span className="block truncate px-1.5 pt-1">{f.name}</span>
                <span className="block truncate px-1.5 pb-1 text-text-dim">
                  {mmss(f.duration)} {f.modifiedAt && `· ${new Date(f.modifiedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                </span>
              </button>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  );
}

function Conversation({ card, onChange }: { card: EditCard; onChange: (c: EditCard) => void }) {
  const [events, setEvents] = useState<EditEvent[]>([]);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const last = useRef(0);
  const live = BUSY.has(card.status) || card.status === "needs_you";

  const load = useCallback(async () => {
    const r = await call<{ edit: EditCard; events: EditEvent[] }>(`/api/hub/edits/${card.id}?after=${last.current}`, "GET");
    if (r.events.length) {
      last.current = Math.max(last.current, r.events[r.events.length - 1].id);
      // Two checks can overlap; keep each event once.
      setEvents((e) => {
        const seen = new Set(e.map((x) => x.id));
        return [...e, ...r.events.filter((x) => !seen.has(x.id))];
      });
    }
    return r.edit;
  }, [card.id]);
  useEffect(() => {
    void load().catch(() => {});
    if (!live) return;
    const t = setInterval(() => void load().then((c) => c.status !== card.status && onChange(c)).catch(() => {}), 2500);
    return () => clearInterval(t);
  }, [load, live, card.status, onChange]);

  async function send() {
    setError("");
    try {
      await call(`/api/hub/edits/${card.id}/message`, "POST", { text: reply });
      setReply("");
      onChange({ ...card, status: "editing" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!events.length && card.status === "todo") return null;
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">With Claude on your Mac</p>
      <ol className="max-h-[28rem] space-y-2 overflow-y-auto rounded-xl bg-bg-elevated p-3 text-sm">
        {events.map((e, i) =>
          // A failed run repeats Claude's last message as the error: show it once.
          e.kind === "assistant" && events[i + 1]?.kind === "error" && events[i + 1].text === e.text ? null : e.kind === "tool" || e.kind === "status" ? (
            <li key={e.id} className="text-xs text-text-dim">
              {e.text}
            </li>
          ) : (
            <li
              key={e.id}
              className={`whitespace-pre-wrap break-words rounded-xl px-3 py-2 ${
                e.kind === "user" ? "ml-8 bg-accent text-on-accent" : e.kind === "error" ? "bg-warn-soft text-warn" : e.kind === "done" ? "bg-good-soft text-good" : "mr-8 bg-bg-card"
              }`}
            >
              {e.text}
              {e.kind === "error" && signedOut(e.text) && (
                <span className="mt-2 block text-text">
                  Claude Code on your Mac has been signed out (this happens every so often). On your Mac, open Terminal, type <code className="rounded bg-bg-card px-1">claude</code> and
                  press Enter, then type <code className="rounded bg-bg-card px-1">/login</code> and follow the steps in your browser. Once it says you&apos;re logged in, come back
                  here and press <strong>Edit again from scratch</strong>.
                </span>
              )}
            </li>
          ),
        )}
        {BUSY.has(card.status) && <li className="text-xs text-accent">{card.status === "queued" ? "Waiting for your Mac to pick it up…" : "Working…"}</li>}
      </ol>
      {card.status !== "todo" && card.status !== "queued" && (
        <div className="flex gap-2">
          <textarea
            rows={2}
            className={`${input} flex-1`}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={card.status === "needs_you" ? "Answer Claude…" : "Ask for a change, e.g. make the hook text bigger"}
            aria-label="Reply to Claude"
          />
          <button type="button" disabled={!reply.trim()} onClick={send} className="self-end rounded-xl bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50">
            Send
          </button>
        </div>
      )}
      {error && <p className="text-sm text-accent">{error}</p>}
    </div>
  );
}
