"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { helperOlderThan, type Device } from "../../_lib/edits/types";
import { FRAMES_PER_UPLOAD, FRAME_WIDTH, KIND_LABEL, MAX_FRAME_CHARS, MAX_FRAMES, HELPER_FOR_STYLES, STYLE_KINDS, type EditStyle, type StyleFrame, type StyleKind, type StyleRequest } from "../../_lib/edits/style-types";
import { BRAND_ID } from "../../_lib/studio/brand-types";
import { input } from "../../projects/fields";
import { call } from "../../projects/[id]/studio/studio";
import { Tooltip, useConfirm } from "../../_lib/popups";
import { TextBox } from "../../_lib/text-box";
import { Busy, Spinner } from "../../_lib/ui";

/* Edit styles: the different ways your videos are edited (personal brand,
   tech UGC, brand deals…), each with a short summary, the rules Claude Code
   follows, and key frames that show what it looks like. Kept in Creator Desk,
   so every device and every Mac uses the same ones. Your Mac can read them
   out of its own CLAUDE.md, skills and memory, and grab frames from a
   finished video. */

type Style = EditStyle & { frameCount: number; usedBy: { id: string; name: string; auto: boolean }[] };
type Data = { styles: Style[]; scan: StyleRequest | null; devices: Device[] };
const LIVE = new Set<StyleRequest["status"]>(["waiting", "taken", "sorting"]);
const MAC_KEY = "cd-edit-mac";
const api = "/api/hub/edits/styles";
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const editsLink = (id: string) => (id === BRAND_ID ? "/hub/studio/brand?tab=edits" : `/hub/projects/${id}/studio?tab=edits`);

export function StylesPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [macId, setMacId] = useState<string | null>(() => {
    try {
      return typeof window === "undefined" ? null : localStorage.getItem(MAC_KEY);
    } catch {
      return null;
    }
  });
  const scan = useMacRequest(() => void load());

  async function load() {
    try {
      const d = await call<Data>(api, "GET");
      setData(d);
      setError("");
      return d;
    } catch (e) {
      setError(errorText(e));
    }
  }
  useEffect(() => {
    // The last read of your Mac carries on showing (and checking, if it's still going).
    call<Data>(api, "GET").then(
      (d) => {
        setData(d);
        if (d.scan) scan.follow(d.scan);
      },
      (e: Error) => setError(e.message),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data)
    return error ? (
      <p className="text-sm text-accent">{error}</p>
    ) : (
      <p className="flex items-center gap-2 text-sm text-text-muted">
        <Spinner /> Loading your edit styles…
      </p>
    );
  const online = data.devices.filter((d) => d.online);
  const mac = online.find((d) => d.id === macId) ?? online[0];
  const replace = (s: Style) => setData((d) => d && { ...d, styles: d.styles.map((x) => (x.id === s.id ? { ...x, ...s } : x)) });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/hub/studio" className="text-sm text-text-muted hover:text-accent">
          ← Studio
        </Link>
        <h1 className="mt-2 font-serif text-4xl italic sm:text-5xl">Edit styles</h1>
        <p className="mt-2 text-text-muted">
          The different ways your videos are edited - your personal brand, tech UGC, brand deals - with a short summary, the rules Claude Code follows and a few key frames that show what the text,
          fonts and B-roll look like. They&apos;re kept here in Creator Desk, so they&apos;re the same on every device and every Mac. Each job follows a style: pick it on the job&apos;s Edits tab.
        </p>
        <Link href="/hub/studio/notes" className="mt-2 inline-block text-sm text-accent hover:underline">
          Editing notes - feedback Claude remembers →
        </Link>
        <p className="mt-2 text-sm text-text-muted">
          Styles are a short summary. Your full setup - every CLAUDE.md, skill and memory file, word for word, carried between your Macs - is on{" "}
          <Link href="/hub/studio/setup" className="text-accent hover:underline">
            Editing setup →
          </Link>
        </p>
      </div>

      <section className="space-y-3 rounded-2xl border border-border bg-bg-card p-4 sm:p-5" aria-label="Read your Mac">
        <div className="space-y-1">
          <h2 className="font-semibold">Read my Mac&apos;s editing setup</h2>
          <p className="text-sm text-text-muted">
            Your Mac looks through the CLAUDE.md, skills and memory files Claude Code uses to edit your videos, and Claude sorts them into styles here. Got more than one Mac? Read each
            one: what&apos;s new on each is added to the same styles, nothing is lost. Styles you&apos;ve changed yourself are left as they are.
          </p>
        </div>
        <MacChoice
          devices={online}
          mac={mac}
          onChoose={(id) => {
            setMacId(id);
            try {
              localStorage.setItem(MAC_KEY, id);
            } catch {}
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <MacButton mac={mac} busy={scan.busy} onClick={() => scan.start({ kind: "scan", deviceId: mac?.id })}>
            <Busy busy={scan.busy} label="Reading your Mac…">
              Read my Mac&apos;s editing setup
            </Busy>
          </MacButton>
          <button type="button" onClick={() => setAdding(!adding)} className="rounded-xl border border-border px-4 py-2 text-sm hover:border-accent hover:text-accent">
            {adding ? "Cancel" : "+ New style"}
          </button>
        </div>
        <ScanStatus req={scan.req} error={scan.error} />
        {adding && (
          <StyleForm
            onCancel={() => setAdding(false)}
            onSave={async (f) => {
              await call(api, "POST", f);
              setAdding(false);
              await load();
            }}
          />
        )}
      </section>

      {error && <p className="text-sm text-accent">{error}</p>}

      {data.styles.length === 0 ? (
        <div className="space-y-2 rounded-xl border border-dashed border-border-strong bg-bg-card p-4 text-sm text-text-muted">
          <p className="font-medium text-text">No styles yet.</p>
          <p>
            Press <strong>Read my Mac&apos;s editing setup</strong> and Claude sorts the way your Mac has been set up to edit (personal brand, tech UGC, brand deals…) into styles here - or add one
            yourself with <strong>+ New style</strong>. Then add a few key frames to each: screenshots, or stills from a finished video on your Mac.
          </p>
          <p>Every edit then follows its job&apos;s style: personal brand edits use your personal style, tech UGC jobs your tech style, and brand deals your brand deal style - or pick one on a job&apos;s Edits tab.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.styles.map((s) => (
            <StyleCard key={s.id} style={s} mac={mac} onChange={replace} onDelete={() => setData((d) => d && { ...d, styles: d.styles.filter((x) => x.id !== s.id) })} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Asking your Mac for something, then checking on it until it's done. */
function useMacRequest(onDone: (r: StyleRequest) => void) {
  const [req, setReq] = useState<StyleRequest | null>(null);
  const [error, setError] = useState("");
  // Between pressing the button and the server taking the request.
  const [starting, setStarting] = useState(false);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  const live = Boolean(req && LIVE.has(req.status));
  const id = req?.id;
  useEffect(() => {
    if (!live || !id) return;
    const t = setInterval(async () => {
      try {
        const r = await call<{ request: StyleRequest }>(`${api}/mac?id=${encodeURIComponent(id)}`, "GET");
        setReq(r.request);
        if (!LIVE.has(r.request.status)) done.current(r.request);
      } catch (e) {
        setError(errorText(e));
        setReq(null);
      }
    }, 2500);
    return () => clearInterval(t);
  }, [live, id]);
  return {
    req,
    live,
    /** Asking, or waiting on the Mac: the button shows it's going. */
    busy: starting || live,
    error,
    follow: setReq,
    async start(body: { kind: "scan" | "grab"; styleId?: string; deviceId?: string }) {
      if (starting) return;
      setError("");
      setStarting(true);
      try {
        setReq((await call<{ request: StyleRequest }>(`${api}/mac`, "POST", body)).request);
      } catch (e) {
        setError(errorText(e));
      } finally {
        setStarting(false);
      }
    },
  };
}

/** With more than one Mac on, which one to ask. */
function MacChoice({ devices, mac, onChoose }: { devices: Device[]; mac: Device | undefined; onChoose: (id: string) => void }) {
  if (devices.length < 2 || !mac) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-sm" role="radiogroup" aria-label="Which Mac">
      <span className="font-medium">Ask:</span>
      {devices.map((d) => (
        <button
          key={d.id}
          type="button"
          role="radio"
          aria-checked={d.id === mac.id}
          onClick={() => onChoose(d.id)}
          className={`rounded-full border px-2.5 py-0.5 text-xs transition ${d.id === mac.id ? "border-accent bg-accent text-on-accent" : "border-border text-text-muted hover:border-accent hover:text-accent"}`}
        >
          {d.name}
        </button>
      ))}
    </span>
  );
}

/** A button that asks your Mac: off (with the reason) until a Mac with a new enough helper is on. */
function MacButton({ mac, busy, onClick, children, small = false }: { mac: Device | undefined; busy: boolean; onClick: () => void; children: React.ReactNode; small?: boolean }) {
  // Helpers that can do this say so (styles: true) as well as being 0.3.8 or later.
  const old = mac && !(mac.info as { styles?: boolean }).styles && helperOlderThan(mac.info.helper, HELPER_FOR_STYLES);
  const why = !mac ? "Start the Creator Desk Helper on your Mac first" : old ? `Your Mac needs the latest helper (${HELPER_FOR_STYLES}) for this` : null;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Tooltip label={why}>
        <button
          type="button"
          disabled={!mac || old || busy}
          aria-busy={busy}
          onClick={onClick}
          className={
            small
              ? "rounded-lg border border-border px-3 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-50"
              : "rounded-xl bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
          }
        >
          {children}
        </button>
      </Tooltip>
      {!mac && !small && (
        <Link href="/hub/studio/helper" className="text-xs text-accent hover:underline">
          Connect or start your Mac →
        </Link>
      )}
      {old && !small && (
        <span className="text-xs text-warn">
          {mac.name} has helper {mac.info.helper ?? "(an old one)"} - this needs {HELPER_FOR_STYLES}. It updates itself between edits, or close its window and start it again.
        </span>
      )}
    </span>
  );
}

function ScanStatus({ req, error }: { req: StyleRequest | null; error: string }) {
  if (error) return <p className="text-sm text-accent">{error}</p>;
  if (!req) return null;
  const going = (text: string) => (
    <p className="flex items-start gap-2 text-sm text-accent">
      <Spinner className="mt-[3px]" />
      <span>{text}</span>
    </p>
  );
  if (req.status === "waiting") return going("Waiting for your Mac to pick this up… (is the Creator Desk Helper running?)");
  if (req.status === "taken") return going("Your Mac is reading its CLAUDE.md, skills and memory files…");
  if (req.status === "sorting") return going(`Claude is sorting what your Mac found (${req.files?.length ?? 0} files) into styles - this can take a minute…`);
  if (req.status === "expired") return <p className="text-sm text-warn">Your Mac didn&apos;t answer in time. Make sure the Creator Desk Helper is running on it, then try again.</p>;
  if (req.status === "failed") return <p className="text-sm text-warn">That didn&apos;t work: {req.error || "something went wrong"}. Try again in a minute.</p>;
  const list = (label: string, names?: string[]) => (names?.length ? `${label}: ${names.join(", ")}` : "");
  const changes = [list("Added", req.added), list("Updated", req.updated), list("Left as you set them", req.kept)].filter(Boolean).join(" · ");
  return (
    <div className="space-y-1 rounded-xl bg-bg-elevated px-3 py-2 text-sm">
      <p>{req.reply || "Done."}</p>
      {changes && <p className="text-xs text-text-muted">{changes}</p>}
      <p className="text-xs text-text-dim">Read {req.finishedAt ? new Date(req.finishedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "just now"}</p>
      {(req.files?.length ?? 0) > 0 && (
        <details className="text-xs text-text-muted">
          <summary className="cursor-pointer">Files it read ({req.files!.length})</summary>
          <ul className="mt-1 space-y-0.5">
            {req.files!.map((f) => (
              <li key={f} className="break-all font-mono">
                {f}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

type Form = { name: string; kind: StyleKind; summary: string; rules: string[] };

/** A style's name, kind, summary and rules: for a new style, or changing one. */
function StyleForm({ start, onSave, onCancel }: { start?: Form; onSave: (f: Form) => Promise<void>; onCancel: () => void }) {
  const [f, setF] = useState<Form>(start ?? { name: "", kind: "brand", summary: "", rules: [] });
  const [rule, setRule] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      // A rule still in the box counts too.
      await onSave({ ...f, rules: [...f.rules, rule].map((r) => r.trim()).filter(Boolean) });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="space-y-3 rounded-xl border border-border bg-bg p-3 text-sm">
      <div className="flex flex-wrap gap-2">
        <input required className={`${input} min-w-0 flex-1`} value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Name, e.g. Brand deals" aria-label="Style name" maxLength={80} />
        <select className={`${input} w-auto`} value={f.kind} onChange={(e) => set({ kind: e.target.value as StyleKind })} aria-label="Kind of video">
          {STYLE_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </div>
      <TextBox rows={3} className={input} value={f.summary} onValue={(v) => set({ summary: v })} placeholder="What these videos look and feel like, in a few sentences" aria-label="Summary" maxLength={1000} />
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-text-muted">Rules - one each, starting with what it&apos;s about (Captions:, Text:, Fonts:, B-roll:, Cuts:, Music:)</p>
        {f.rules.map((r, i) => (
          <div key={i} className="flex gap-2">
            <input className={`${input} min-w-0 flex-1`} value={r} onChange={(e) => set({ rules: f.rules.map((x, j) => (j === i ? e.target.value : x)) })} aria-label={`Rule ${i + 1}`} maxLength={300} />
            <button type="button" onClick={() => set({ rules: f.rules.filter((_, j) => j !== i) })} aria-label={`Remove rule ${i + 1}`} className="shrink-0 px-1 text-text-dim hover:text-accent">
              ✕
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <input
            className={`${input} min-w-0 flex-1`}
            value={rule}
            onChange={(e) => setRule(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || !rule.trim()) return;
              e.preventDefault();
              set({ rules: [...f.rules, rule.trim()] });
              setRule("");
            }}
            placeholder="Add a rule, e.g. Captions: white, bold, 3 words a line"
            aria-label="Add a rule"
            maxLength={300}
          />
          <button
            type="button"
            disabled={!rule.trim()}
            onClick={() => {
              set({ rules: [...f.rules, rule.trim()] });
              setRule("");
            }}
            className="shrink-0 rounded-lg border border-border px-3 text-xs hover:border-accent hover:text-accent disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy || !f.name.trim()} aria-busy={busy} className="rounded-lg bg-accent px-3 py-1.5 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60">
          <Busy busy={busy} label="Saving…">
            Save style
          </Busy>
        </button>
        <button type="button" onClick={onCancel} className="text-text-muted hover:text-text">
          Cancel
        </button>
      </div>
      {error && <p className="text-accent">{error}</p>}
    </form>
  );
}

const USED_BY_SHOWN = 8;
/** "MacBook Air", "MacBook Air and Mac mini", "A, B and C". */
const listNames = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

function StyleCard({ style, mac, onChange, onDelete }: { style: Style; mac: Device | undefined; onChange: (s: Style) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [frames, setFrames] = useState<StyleFrame[] | null>(style.frameCount ? null : []);
  const [big, setBig] = useState<StyleFrame | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  // A style used by lots of jobs lists the first few until you ask for the rest.
  const [allJobs, setAllJobs] = useState(false);
  const confirm = useConfirm();
  const framesApi = `${api}/frames`;
  const loadFrames = () =>
    call<{ frames: StyleFrame[] }>(`${framesApi}?styleId=${style.id}`, "GET").then(
      (r) => setFrames(r.frames),
      (e: Error) => setError(e.message),
    );
  const grab = useMacRequest((r) => {
    if (r.status === "done") void loadFrames();
  });

  useEffect(() => {
    if (!style.frameCount) return;
    call<{ frames: StyleFrame[] }>(`${framesApi}?styleId=${style.id}`, "GET").then(
      (r) => setFrames(r.frames),
      (e: Error) => setError(e.message),
    );
  }, [framesApi, style.id, style.frameCount]);

  async function upload(files: FileList | null) {
    const list = [...(files ?? [])].filter((f) => f.type.startsWith("image/")).slice(0, FRAMES_PER_UPLOAD);
    if (!list.length) return;
    setUploading(true);
    setError("");
    try {
      const shrunk = await Promise.all(list.map(async (f) => ({ data: await shrink(f), source: f.name })));
      const r = await call<{ frames: StyleFrame[] }>(framesApi, "POST", { styleId: style.id, frames: shrunk });
      setFrames(r.frames);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setUploading(false);
    }
  }
  async function removeFrame(f: StyleFrame) {
    setFrames((x) => x && x.filter((y) => y.id !== f.id));
    setBig(null);
    await call(`${framesApi}?styleId=${style.id}&id=${f.id}`, "DELETE").catch((e: Error) => setError(e.message));
  }

  return (
    <article className="min-w-0 space-y-3 rounded-2xl border border-border bg-bg-card p-4 sm:p-5" aria-label={style.name}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="break-words font-serif text-2xl">{style.name}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-dim">
            <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent">{KIND_LABEL[style.kind]}</span>
            <span>{style.source === "you" ? "Changed by you" : style.macs?.length ? `Read from ${listNames(style.macs)}` : "From your Mac's setup"}</span>
          </p>
        </div>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="shrink-0 rounded-lg border border-border px-3 py-1 text-xs hover:border-accent hover:text-accent">
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <>
          <StyleForm
            start={{ name: style.name, kind: style.kind, summary: style.summary, rules: style.rules }}
            onCancel={() => setEditing(false)}
            onSave={async (f) => {
              const r = await call<{ style: EditStyle }>(api, "PATCH", { id: style.id, ...f });
              onChange({ ...style, ...r.style });
              setEditing(false);
            }}
          />
          {style.source === "mac" && <p className="text-xs text-text-dim">Once you change a style here it&apos;s yours: reading your Mac again won&apos;t overwrite it.</p>}
        </>
      ) : (
        <>
          {style.summary ? <p className="text-sm text-text-muted">{style.summary}</p> : <p className="text-sm text-text-dim">No summary yet.</p>}
          {style.rules.length > 0 ? (
            <ul className="space-y-1.5">
              {style.rules.map((r, i) => (
                <li key={i} className="break-words rounded-lg bg-bg-elevated px-3 py-2 text-sm">
                  {r}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-dim">No rules yet - press Edit to add some.</p>
          )}
        </>
      )}

      <div className="min-w-0 space-y-2">
        <p className="text-sm font-medium">
          Key frames <span className="font-normal text-text-dim">- what the text, fonts, captions and B-roll look like (up to {MAX_FRAMES})</span>
        </p>
        {frames === null ? (
          <p className="flex items-center gap-2 text-xs text-text-dim">
            <Spinner className="h-3 w-3" /> Loading key frames…
          </p>
        ) : frames.length === 0 ? (
          <p className="text-xs text-text-dim">None yet. Add screenshots, or stills from a finished video on your Mac.</p>
        ) : (
          <ul className="flex gap-2 overflow-x-auto pb-1" aria-label={`Key frames for ${style.name}`}>
            {frames.map((f) => (
              <li key={f.id} className="shrink-0">
                <button type="button" onClick={() => setBig(f)} aria-label={`Enlarge ${frameLabel(f)}`} className="block overflow-hidden rounded-lg border border-border hover:border-accent">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.data} alt={frameLabel(f)} className="h-40 w-auto max-w-[12rem] bg-bg-elevated object-cover" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label className={`cursor-pointer rounded-lg border border-border px-3 py-1 text-xs hover:border-accent hover:text-accent ${uploading ? "pointer-events-none opacity-50" : ""}`} aria-busy={uploading}>
            <Busy busy={uploading} label="Adding…">
              Add screenshots
            </Busy>
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => {
                void upload(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <MacButton small mac={mac} busy={grab.busy} onClick={() => grab.start({ kind: "grab", styleId: style.id, deviceId: mac?.id })}>
            <Busy busy={grab.busy} label="Waiting on your Mac…">
              Add key frames from a video on my Mac
            </Busy>
          </MacButton>
        </div>
        <GrabStatus req={grab.req} error={grab.error} mac={mac} />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-xs text-text-muted">
        <span className="font-medium text-text">Used by:</span>
        {style.usedBy.length === 0 ? (
          <span className="text-text-dim">no jobs yet - pick it on a job&apos;s Edits tab</span>
        ) : (
          <>
            {(allJobs ? style.usedBy : style.usedBy.slice(0, USED_BY_SHOWN)).map((u) => (
              <Link key={u.id} href={editsLink(u.id)} className="hover:text-accent">
                {u.name}
                {u.auto && <span className="text-text-dim"> (usual)</span>}
              </Link>
            ))}
            {style.usedBy.length > USED_BY_SHOWN && (
              <button type="button" onClick={() => setAllJobs(!allJobs)} className="text-accent hover:underline">
                {allJobs ? "Show fewer" : `+ ${style.usedBy.length - USED_BY_SHOWN} more`}
              </button>
            )}
          </>
        )}
        <button
          type="button"
          disabled={deleting}
          aria-busy={deleting}
          onClick={async () => {
            if (!(await confirm({ title: `Delete ${style.name}?`, message: "Its rules and key frames go too. Jobs that used it go back to their usual style.", confirmLabel: "Delete", danger: true }))) return;
            setDeleting(true);
            void call(`${api}?id=${style.id}`, "DELETE").then(onDelete, (e: Error) => {
              setError(e.message);
              setDeleting(false);
            });
          }}
          className="ml-auto text-text-dim hover:text-accent disabled:opacity-60"
        >
          <Busy busy={deleting} label="Deleting…">
            Delete style
          </Busy>
        </button>
      </div>
      {error && <p className="text-sm text-accent">{error}</p>}
      {big && <Enlarged frame={big} onClose={() => setBig(null)} onDelete={() => removeFrame(big)} />}
    </article>
  );
}

function GrabStatus({ req, error, mac }: { req: StyleRequest | null; error: string; mac: Device | undefined }) {
  if (error) return <p className="text-xs text-accent">{error}</p>;
  if (!req) return null;
  const text: Record<StyleRequest["status"], string> = {
    waiting: "Waiting for your Mac to pick this up… (is the Creator Desk Helper running?)",
    taken: `Look at ${mac?.name ?? "your Mac"} - pick a finished video in this style, and it sends a few stills from it.`,
    sorting: "Adding the frames…",
    done: req.frames ? `Added ${req.frames} key frame${req.frames === 1 ? "" : "s"} from your Mac.` : "No video was picked, so nothing was added.",
    failed: `That didn't work: ${req.error || "something went wrong"}.`,
    expired: "Your Mac didn't answer in time. Make sure the Creator Desk Helper is running on it, then try again.",
  };
  const going = LIVE.has(req.status);
  return (
    <p className={`flex items-start gap-2 text-xs ${req.status === "failed" || req.status === "expired" ? "text-warn" : req.status === "done" ? "text-good" : "text-accent"}`}>
      {going && <Spinner className="mt-px h-3 w-3" />}
      <span>{text[req.status]}</span>
    </p>
  );
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const frameLabel = (f: StyleFrame) => [f.source || "Key frame", f.at != null && f.at > 0 ? mmss(f.at) : ""].filter(Boolean).join(" · ");

/** A key frame at full size. */
function Enlarged({ frame, onClose, onDelete }: { frame: StyleFrame; onClose: () => void; onDelete: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-label={frameLabel(frame)}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-auto max-h-[92vh] w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-border bg-bg-card p-0 text-text shadow-2xl backdrop:bg-black/60"
    >
      <div className="space-y-2 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={frame.data} alt={frameLabel(frame)} className="max-h-[75vh] w-full rounded-lg bg-bg-elevated object-contain" />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="min-w-0 flex-1 truncate text-text-muted">{frameLabel(frame)}</span>
          <button type="button" onClick={onDelete} className="text-text-dim hover:text-accent">
            Delete
          </button>
          <button type="button" autoFocus onClick={onClose} className="rounded-lg border border-border px-3 py-1 hover:border-accent hover:text-accent">
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** A screenshot shrunk to FRAME_WIDTH wide as a JPEG, small enough to keep (smaller and softer until it fits). */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error(`${file.name} couldn't be opened as a picture.`));
      i.src = url;
    });
    let width = Math.min(FRAME_WIDTH, img.naturalWidth || FRAME_WIDTH);
    for (let tries = 0; tries < 4; tries++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width);
      canvas.height = Math.max(1, Math.round((img.naturalHeight / (img.naturalWidth || 1)) * width));
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const q of [0.82, 0.7, 0.55]) {
        const data = canvas.toDataURL("image/jpeg", q);
        if (data.length <= MAX_FRAME_CHARS) return data;
      }
      width *= 0.75;
    }
    throw new Error(`${file.name} is too big to add - try a smaller screenshot.`);
  } finally {
    URL.revokeObjectURL(url);
  }
}
