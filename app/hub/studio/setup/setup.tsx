"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SYNC_LIVE, memoryFolder, readPath, type SetupFile, type SetupRequest, type SetupSkill, type SetupVersion } from "../../_lib/edits/setup-types";
import { HELPER_FOR_SETUP } from "../../_lib/edits/style-types";
import { call } from "../../projects/[id]/studio/studio";

/* Editing setup: the files Claude Code edits your videos with - its main
   CLAUDE.md, your skills (with their brand profiles and scripts), each edit
   folder's CLAUDE.md and its memory - word for word, carried between your
   Macs and readable here. Edit styles are the short summary; this is the
   whole thing. */

type Sync = { batch: string; startedAt: string; requests: SetupRequest[] };
type Mac = { id: string; name: string; online: boolean; helper: string | null; ready: boolean };
type Data = {
  files: SetupFile[];
  macs: { id: string; name: string; at: string }[];
  skills: SetupSkill[];
  folders: string[];
  sync: Sync | null;
  totals: { files: number; bytes: number; maxFiles: number; maxBytes: number };
  devices: Mac[];
};
const api = "/api/hub/edits/setup";
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const live = (s: Sync | null) => Boolean(s?.requests.some((r) => SYNC_LIVE.has(r.status)));

/** "22 Oct 12:40" */
function when(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${d.toLocaleString("en-GB", { month: "short" })} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
/** "12 KB" */
function size(bytes: number) {
  if (bytes < 1024) return `${bytes} byte${bytes === 1 ? "" : "s"}`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
const plural = (n: number, word: string) => `${n.toLocaleString("en-GB")} ${word}${n === 1 ? "" : "s"}`;

export function SetupPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [open, setOpen] = useState<{ path: string; v: SetupVersion } | null>(null);

  async function load() {
    try {
      setData(await call<Data>(api, "GET"));
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  }
  useEffect(() => {
    call<Data>(api, "GET").then(setData, (e: Error) => setError(e.message));
  }, []);

  // While a sync is going, check on it every couple of seconds; once it's over, show what changed.
  const going = live(data?.sync ?? null);
  const reload = useRef(load);
  useEffect(() => {
    reload.current = load;
  });
  useEffect(() => {
    if (!going) return;
    const t = setInterval(async () => {
      try {
        const { sync } = await call<{ sync: Sync | null }>(`${api}?only=sync`, "GET");
        setData((d) => d && { ...d, sync });
        if (!live(sync)) void reload.current();
      } catch (e) {
        setError(errorText(e));
      }
    }, 2500);
    return () => clearInterval(t);
  }, [going]);

  async function syncAll() {
    setStarting(true);
    setError("");
    try {
      const { sync } = await call<{ sync: Sync }>(api, "POST");
      setData((d) => d && { ...d, sync });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setStarting(false);
    }
  }

  if (!data) return error ? <p className="text-sm text-accent">{error}</p> : <p className="text-sm text-text-muted">Loading your editing setup…</p>;
  const ready = data.devices.filter((d) => d.online && d.ready);
  const lastSynced = data.macs.reduce((t, m) => (m.at > t ? m.at : t), "");
  const conflicts = data.files.filter((f) => f.other);

  return (
    <div className="mx-auto max-w-3xl min-w-0 space-y-6">
      <div>
        <Link href="/hub/studio" className="text-sm text-text-muted hover:text-accent">
          ← Studio
        </Link>
        <h1 className="mt-2 font-serif text-4xl italic sm:text-5xl">Editing setup</h1>
        <p className="mt-2 text-text-muted">
          The files Claude Code follows when it edits your videos - its main instructions, your skills (with their brand profiles, scripts and notes), each edit folder&apos;s CLAUDE.md and
          what Claude has remembered - kept here word for word, so every Mac you edit on has the same setup.
        </p>
        <Link href="/hub/studio/styles" className="mt-2 inline-block text-sm text-accent hover:underline">
          Edit styles - the short summary of how each kind of video looks →
        </Link>
      </div>

      <section className="space-y-3 rounded-2xl border border-border bg-bg-card p-4 sm:p-5" aria-label="Sync your Macs">
        <div className="space-y-1">
          <h2 className="font-semibold">Sync all my Macs</h2>
          <p className="text-sm text-text-muted">
            Each Mac that&apos;s on sends its files here first. Then every Mac gets the newest version of each file, including ones it didn&apos;t have.
          </p>
          <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm">
            <strong>Nothing is ever deleted from a Mac.</strong> If a file on a Mac is replaced with a newer one, the old one is backed up first (in ~/.creator-desk/backups on that Mac).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={syncAll}
            disabled={!ready.length || going || starting}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
          >
            {going ? "Syncing your Macs…" : starting ? "Starting…" : "Sync all my Macs"}
          </button>
          {!data.devices.length && (
            <Link href="/hub/studio/helper" className="text-xs text-accent hover:underline">
              Connect your Mac first →
            </Link>
          )}
        </div>
        <MacList devices={data.devices} />
        {data.sync && <SyncStatus sync={data.sync} />}
        {error && <p className="text-sm text-accent">{error}</p>}
      </section>

      {data.files.length === 0 ? (
        <div className="space-y-2 rounded-xl border border-dashed border-border-strong bg-bg-card p-4 text-sm text-text-muted">
          <p className="font-medium text-text">Nothing here yet.</p>
          <p>
            Press <strong>Sync all my Macs</strong> and each Mac sends its CLAUDE.md, skills and memory files here. You can read every one of them on this page, and your other Macs get them too.
          </p>
        </div>
      ) : (
        <p className="text-sm text-text-muted">
          {plural(data.files.length, "file")} from {plural(data.macs.length, "Mac")}
          {lastSynced && `, last synced ${when(lastSynced)}`}
        </p>
      )}

      {conflicts.length > 0 && <Conflicts files={conflicts} onOpen={(path, v) => setOpen({ path, v })} onChanged={load} />}

      {data.files.length > 0 && <Files files={data.files} folders={data.folders} skills={data.skills} onOpen={(path, v) => setOpen({ path, v })} />}

      {data.skills.length > 0 && <Skills skills={data.skills} onChange={(skills) => setData((d) => d && { ...d, skills })} />}

      {open && <Viewer path={open.path} version={open.v} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Your Macs, and whether each can sync right now. */
function MacList({ devices }: { devices: Mac[] }) {
  if (!devices.length) return null;
  return (
    <ul className="space-y-1 text-sm">
      {devices.map((d) => (
        <li key={d.id} className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{d.name}</span>
          <span className={`text-xs ${d.online && d.ready ? "text-good" : "text-text-dim"}`}>
            {!d.online ? "off - start the Creator Desk Helper on it to sync it" : d.ready ? "on and ready" : `needs the latest helper (${HELPER_FOR_SETUP}) - it updates itself between edits, or close its window and start it again`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SyncStatus({ sync }: { sync: Sync }) {
  return (
    <div className="space-y-2 rounded-xl bg-bg-elevated px-3 py-2 text-sm">
      <p className="text-xs text-text-dim">Sync started {when(sync.startedAt)}</p>
      <ul className="space-y-2">
        {sync.requests.map((r) => (
          <li key={r.id} className="min-w-0">
            <span className="font-medium">{r.mac}: </span>
            <RequestText r={r} />
            <Details r={r} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function RequestText({ r }: { r: SetupRequest }) {
  const sendFailed = r.upload?.error ? ` (it couldn't send its own files: ${r.upload.error})` : "";
  switch (r.status) {
    case "waiting":
      return <span className="text-accent">{r.phase === "upload" ? "Waiting for it to pick this up… (is the Creator Desk Helper running?)" : "Getting ready to get the shared files…"}</span>;
    case "uploading":
      return <span className="text-accent">Sending its files…</span>;
    case "sent":
      return <span className="text-accent">{r.upload?.error ? `Couldn't send its files: ${r.upload.error}. Waiting for your other Macs…` : `Sent ${plural(r.upload?.sent ?? 0, "file")} - waiting for your other Macs…`}</span>;
    case "downloading":
      return <span className="text-accent">Getting the shared files…</span>;
    case "expired":
    case "failed":
      return <span className="text-warn">Didn&apos;t work: {r.error || "something went wrong"}</span>;
    case "done": {
      const d = r.download;
      const got = d?.written.length ?? 0;
      const backed = d?.backedUp.length ?? 0;
      const parts = [r.upload?.sent !== undefined && `sent ${plural(r.upload.sent, "file")}`, `got ${got}`, backed > 0 && `backed up ${backed}${d?.backupDir ? ` (in ${d.backupDir})` : ""}`].filter(Boolean);
      return (
        <span className="text-good">
          Done: {parts.join(", ")}
          {got === 0 && " - already up to date"}
          {sendFailed && <span className="text-warn">{sendFailed}</span>}
        </span>
      );
    }
  }
}

/** What a Mac skipped, or couldn't keep here. */
function Details({ r }: { r: SetupRequest }) {
  const skipped = r.download?.skipped ?? [];
  const notKept = r.notKept ?? [];
  if (!skipped.length && !notKept.length) return null;
  return (
    <details className="mt-1 text-xs text-text-muted">
      <summary className="cursor-pointer">
        {[skipped.length > 0 && `${plural(skipped.length, "file")} left as they were`, notKept.length > 0 && `${plural(notKept.length, "file")} not kept here`].filter(Boolean).join(" · ")}
      </summary>
      <ul className="mt-1 space-y-0.5">
        {[...skipped, ...notKept].map((s, i) => (
          <li key={i} className="break-all">
            <span className="font-mono">{s.path}</span> - {s.why}
          </li>
        ))}
      </ul>
    </details>
  );
}

// ---------------------------------------------------------------- different on your Macs

function Conflicts({ files, onOpen, onChanged }: { files: SetupFile[]; onOpen: (path: string, v: SetupVersion) => void; onChanged: () => Promise<void> }) {
  return (
    <section className="min-w-0 space-y-3 rounded-2xl border border-warn/40 bg-bg-card p-4 sm:p-5" aria-label="Different on your Macs">
      <div className="space-y-1">
        <h2 className="font-semibold">Different on your Macs</h2>
        <p className="text-sm text-text-muted">
          These files were different on your Macs. For now the newer one is the shared version, and the other is kept here too. Choose which to keep, or have Claude combine them so nothing is
          lost - then press <strong>Sync all my Macs</strong> again to send it to your Macs.
        </p>
      </div>
      <ul className="space-y-3">
        {files.map((f) => (
          <Conflict key={f.path} file={f} onOpen={onOpen} onChanged={onChanged} />
        ))}
      </ul>
    </section>
  );
}

function Conflict({ file, onOpen, onChanged }: { file: SetupFile; onOpen: (path: string, v: SetupVersion) => void; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState<"keep" | "combine" | null>(null);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");
  const other = file.other!;
  const versions = [
    { v: file as SetupVersion, label: "shared for now" },
    { v: other, label: "kept too" },
  ];
  const sameName = file.mac === other.mac;
  const name = (v: SetupVersion, i: number) => (sameName ? `${v.mac}'s ${i === 0 ? "newer" : "other"} one` : `${v.mac}'s`);

  async function choose(body: { keep: string } | { combine: true }) {
    setBusy("keep" in body ? "keep" : "combine");
    setError("");
    try {
      const r = await call<{ note?: string }>(`${api}/conflict`, "POST", { path: file.path, ...body });
      setDone(r.note ? `${r.note} Press Sync all my Macs to send it to your Macs.` : "Done - press Sync all my Macs to send it to your Macs.");
      await onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="min-w-0 space-y-2 rounded-xl border border-border bg-bg p-3">
      <p className="break-all font-mono text-sm">{file.path}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {versions.map(({ v, label }, i) => (
          <div key={v.sha} className="min-w-0 rounded-lg bg-bg-elevated px-3 py-2 text-xs text-text-muted">
            <p className="font-medium text-text">
              {name(v, i)} <span className="font-normal text-text-dim">({label})</span>
            </p>
            <p>
              Changed {when(v.mtime)} · {size(v.size)}
            </p>
            {v.binary ? (
              <p className="text-text-dim">Binary file, {size(v.size)}</p>
            ) : (
              <button type="button" onClick={() => onOpen(file.path, v)} className="mt-1 text-accent hover:underline">
                Read it
              </button>
            )}
          </div>
        ))}
      </div>
      {done ? (
        <p className="text-sm text-good">{done}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {versions.map(({ v }, i) => (
            <button
              key={v.sha}
              type="button"
              disabled={Boolean(busy)}
              onClick={() => choose({ keep: v.sha })}
              className="rounded-lg border border-border px-3 py-1.5 text-sm hover:border-accent hover:text-accent disabled:opacity-50"
            >
              Use {name(v, i)}
            </button>
          ))}
          {!file.binary && !other.binary && (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => choose({ combine: true })}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
            >
              {busy === "combine" ? "Claude is combining them…" : "Combine both with Claude"}
            </button>
          )}
        </div>
      )}
      {error && <p className="text-sm text-accent">{error}</p>}
    </li>
  );
}

// ---------------------------------------------------------------- the files

type Group = { key: string; title: string; note?: string; files: SetupFile[] };

/** The files in their groups: main instructions, each skill, each edit folder, each folder's memory. */
function groups(files: SetupFile[], folders: string[]) {
  const main: SetupFile[] = [];
  const skills = new Map<string, SetupFile[]>();
  const editFolders = new Map<string, SetupFile[]>();
  const memory = new Map<string, SetupFile[]>();
  const add = (m: Map<string, SetupFile[]>, k: string, f: SetupFile) => m.set(k, [...(m.get(k) ?? []), f]);
  for (const f of files) {
    const p = readPath(f.path);
    if (!p) continue;
    if (p.kind === "main") main.push(f);
    else if (p.kind === "skill") add(skills, p.skill, f);
    else if (p.kind === "folder") add(editFolders, p.folder, f);
    else add(memory, memoryFolder(p.rest, folders), f);
  }
  const sorted = (m: Map<string, SetupFile[]>, title: (k: string) => string): Group[] =>
    [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, list]) => ({ key: k, title: title(k), files: list }));
  return { main, skills: sorted(skills, (k) => k), editFolders: sorted(editFolders, (k) => k), memory: sorted(memory, (k) => k) };
}

function Files({ files, folders, skills, onOpen }: { files: SetupFile[]; folders: string[]; skills: SetupSkill[]; onOpen: (path: string, v: SetupVersion) => void }) {
  const g = groups(files, folders);
  const left = new Set(skills.filter((s) => s.choice === "exclude").map((s) => s.name));
  return (
    <section className="min-w-0 space-y-5" aria-label="The files">
      {g.main.length > 0 && (
        <Part title="Claude Code's main instructions" note="~/.claude/CLAUDE.md - what Claude Code follows in every folder on your Mac.">
          <FileList files={g.main} onOpen={onOpen} />
        </Part>
      )}
      {g.skills.length > 0 && (
        <Part title="Skills" note="Each skill is a folder of instructions (SKILL.md) and the files beside it, like brand profiles and scripts.">
          {g.skills.map((s) => (
            <Fold key={s.key} title={s.title} sub={`${plural(s.files.length, "file")}${left.has(s.key) ? " · left out of syncing" : ""}`}>
              <FileList files={s.files} onOpen={onOpen} />
            </Fold>
          ))}
        </Part>
      )}
      {g.editFolders.length > 0 && (
        <Part title="Edit folders" note="The CLAUDE.md files in the folders your edits start in.">
          {g.editFolders.map((s) => (
            <Fold key={s.key} title={s.title} sub={plural(s.files.length, "file")} mono>
              <FileList files={s.files} onOpen={onOpen} />
            </Fold>
          ))}
        </Part>
      )}
      {g.memory.length > 0 && (
        <Part title="Memory" note="What Claude Code has remembered while working in each folder.">
          {g.memory.map((s) => (
            <Fold key={s.key} title={s.title} sub={plural(s.files.length, "file")} mono>
              <FileList files={s.files} onOpen={onOpen} />
            </Fold>
          ))}
        </Part>
      )}
    </section>
  );
}

function Part({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-2">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="text-xs text-text-dim">{note}</p>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Fold({ title, sub, mono = false, children }: { title: string; sub: string; mono?: boolean; children: React.ReactNode }) {
  return (
    <details className="min-w-0 rounded-xl border border-border bg-bg-card">
      <summary className="cursor-pointer px-3 py-2 text-sm">
        <span className={`break-all font-medium ${mono ? "font-mono" : ""}`}>{title}</span> <span className="text-xs text-text-dim">· {sub}</span>
      </summary>
      <div className="border-t border-border p-2">{children}</div>
    </details>
  );
}

function FileList({ files, onOpen }: { files: SetupFile[]; onOpen: (path: string, v: SetupVersion) => void }) {
  return (
    <ul className="space-y-1">
      {files.map((f) => (
        <li key={f.path} className="min-w-0">
          {f.binary ? (
            <div className="rounded-lg px-2 py-1.5">
              <p className="break-all font-mono text-xs">{f.path}</p>
              <p className="text-xs text-text-dim">
                Binary file, {size(f.size)} · from {f.mac} · changed {when(f.mtime)}
              </p>
            </div>
          ) : (
            <button type="button" onClick={() => onOpen(f.path, f)} className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-bg-elevated">
              <span className="block break-all font-mono text-xs text-accent">{f.path}</span>
              <span className="block text-xs text-text-dim">
                {size(f.size)} · from {f.mac} · changed {when(f.mtime)}
                {f.other && <span className="text-warn"> · different on your Macs</span>}
              </span>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- which skills

function Skills({ skills, onChange }: { skills: SetupSkill[]; onChange: (s: SetupSkill[]) => void }) {
  const [error, setError] = useState("");
  async function choose(s: SetupSkill, choice: SetupSkill["choice"]) {
    setError("");
    const before = skills;
    onChange(skills.map((x) => (x.name === s.name ? { ...x, choice } : x)));
    try {
      await call(`${api}/skills`, "PATCH", { name: s.name, choice });
    } catch (e) {
      onChange(before);
      setError(errorText(e));
    }
  }
  const isOn = (s: SetupSkill) => (s.choice ? s.choice === "include" : s.files > 0);
  const synced = skills.filter(isOn);
  const left = skills.filter((s) => !isOn(s));
  return (
    <section className="min-w-0 space-y-3 rounded-2xl border border-border bg-bg-card p-4 sm:p-5" aria-label="Which skills">
      <div className="space-y-1">
        <h2 className="font-semibold">Which skills</h2>
        <p className="text-sm text-text-muted">
          Only the skills about editing your videos are carried between your Macs. Untick one to stop it syncing (it stays on your Macs), or switch on one of the others - it applies at the next
          sync.
        </p>
      </div>
      {synced.length > 0 ? (
        <ul className="space-y-2" aria-label="Synced skills">
          {synced.map((s) => (
            <SkillRow key={s.name} s={s} on onChoose={choose} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-text-dim">No skills are synced yet.</p>
      )}
      {left.length > 0 && (
        <details className="min-w-0 rounded-xl border border-border">
          <summary className="cursor-pointer px-3 py-2 text-sm">
            <span className="font-medium">Not synced ({left.length})</span> <span className="text-xs text-text-dim">- not about editing, so they stay on the Mac they&apos;re on</span>
          </summary>
          <ul className="space-y-1 border-t border-border p-2" aria-label="Skills not synced">
            {left.map((s) => (
              <SkillRow key={s.name} s={s} on={false} compact onChoose={choose} />
            ))}
          </ul>
        </details>
      )}
      {error && <p className="text-sm text-accent">{error}</p>}
    </section>
  );
}

function SkillRow({ s, on, compact = false, onChoose }: { s: SetupSkill; on: boolean; compact?: boolean; onChoose: (s: SetupSkill, choice: SetupSkill["choice"]) => void }) {
  return (
    <li className={`flex min-w-0 items-start gap-3 rounded-xl px-3 py-2 ${compact ? "" : "bg-bg-elevated"}`}>
      <input type="checkbox" checked={on} onChange={(e) => onChoose(s, e.target.checked ? "include" : "exclude")} aria-label={`Sync ${s.name}`} className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="break-all font-medium">{s.name}</p>
        {compact ? (
          s.description && <p className="line-clamp-1 text-xs text-text-dim">{s.description}</p>
        ) : (
          <p className="text-xs text-text-muted">
            {s.files > 0 ? `${plural(s.files, "file")} here` : s.skippedBy?.length ? `Left out by ${s.skippedBy.join(" and ")}` : "Not sent yet"}
            {s.description && ` - ${s.description}`}
          </p>
        )}
        {s.choice && (
          <p className="text-xs text-text-dim">
            {s.choice === "include" ? "Always synced (your choice)" : "Never synced (your choice)"} ·{" "}
            <button type="button" onClick={() => onChoose(s, null)} className="text-accent hover:underline">
              let your Macs decide
            </button>
          </p>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------- reading a file

function Viewer({ path, version, onClose }: { path: string; version: SetupVersion; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);
  useEffect(() => {
    call<{ text?: string; binary?: boolean }>(`${api}/file?sha=${version.sha}`, "GET").then(
      (r) => (r.text !== undefined ? setText(r.text) : setError(`Binary file, ${size(version.size)} - it can't be shown here.`)),
      (e: Error) => setError(e.message),
    );
  }, [version.sha, version.size]);
  return (
    <dialog
      ref={dialog}
      aria-label={path}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-auto max-h-[92vh] w-[min(52rem,calc(100vw-1.5rem))] rounded-2xl border border-border bg-bg-card p-0 text-text shadow-2xl backdrop:bg-black/60"
    >
      <div className="flex max-h-[92vh] flex-col gap-2 p-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="break-all font-mono text-sm">{path}</p>
            <p className="text-xs text-text-dim">
              {size(version.size)} · from {version.mac} · changed {when(version.mtime)}
            </p>
          </div>
          <button type="button" autoFocus onClick={onClose} className="shrink-0 rounded-lg border border-border px-3 py-1 text-sm hover:border-accent hover:text-accent">
            Close
          </button>
        </div>
        {error ? (
          <p className="text-sm text-text-muted">{error}</p>
        ) : text === null ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : (
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-bg-elevated p-3 font-mono text-xs leading-relaxed">{text || "(empty file)"}</pre>
        )}
      </div>
    </dialog>
  );
}
