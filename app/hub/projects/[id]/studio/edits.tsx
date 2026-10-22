"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { HELPER_FOR_LIBRARY, LATEST_HELPER, LIBRARY_LINE, STATUS_LABEL, WHOLE_SHEET, findsOwnClips, helperOlderThan, mediaKind, type MediaKind, type Device, type DeviceFile, type EditCard, type EditEvent, type EditFile } from "../../../_lib/edits/types";
import type { SheetSummary } from "../../../_lib/studio/types";
import { input } from "../../fields";
import { call, CopyButton } from "./studio";
import { Tooltip, useConfirm } from "../../../_lib/popups";
import { EditingNotes } from "../../../studio/notes/notes";
import { StylePicker } from "../../../studio/styles/style-picker";
import { CHAT_KEYS_HINT, chatKeys } from "../../../_lib/chat-keys";
import { TextBox } from "../../../_lib/text-box";
import { Busy, Spinner, useBusy } from "../../../_lib/ui";

/* Edit cards: one per video. Pick the clips (from your Mac's latest videos or
   its file picker), press Edit in CapCut, and the Creator Desk Helper on your
   Mac hands it to your Claude Code and CapCut. The conversation shows here and
   you can reply to it. On a wide Studio page a card opens in the right-hand
   panel like a chat (EditPanel); otherwise it opens in place. */

type Data = { edits: EditCard[]; devices: Device[]; files: DeviceFile[]; folder?: string };
const BUSY = new Set(["queued", "editing"]);
/** Claude Code on the Mac needs signing in again (expired or missing login). */
const signedOut = (text: string) => /OAuth|401|authenticat|\/login|not logged in|invalid api key/i.test(text);
const MAC_KEY = "cd-edit-mac";
/** Connected Macs first, then the newest helper (the likeliest to be the one you're on). */
const sortMacs = (devices: Device[]) =>
  [...devices].sort((a, b) => Number(b.online) - Number(a.online) || (helperOlderThan(a.info.helper, b.info.helper ?? "0.0.0") ? 1 : helperOlderThan(b.info.helper, a.info.helper ?? "0.0.0") ? -1 : 0));
const mmss = (s?: number | null) => (s == null ? "" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);

/** A job's edit cards, its Macs and their latest files, kept fresh while `enabled` (the list or the panel is showing).
    Studio holds one so the Edits tab and the right-hand panel share it. */
export function useEditsData(projectId: string, enabled = true) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  // With more than one Mac connected, which one edits (remembered in this browser).
  const [macId, setMacId] = useState<string | null>(() => {
    try {
      return typeof window === "undefined" ? null : localStorage.getItem(MAC_KEY);
    } catch {
      return null;
    }
  });
  const chooseMac = (id: string) => {
    setMacId(id);
    try {
      localStorage.setItem(MAC_KEY, id);
    } catch {}
  };

  // Check often while something's happening on the Mac, gently otherwise.
  const busy = Boolean(data?.edits.some((e) => BUSY.has(e.status) || e.pickRequested));
  useEffect(() => {
    if (!enabled) return;
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
  }, [projectId, busy, enabled]);

  const replace = useCallback((card: EditCard) => setData((d) => d && { ...d, edits: d.edits.map((e) => (e.id === card.id ? card : e)) }), []);
  const remove = useCallback((id: string) => setData((d) => d && { ...d, edits: d.edits.filter((e) => e.id !== id) }), []);
  // New cards go to the top straight away, as they will be once the list is checked again (newest first,
  // with the rest of the same shoot sheet's cards kept beside them).
  const add = useCallback(
    (cards: EditCard[]) =>
      setData((d) => {
        if (!d) return d;
        const sheets = new Set(cards.map((c) => c.sheetId).filter(Boolean));
        const rest = d.edits.filter((e) => !cards.some((c) => c.id === e.id));
        const sameSheet = rest.filter((e) => e.sheetId && sheets.has(e.sheetId));
        return { ...d, edits: [...cards, ...sameSheet, ...rest.filter((e) => !sameSheet.includes(e))] };
      }),
    [],
  );
  const setFolder = useCallback((folder: string) => setData((d) => d && { ...d, folder }), []);

  const macs = data ? sortMacs(data.devices) : [];
  const mac = macs.find((d) => d.id === macId && d.online) ?? macs[0];
  // Your latest clips, from the Mac doing the editing.
  const files = (data?.files ?? []).filter((f) => !mac || !f.deviceId || f.deviceId === mac.id);
  return { data, error, macs, mac, files, chooseMac, replace, remove, add, setFolder };
}

export type EditsData = ReturnType<typeof useEditsData>;

/** The Edits tab on its own, opening cards in place (the personal brand's Studio). */
export function Edits({ projectId, sheets, onTrials }: { projectId: string; sheets: SheetSummary[]; onTrials?: () => void }) {
  const store = useEditsData(projectId);
  return <EditsList store={store} projectId={projectId} sheets={sheets} onTrials={onTrials} />;
}

/** "V3 · Morning routine": an edit card's name in a tab or heading. */
export const editName = (card: EditCard) => `${card.videoCode && card.videoCode !== WHOLE_SHEET ? `${card.videoCode} · ` : ""}${card.title || "Untitled video"}`;

/** onTrials: set on the personal brand, where finished edits can become trial reels.
    panel: on a wide Studio page, cards open in the right-hand panel instead of in place (openId is the one showing there). */
export function EditsList({
  store,
  projectId,
  sheets,
  onTrials,
  panel,
}: {
  store: EditsData;
  projectId: string;
  sheets: SheetSummary[];
  onTrials?: () => void;
  panel?: { openId: string | null; onOpen: (id: string | null) => void };
}) {
  const { data, error, macs, mac, files, chooseMac, replace, remove, add, setFolder } = store;
  // A link can open one card (?edit=<id>, from the Edits page or a pop-up).
  const linked = useSearchParams().get("edit");
  const [open, setOpen] = useState<string | null>(linked);
  const inPanel = Boolean(panel);

  const loaded = Boolean(data);
  useEffect(() => {
    // In the panel the card you clicked is already in view: only scroll for one a link opened.
    if (loaded && linked) document.getElementById(`edit-${linked}`)?.scrollIntoView({ block: inPanel ? "nearest" : "start" });
  }, [loaded, linked, inPanel]);

  if (error && !data) return <p className="text-accent">{error}</p>;
  if (!data)
    return (
      <p className="flex items-center gap-2 text-text-muted">
        <Spinner />
        Loading edit cards…
      </p>
    );

  return (
    <div className="space-y-5">
      <MacBar devices={macs} mac={mac} onChoose={chooseMac} />
      {mac && <FolderSetting projectId={projectId} folder={data.folder ?? ""} usual={mac.info.workdir} onSaved={setFolder} />}
      <StylePicker scope={projectId} />
      <details className="group rounded-xl border border-border bg-bg-card px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium">
          Editing notes for this job <span className="font-normal text-text-dim">- how you want these edited, remembered for every edit</span>
        </summary>
        <div className="mt-3">
          <EditingNotes scope={projectId} compact />
          <Link href="/hub/studio/notes" className="mt-3 inline-block text-xs text-accent hover:underline">
            Notes for all your edits →
          </Link>
        </div>
      </details>
      <AddCards
        projectId={projectId}
        sheets={sheets}
        onAdded={(cards) => {
          add(cards);
          // One new card: open it, ready to pick the clips.
          if (cards.length === 1) {
            if (panel) panel.onOpen(cards[0].id);
            else setOpen(cards[0].id);
          }
        }}
      />
      {data.edits.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-strong bg-bg-card p-4 text-sm text-text-muted">
          No edit cards yet. Start a new edit in your own words, make them from a shoot sheet above, or paste a video card from one of your Claude Projects.
        </p>
      ) : (
        <div className="space-y-3">
          {data.edits.map((card) => (
            <Card
              key={card.id}
              card={card}
              files={files}
              mac={mac}
              devices={macs}
              open={panel ? panel.openId === card.id : open === card.id}
              inPanel={inPanel}
              onToggle={() => (panel ? panel.onOpen(panel.openId === card.id ? null : card.id) : setOpen(open === card.id ? null : card.id))}
              onChange={replace}
              onDelete={() => remove(card.id)}
              onTrials={onTrials}
              onAdded={(c) => add([c])}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MacBar({ devices, mac, onChoose }: { devices: Device[]; mac: Device | undefined; onChoose: (id: string) => void }) {
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
  const online = devices.filter((d) => d.online);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-bg-card px-4 py-2.5 text-sm">
      {online.length > 1 ? (
        <span className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Edit on which Mac">
          <span className="font-medium">Edit on:</span>
          {online.map((d) => (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={d.id === mac.id}
              onClick={() => onChoose(d.id)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition ${d.id === mac.id ? "border-accent bg-accent text-on-accent" : "border-border text-text-muted hover:border-accent hover:text-accent"}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${d.id === mac.id ? "bg-on-accent" : "bg-good"}`} />
              {d.name}
            </button>
          ))}
        </span>
      ) : (
        <span className="flex items-center gap-2 font-medium">
          <span className={`h-2 w-2 rounded-full ${mac.online ? "bg-good" : "bg-text-dim"}`} />
          {mac.name} {mac.online ? "is connected" : "is offline - start the helper on it"}
        </span>
      )}
      {mac.info.capcut && <span className="text-text-dim">CapCut {mac.info.capcut}</span>}
      {mac.online && mac.info.capcutRunning && <span className="text-warn">CapCut is open - close it so edits can save</span>}
      {!helperOlderThan(mac.info.helper, HELPER_FOR_LIBRARY) && helperOlderThan(mac.info.helper, LATEST_HELPER) && (
        <span className="text-xs text-warn">
          Helper {mac.info.helper} - {LATEST_HELPER} is out. It updates itself between edits, or close its window and start it again now.
        </span>
      )}
      {helperOlderThan(mac.info.helper, HELPER_FOR_LIBRARY) && (
        <Link href="/hub/studio/helper" className="text-warn hover:underline">
          Update the helper to find B-roll and make trial versions →
        </Link>
      )}
      <Link href="/hub/studio/helper" className="ml-auto text-text-muted hover:text-accent">
        Mac helper
      </Link>
    </div>
  );
}

/** The folder on your Mac this job's edits start in, so Claude Code picks up that folder's CLAUDE.md, notes and skills. */
function FolderSetting({ projectId, folder, usual, onSaved }: { projectId: string; folder: string; usual?: string; onSaved: (folder: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(folder);
  const [error, setError] = useState("");
  const [saving, run] = useBusy();
  const home = (p?: string) => (p ?? "").replace(/^\/Users\/[^/]+/, "~");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      setError("");
      try {
        const r = await call<{ folder: string }>("/api/hub/edits", "PATCH", { projectId, folder: value });
        onSaved(r.folder);
        setValue(r.folder);
        setEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }
  if (!editing) {
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-text-muted">
        <span>
          Claude Code works in <code className="text-text">{folder || home(usual) || "your usual folder"}</code>
          {folder ? " for this job" : " (the helper's usual folder)"}
        </span>
        <button
          type="button"
          onClick={() => {
            setValue(folder);
            setEditing(true);
          }}
          className="font-medium text-accent hover:underline"
        >
          Change
        </button>
      </p>
    );
  }
  return (
    <form onSubmit={save} className="space-y-2 rounded-xl border border-border bg-bg-card p-3 text-sm">
      <label className="block space-y-1">
        <span className="font-medium">Folder on your Mac for this job&apos;s edits</span>
        <input className={input} value={value} onChange={(e) => setValue(e.target.value)} placeholder={home(usual) || "~/Movies/shortform"} aria-label="Folder on your Mac for this job's edits" />
        <span className="block text-xs text-text-dim">
          Claude Code starts here, so this folder&apos;s CLAUDE.md, notes and skills apply - use the folder you edit this kind of video in now. In Finder, right-click the folder, hold Option and
          choose &ldquo;Copy as Pathname&rdquo;. Leave it empty for the usual one{usual ? ` (${home(usual)})` : ""}.
        </span>
      </label>
      <div className="flex items-center gap-3">
        <button disabled={saving} className="rounded-lg bg-accent px-3 py-1.5 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-70">
          <Busy busy={saving} label="Saving…">
            Save
          </Busy>
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-text-muted hover:text-text">
          Cancel
        </button>
      </div>
      {error && <p className="text-accent">{error}</p>}
    </form>
  );
}

function AddCards({ projectId, sheets, onAdded }: { projectId: string; sheets: SheetSummary[]; onAdded: (cards: EditCard[]) => void }) {
  const [sheetId, setSheetId] = useState(sheets[0]?.id ?? "");
  const [pasting, setPasting] = useState(false);
  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [whole, setWhole] = useState(false);
  const [busy, run] = useBusy();
  // Which button is adding, so only that one says so.
  const [adding, setAdding] = useState("");
  const [error, setError] = useState("");
  async function add(which: string, body: Record<string, unknown>) {
    await run(async () => {
      setAdding(which);
      setError("");
      try {
        const r = await call<{ edits: EditCard[] }>("/api/hub/edits", "POST", { projectId, ...body });
        onAdded(r.edits);
        setBrief("");
        setTitle("");
        setPasting(false);
        setWriting(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }
  const isAdding = (which: string) => busy && adding === which;
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
            <button type="button" disabled={busy || !sheetId} onClick={() => add("sheet", { sheetId })} className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60">
              <Busy busy={isAdding("sheet")} label="Adding…">
                Make edit cards
              </Busy>
            </button>
            <button
              type="button"
              disabled={busy || !sheetId}
              onClick={() => add("whole", { sheetId, whole: true })}
              className="rounded-xl border border-border px-4 py-2 text-sm hover:border-accent hover:text-accent disabled:opacity-60"
            >
              <Busy busy={isAdding("whole")} label="Adding…">
                Edit the whole sheet in one go
              </Busy>
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => {
            setWriting(!writing);
            setPasting(false);
          }}
          className="rounded-xl border border-border px-4 py-2 text-sm hover:border-accent hover:text-accent"
        >
          {writing ? "Cancel" : "+ New edit"}
        </button>
        <button
          type="button"
          onClick={() => {
            setPasting(!pasting);
            setWriting(false);
          }}
          className="rounded-xl border border-border px-4 py-2 text-sm hover:border-accent hover:text-accent"
        >
          {pasting ? "Cancel" : "Paste a card or shoot sheet"}
        </button>
      </div>
      {writing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void add("new", { title: title.trim(), brief });
          }}
          className="space-y-2"
        >
          <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What's the video? e.g. Morning routine talking head" aria-label="What's the video?" maxLength={300} />
          <TextBox
            rows={5}
            className={input}
            value={brief}
            onValue={(v) => setBrief(v)}
            placeholder="How should it be edited? Say it the way you would in Claude Code: cut the pauses, captions in my usual style, hook text on screen, 30-40 seconds, B-roll of the gym from my Photos…"
            aria-label="How should it be edited?"
          />
          <p className="text-xs text-text-dim">Next, pick its files on the card (videos, images, audio), then press Edit in CapCut.</p>
          <button disabled={busy || !brief.trim()} className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60">
            <Busy busy={isAdding("new")} label="Adding…">
              Add edit
            </Busy>
          </button>
        </form>
      )}
      {pasting && (
        <div className="space-y-2">
          <TextBox
            rows={8}
            className={input}
            value={brief}
            onValue={(v) => {
              setBrief(v);
              setWhole(looksLikeWholeSheet(v));
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
          <button type="button" disabled={busy || !brief.trim()} onClick={() => add("paste", { brief, whole })} className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60">
            <Busy busy={isAdding("paste")} label="Adding…">
              Add card
            </Busy>
          </button>
        </div>
      )}
      {error && <p className="text-sm text-accent">{error}</p>}
    </div>
  );
}

/** A stopped edit whose Claude Code session is on another Mac: carry on there (when it's on), or start again on this one. */
function CarryOnElsewhere({ was, on, busy, disabled, onCarryOn }: { was: Device | undefined; on: Device; busy: boolean; disabled: boolean; onCarryOn: () => void }) {
  if (!was) return <span className="text-xs text-text-dim">The Mac it was on isn&apos;t connected any more, so start it again on {on.name}.</span>;
  return was.online ? (
    <button type="button" disabled={disabled} onClick={onCarryOn} className="rounded-xl border border-border px-4 py-2 text-sm hover:border-accent hover:text-accent disabled:opacity-60">
      <Busy busy={busy} label="Starting…">
        Carry on where it stopped, on {was.name}
      </Busy>
    </button>
  ) : (
    <span className="text-xs text-text-dim">
      To carry on where it stopped, start the helper on {was.name} (its Claude Code session is there) - or start it again on {on.name}.
    </span>
  );
}

/** Several video codes (V1, V2, V3…) usually means a whole shoot sheet rather than one card. */
function looksLikeWholeSheet(text: string) {
  return new Set(text.match(/\bV\d{1,2}\b/g) ?? []).size >= 3;
}

function CodeBadge({ card }: { card: EditCard }) {
  if (card.videoCode === WHOLE_SHEET) return <span className="shrink-0 rounded-md bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent">Whole sheet</span>;
  return card.videoCode ? <span className="shrink-0 rounded-md bg-bg-elevated px-1.5 py-0.5 font-mono text-xs">{card.videoCode}</span> : null;
}

function StatusPill({ card }: { card: EditCard }) {
  const tone =
    card.status === "ready" || card.status === "done"
      ? "bg-good-soft text-good"
      : card.status === "needs_you" || card.status === "failed"
        ? "bg-warn-soft text-warn"
        : BUSY.has(card.status)
          ? "bg-accent-soft text-accent"
          : "bg-text/5 text-text-dim";
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{STATUS_LABEL[card.status]}</span>;
}

/** One edit card in the list: its summary row, opening in place - or, inPanel, in the right-hand panel, highlighted here while it's open there. */
function Card({
  card,
  files,
  mac,
  devices,
  open,
  inPanel,
  onToggle,
  onChange,
  onDelete,
  onTrials,
  onAdded,
}: {
  card: EditCard;
  files: DeviceFile[];
  mac: Device | undefined;
  devices: Device[];
  open: boolean;
  inPanel: boolean;
  onToggle: () => void;
  onChange: (c: EditCard) => void;
  onDelete: () => void;
  onTrials?: () => void;
  onAdded: (c: EditCard) => void;
}) {
  const selected = open && inPanel;
  return (
    <article
      id={`edit-${card.id}`}
      aria-current={selected ? "true" : undefined}
      className={`scroll-mt-24 rounded-2xl border bg-bg-card transition ${selected ? "border-accent ring-1 ring-accent" : "border-border"}`}
    >
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-4 py-3 text-left ${inPanel && !selected ? "hover:bg-bg-elevated" : ""}`}
        aria-expanded={open}
        aria-controls={selected ? EDIT_PANEL_ID : undefined}
      >
        <CodeBadge card={card} />
        <span className="min-w-0 flex-1 truncate font-medium">{card.title || "Untitled video"}</span>
        <StatusPill card={card} />
        {card.files.length > 0 && <span className="text-xs text-text-dim">{card.files.length} file{card.files.length === 1 ? "" : "s"}</span>}
        {selected && (
          <span className="text-xs font-medium text-accent" aria-hidden>
            Open →
          </span>
        )}
      </button>
      {open && !inPanel && (
        <div className="space-y-4 border-t border-border px-4 py-4">
          <EditDetail card={card} files={files} mac={mac} devices={devices} onChange={onChange} onDelete={onDelete} onTrials={onTrials} onAdded={onAdded}>
            <Conversation card={card} onChange={onChange} />
          </EditDetail>
        </div>
      )}
    </article>
  );
}

export const EDIT_PANEL_ID = "edit-panel";

/** An edit open in the right-hand panel, like a chat: its name and status at the top, files and actions, the
    conversation with Claude on your Mac (kept scrolled to the latest), and the reply box at the bottom. */
export function EditPanel({ store, id, onClose, onTrials }: { store: EditsData; id: string; onClose: () => void; onTrials?: () => void }) {
  const card = store.data?.edits.find((e) => e.id === id);
  if (!card) {
    return (
      <div id={EDIT_PANEL_ID} className="p-4 text-sm text-text-muted">
        {store.data ? (
          "This edit card isn't here any more."
        ) : store.error ? (
          <span className="text-accent">{store.error}</span>
        ) : (
          <span className="flex items-center gap-2">
            <Spinner />
            Loading the edit…
          </span>
        )}
      </div>
    );
  }
  return <EditChat key={card.id} card={card} store={store} onClose={onClose} onTrials={onTrials} />;
}

function EditChat({ card, store, onClose, onTrials }: { card: EditCard; store: EditsData; onClose: () => void; onTrials?: () => void }) {
  const convo = useConversation(card, store.replace);
  // Follow new messages while you're at the bottom; scrolled up to read, it stays put.
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const count = convo.events.length;
  useEffect(() => {
    const el = scroller.current;
    if (el && count && stick.current) el.scrollTop = el.scrollHeight;
  }, [count, card.status]);
  return (
    <div id={EDIT_PANEL_ID} className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <h2 className="flex min-w-0 items-center gap-2">
          <CodeBadge card={card} />
          <span className="min-w-0 flex-1 truncate font-semibold">{card.title || "Untitled video"}</span>
          <StatusPill card={card} />
        </h2>
      </div>
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4"
      >
        <EditDetail
          card={card}
          files={store.files}
          mac={store.mac}
          devices={store.macs}
          onChange={store.replace}
          onDelete={() => {
            store.remove(card.id);
            onClose();
          }}
          onTrials={onTrials}
          onAdded={(c) => store.add([c])}
        >
          <ConversationLog card={card} events={convo.events} chat />
        </EditDetail>
      </div>
      {card.status !== "todo" && (
        <div className="shrink-0 space-y-2 border-t border-border bg-bg-card px-4 py-3">
          <ReplyBox card={card} convo={convo} />
        </div>
      )}
    </div>
  );
}

/** An edit card opened up: its CapCut draft, files, what you can do with it and the video card. The conversation goes in children. */
function EditDetail({
  card,
  files,
  mac,
  devices,
  onChange,
  onDelete,
  onTrials,
  onAdded,
  children,
}: {
  card: EditCard;
  files: DeviceFile[];
  mac: Device | undefined;
  devices: Device[];
  onChange: (c: EditCard) => void;
  onDelete: () => void;
  onTrials?: () => void;
  onAdded: (c: EditCard) => void;
  children: React.ReactNode;
}) {
  const [error, setError] = useState("");
  const [trialBusy, setTrialBusy] = useState(false);
  const [trialMade, setTrialMade] = useState(false);
  // One action at a time; `doing` says which, so its button says what's happening.
  const [working, work] = useBusy();
  const [doing, setDoing] = useState("");
  const confirm = useConfirm();
  const api = `/api/hub/edits/${card.id}`;
  async function apply(fn: () => Promise<{ edit?: EditCard } | unknown>) {
    setError("");
    try {
      const r = (await fn()) as { edit?: EditCard };
      if (r?.edit) onChange(r.edit);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  const act = (what: string, fn: () => Promise<{ edit?: EditCard } | unknown>) =>
    work(async () => {
      setDoing(what);
      await apply(fn);
    });
  const now = working ? doing : "";
  // Picked files save quietly in the background (the picker says they're saving), so they don't hold up the buttons.
  const setFiles = (next: EditFile[]) => apply(() => call(api, "PATCH", { files: next }));
  const ownClips = findsOwnClips(card.brief);

  return (
    <>
      {card.draftName && (
        <p className="rounded-xl bg-good-soft px-3 py-2 text-sm text-good">
          {card.draftName.includes(", ") ? "Drafts" : "Draft"} in CapCut: <strong>{card.draftName}</strong>
        </p>
      )}

      <ClipPicker
        card={card}
        files={files}
        mac={mac}
        busy={now}
        setFiles={setFiles}
        onPick={(mode) => act(`pick-${mode}`, () => call(`${api}/pick`, "POST", { mode, deviceId: mac?.id }))}
        onCancelPick={() => act("cancel-pick", () => call(`${api}/pick`, "DELETE"))}
      />

      <div className="flex flex-wrap items-center gap-2">
        {BUSY.has(card.status) ? (
          <button
            type="button"
            disabled={working}
            onClick={() => act("stop", () => call(`${api}/stop`, "POST"))}
            className="rounded-xl border border-border px-4 py-2 text-sm hover:border-accent hover:text-accent disabled:opacity-60"
          >
            <Busy busy={now === "stop"} label="Stopping…">
              Stop
            </Busy>
          </button>
        ) : (
          <Tooltip label={!mac ? "Connect your Mac first" : !card.files.length && !ownClips ? "Pick the files first" : null}>
            <button
              type="button"
              disabled={(!card.files.length && !ownClips) || !mac || working}
              onClick={() => act("run", () => call(`${api}/run`, "POST", { fresh: card.status === "ready" || card.status === "done" || card.status === "failed", deviceId: mac?.id }))}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50"
            >
              <Busy busy={now === "run"} label="Starting…">
                {card.status !== "todo" ? "Edit again from scratch" : card.videoCode === WHOLE_SHEET ? "Edit all the videos in CapCut" : "Edit in CapCut"}
              </Busy>
            </button>
          </Tooltip>
        )}
        {/* On the Mac it was on - or this one, if that Mac isn't connected any more (disconnected or replaced). */}
        {card.status === "failed" && card.canCarryOn && mac && (card.deviceId === mac.id || !devices.some((d) => d.id === card.deviceId)) && (
          <button
            type="button"
            disabled={working}
            onClick={() => act("carry", () => call(`${api}/run`, "POST", { fresh: false, deviceId: mac.id }))}
            className="rounded-xl border border-border px-4 py-2 text-sm hover:border-accent hover:text-accent disabled:opacity-60"
          >
            <Busy busy={now === "carry"} label="Starting…">
              Carry on where it stopped
            </Busy>
          </button>
        )}
        {card.status === "editing" && <span className="text-xs text-text-dim">Stuck (say the helper restarted)? Press Stop - then you can carry on where it left off.</span>}
        {card.status === "failed" && card.canCarryOn && mac && card.deviceId && card.deviceId !== mac.id && devices.some((d) => d.id === card.deviceId) && (
          <CarryOnElsewhere
            was={devices.find((d) => d.id === card.deviceId)}
            on={mac}
            busy={now === "carry-there"}
            disabled={working}
            onCarryOn={() => act("carry-there", () => call(`${api}/run`, "POST", { fresh: false, deviceId: card.deviceId }))}
          />
        )}
        {card.status === "ready" && (
          <button
            type="button"
            disabled={working}
            onClick={() => act("done", () => call(api, "PATCH", { status: "done" }))}
            className="rounded-xl border border-border px-4 py-2 text-sm hover:border-good hover:text-good disabled:opacity-60"
          >
            <Busy busy={now === "done"} label="Saving…">
              Looks good - done
            </Busy>
          </button>
        )}
        {onTrials && (card.status === "ready" || card.status === "done") && card.videoCode !== WHOLE_SHEET && !/^TRIAL VERSIONS:/m.test(card.brief) && (
          <Tooltip label="Claude writes 5 versions with different openings, and your Mac makes them from this draft, ready to post as trial reels">
            <button
              type="button"
              disabled={trialBusy}
              onClick={async () => {
                if (trialMade) return onTrials();
                setTrialBusy(true);
                setError("");
                try {
                  const r = await call<{ trial: { editId?: string } }>("/api/hub/studio/brand/trials", "POST", { kind: "edit", editId: card.id });
                  if (r.trial.editId) onAdded((await call<{ edit: EditCard }>(`/api/hub/edits/${r.trial.editId}`, "GET")).edit);
                  setTrialMade(true);
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setTrialBusy(false);
                }
              }}
              className="rounded-xl border border-border px-4 py-2 text-sm hover:border-accent hover:text-accent disabled:opacity-60"
            >
              <Busy busy={trialBusy} label="Writing 5 versions…">
                {trialMade ? "5 versions made - see Trial reels →" : "Make 5 trial versions"}
              </Busy>
            </button>
          </Tooltip>
        )}
        <CopyButton text={card.brief} label="Copy everything" />
        <button
          type="button"
          disabled={working}
          onClick={async () => {
            if (!(await confirm({ title: "Delete this edit card?", message: "The CapCut draft stays on your Mac.", confirmLabel: "Delete", danger: true }))) return;
            await act("delete", async () => {
              await call(api, "DELETE");
              onDelete();
            });
          }}
          className="ml-auto text-sm text-text-dim hover:text-accent disabled:opacity-60"
        >
          <Busy busy={now === "delete"} label="Deleting…">
            Delete card
          </Busy>
        </button>
      </div>
      {error && <p className="text-sm text-accent">{error}</p>}

      <details className="rounded-xl border border-border">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium">{card.videoCode === WHOLE_SHEET ? "Shoot sheet" : "Video card"}</summary>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-border px-3 py-2 font-sans text-sm text-text-muted">{card.brief}</pre>
      </details>

      {children}
    </>
  );
}

function ClipPicker({
  card,
  files,
  mac,
  busy,
  setFiles,
  onPick,
  onCancelPick,
}: {
  card: EditCard;
  files: DeviceFile[];
  mac: Device | undefined;
  /** The card's action running now ("pick-files", "pick-folder", "cancel-pick"…), if any. */
  busy: string;
  setFiles: (f: EditFile[]) => Promise<void>;
  onPick: (mode: "files" | "folder") => void;
  onCancelPick: () => void;
}) {
  const [browsing, setBrowsing] = useState(false);
  // Your latest files: everything, or just the videos, images or audio.
  const [only, setOnly] = useState<MediaKind | "">("");
  const shown = only ? files.filter((f) => mediaKind(f.name) === only) : files;
  // Picks show at once and save one at a time, in order, so quick clicks never undo each other;
  // the card's own list takes over again once they're all saved.
  const [mine, setMine] = useState<EditFile[] | null>(null);
  const picked = mine ?? card.files;
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const sending = useRef(0);
  const save = (next: EditFile[]) => {
    setMine(next);
    sending.current++;
    queue.current = queue.current
      .then(() => setFiles(next))
      .finally(() => {
        if (--sending.current === 0) setMine(null);
      });
  };
  const chosen = new Set(picked.map((f) => f.path));
  const toggle = (f: DeviceFile) => save(chosen.has(f.path) ? picked.filter((x) => x.path !== f.path) : [...picked, { path: f.path, name: f.name, duration: f.duration }]);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">
          Files <span className="font-normal text-text-dim">- videos, images and audio</span>
        </h3>
        <button type="button" disabled={!files.length} onClick={() => setBrowsing(!browsing)} className="rounded-lg border border-border px-3 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-50">
          {browsing ? "Hide your latest files" : "From your latest files"}
        </button>
        {card.pickRequested ? (
          <span className="flex items-center gap-2 text-xs text-accent">
            Look at your Mac - the {card.pickMode === "folder" ? "folder" : "file"} picker is open.
            <button type="button" disabled={Boolean(busy)} onClick={onCancelPick} className="text-text-dim underline">
              <Busy busy={busy === "cancel-pick"} label="Cancelling…">
                Cancel
              </Busy>
            </button>
          </span>
        ) : (
          <>
            <Tooltip label={mac?.online ? null : "Start the helper on your Mac first"}>
              <button
                type="button"
                disabled={!mac?.online || Boolean(busy)}
                onClick={() => onPick("files")}
                className="rounded-lg border border-border px-3 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-50"
              >
                <Busy busy={busy === "pick-files"} label="Asking your Mac…">
                  Choose on my Mac…
                </Busy>
              </button>
            </Tooltip>
            <Tooltip label={mac?.online ? null : "Start the helper on your Mac first"}>
              <button
                type="button"
                disabled={!mac?.online || Boolean(busy)}
                onClick={() => onPick("folder")}
                className="rounded-lg border border-border px-3 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-50"
              >
                <Busy busy={busy === "pick-folder"} label="Asking your Mac…">
                  Choose a folder…
                </Busy>
              </button>
            </Tooltip>
          </>
        )}
        {mine && (
          <span className="flex items-center gap-1.5 text-xs text-text-dim">
            <Spinner />
            Saving your picks…
          </span>
        )}
      </div>
      {findsOwnClips(card.brief) && (
        <p className="rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent">
          No need to pick clips: your Mac looks in Apple Photos and your drives for <strong>{LIBRARY_LINE.exec(card.brief)?.[1]}</strong> and Claude picks the ones that fit. Add any of your own
          too.
        </p>
      )}
      {picked.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {picked.map((f) => (
            <li key={f.path} className="flex max-w-full items-center gap-1.5 rounded-full bg-bg-elevated py-1 pl-3 pr-1.5 text-xs">
              <Tooltip label={f.path} className="min-w-0">
                <span className="truncate">{f.name}</span>
              </Tooltip>
              {mediaKind(f.name) !== "video" && <span className="text-text-dim">{mediaKind(f.name)}</span>}
              {f.duration ? <span className="text-text-dim">{mmss(f.duration)}</span> : null}
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => save(picked.filter((x) => x.path !== f.path))} className="rounded-full px-1 text-text-dim hover:text-accent">
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-text-dim">Nothing picked yet. Your files stay on your Mac - only their names go to Creator Desk.</p>
      )}
      {browsing && (
        <div className="flex flex-wrap gap-1.5 text-xs" role="group" aria-label="Show">
          {(["", "video", "image", "audio"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={only === k}
              onClick={() => setOnly(k)}
              className={`rounded-full border px-2.5 py-0.5 ${only === k ? "border-accent bg-accent text-on-accent" : "border-border text-text-muted hover:border-accent hover:text-accent"}`}
            >
              {k === "" ? "All" : k === "video" ? "Videos" : k === "image" ? "Images" : "Audio"} ({k ? files.filter((f) => mediaKind(f.name) === k).length : files.length})
            </button>
          ))}
        </div>
      )}
      {browsing && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {shown.map((f) => (
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
                  <div className="flex aspect-[9/16] w-full items-center justify-center bg-bg-elevated text-2xl text-text-dim" aria-hidden>
                    {mediaKind(f.name) === "audio" ? "♪" : mediaKind(f.name) === "image" ? "▣" : ""}
                  </div>
                )}
                <span className="block truncate px-1.5 pt-1">{f.name}</span>
                <span className="block truncate px-1.5 pb-1 text-text-dim">
                  {mediaKind(f.name) === "image" ? "Image" : mediaKind(f.name) === "audio" ? `Audio ${mmss(f.duration)}` : mmss(f.duration)}{" "}
                  {f.modifiedAt && `· ${new Date(f.modifiedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                </span>
              </button>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  );
}

/** The conversation with Claude Code on the Mac: its messages (checked every few seconds while it's working) and your reply. */
function useConversation(card: EditCard, onChange: (c: EditCard) => void) {
  const [events, setEvents] = useState<EditEvent[]>([]);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [sending, run] = useBusy();
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

  const send = () =>
    run(async () => {
      setError("");
      try {
        await call(`/api/hub/edits/${card.id}/message`, "POST", { text: reply });
        setReply("");
        onChange({ ...card, status: "editing" });
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });

  return { events, reply, setReply, error, sending, send };
}

type Convo = ReturnType<typeof useConversation>;

/** In place on a card: the messages, then the reply box. */
function Conversation({ card, onChange }: { card: EditCard; onChange: (c: EditCard) => void }) {
  const convo = useConversation(card, onChange);
  if (!convo.events.length && card.status === "todo") return null;
  return (
    <div className="space-y-3">
      <ConversationLog card={card} events={convo.events} />
      <ReplyBox card={card} convo={convo} />
    </div>
  );
}

/** The messages. chat: in the right-hand panel, which scrolls them itself (on a card they scroll in a box). */
function ConversationLog({ card, events, chat = false }: { card: EditCard; events: EditEvent[]; chat?: boolean }) {
  if (!events.length && card.status === "todo") return null;
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">With Claude on your Mac</h3>
      <ol className={`space-y-2 rounded-xl bg-bg-elevated p-3 text-sm ${chat ? "" : "max-h-[28rem] overflow-y-auto"}`}>
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
        {BUSY.has(card.status) && (
          <li className="flex items-center gap-2 text-xs text-accent">
            <Spinner />
            {card.status === "queued" ? "Waiting for your Mac to pick it up…" : "Working…"}
          </li>
        )}
      </ol>
    </div>
  );
}

/** Your reply to Claude (Enter sends), and what happens to feedback. */
function ReplyBox({ card, convo }: { card: EditCard; convo: Convo }) {
  const { reply, setReply, send, sending, error } = convo;
  return (
    <>
      {card.status !== "todo" && card.status !== "queued" && (
        <div className="flex gap-2">
          <TextBox
            rows={2}
            className={`${input} flex-1`}
            value={reply}
            onValue={(v) => setReply(v)}
            onKeyDown={(e) => chatKeys(() => reply.trim() && void send(), setReply)(e)}
            placeholder={card.status === "needs_you" ? "Answer Claude…" : "Ask for a change, e.g. make the hook text bigger"}
            aria-label="Reply to Claude"
          />
          <button
            type="button"
            disabled={!reply.trim() || sending}
            onClick={() => void send()}
            className="self-end rounded-xl bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50"
          >
            <Busy busy={sending} label="Sending…">
              Send
            </Busy>
          </button>
        </div>
      )}
      {card.status !== "todo" && (
        <p className="text-xs text-text-dim">{CHAT_KEYS_HINT}. Feedback that should stick for future edits (&ldquo;captions are always too big&rdquo;) is saved to this job&apos;s editing notes.</p>
      )}
      {error && <p className="text-sm text-accent">{error}</p>}
    </>
  );
}
