import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { adminClient } from "../supabase/admin";
import { ask, studioErrorMessage } from "../studio/claude";
import type { DeviceAuth } from "./data";
import { BadRequest, NotFound } from "./request";
import {
  MAX_SETUP_BYTES,
  MAX_SETUP_FILE,
  MAX_SETUP_FILES,
  SETUP_CHUNK,
  cleanFolder,
  folderOf,
  readPath,
  skillOf,
  type SetupFile,
  type SetupRequest,
  type SetupSkill,
  type SetupVersion,
} from "./setup-types";

/* Your editing setup's files, word for word, in hub_workspaces rows (every id
   has a ":" so it never looks like a job):
   - "setup:manifest": every file's shared version (and, when two Macs had
     different ones, the other version until you choose), which Mac it came
     from, and what each Mac last had - so a file changed on one Mac since the
     last sync just updates, and only real differences show as conflicts.
   - "setup:blob:<sha>": one file's content, once per distinct content.
   - "setup:settings": which skills to include or leave out.
   - "setupreq:<batch>:<deviceId>": one Mac's part in a sync. Every Mac sends
     its files first; once they all have (or 3 minutes on), every Mac gets the
     shared ones. Nothing is ever deleted from a Mac. */

const MANIFEST = "setup:manifest";
const SETTINGS = "setup:settings";
const BLOB = "setup:blob:";
const REQ = "setupreq:";
const REQ_ID = /^setupreq:[0-9a-f-]{36}:[0-9a-f-]{36}$/i;
/** A Mac that hasn't picked up its part in this long is dropped. */
const WAIT_MS = 10 * 60_000;
/** Macs still sending after this long don't hold the others up: everyone moves on to getting the files. */
const FLIP_MS = 3 * 60_000;
/** Once picked up, how long before we stop waiting to hear back. */
const ANSWER_MS = 15 * 60_000;

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");
export const validSha = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{64}$/.test(s);

type Version = SetupVersion & { macId: string | null };
/** seen: the content each Mac (by id) had at its last sync. */
type Entry = Version & { other?: Version; seen?: Record<string, string> };
type Manifest = {
  rev: number;
  files: Record<string, Entry>;
  /** Each Mac's name and when it last synced. */
  macs: Record<string, { name: string; at: string }>;
  /** Skills each Mac left out (its own judgement), with what they're for. */
  skipped: Record<string, { name: string; description: string }[]>;
  /** Content being saved right now, kept safe from tidying. */
  pending?: string[];
};
type Settings = { include: string[]; exclude: string[] };

const db = () => adminClient().from("hub_workspaces");

// ---------------------------------------------------------------- settings

export async function setupSettings(userId: string): Promise<Settings> {
  const { data } = await db().select("data").eq("user_id", userId).eq("project_id", SETTINGS).maybeSingle<{ data: Partial<Settings> }>();
  return { include: data?.data?.include ?? [], exclude: data?.data?.exclude ?? [] };
}

/** Include a skill, leave it out, or (null) let your Macs decide. */
export async function setSkillChoice(userId: string, name: string, choice: "include" | "exclude" | null) {
  const s = await setupSettings(userId);
  const next: Settings = { include: s.include.filter((n) => n !== name), exclude: s.exclude.filter((n) => n !== name) };
  if (choice) next[choice].push(name);
  const { error } = await db().upsert({ user_id: userId, project_id: SETTINGS, data: next, updated_at: new Date().toISOString() });
  if (error) throw error;
  return next;
}

const leftOut = (path: string, s: Settings) => {
  const skill = skillOf(path);
  return Boolean(skill && s.exclude.includes(skill));
};

/** The folders your jobs' edits start in ("~/…" only), each once. */
async function editFolders(userId: string) {
  const { data } = await db().select("folder:data->>folder").eq("user_id", userId).like("project_id", "editcfg:%");
  return [...new Set(((data ?? []) as { folder: string | null }[]).map((r) => cleanFolder(r.folder ?? "")).filter((f): f is string => Boolean(f)))];
}

/** Every edit folder a Mac should write to: your jobs' folders, and every folder a Mac has sent files from
    (each Mac's own working folder arrives as "~/…", which is the only way the other Mac knows about it). */
async function syncFolders(userId: string, m?: Manifest) {
  const [jobs, manifest] = await Promise.all([editFolders(userId), m ?? readManifest(userId).then((r) => r.m)]);
  const seen = Object.keys(manifest.files).map(folderOf).filter((f): f is string => Boolean(f));
  return [...new Set([...jobs, ...seen])];
}

// ---------------------------------------------------------------- the manifest

async function readManifest(userId: string): Promise<{ m: Manifest; exists: boolean }> {
  const { data } = await db().select("data").eq("user_id", userId).eq("project_id", MANIFEST).maybeSingle<{ data: Partial<Manifest> }>();
  const d = data?.data ?? {};
  return { m: { rev: d.rev ?? 0, files: d.files ?? {}, macs: d.macs ?? {}, skipped: d.skipped ?? {}, pending: d.pending ?? [] }, exists: Boolean(data) };
}

/** Every content the manifest points at (and any being saved). */
const refs = (m: Manifest) => new Set([...Object.values(m.files).flatMap((e) => (e.other ? [e.sha, e.other.sha] : [e.sha])), ...(m.pending ?? [])]);

function totalBytes(m: Manifest) {
  const sizes = new Map<string, number>();
  for (const e of Object.values(m.files)) {
    sizes.set(e.sha, e.size);
    if (e.other) sizes.set(e.other.sha, e.other.size);
  }
  return [...sizes.values()].reduce((a, b) => a + b, 0);
}

/** Change the manifest safely when two Macs send at once: it's written only if nobody changed it since it was read, otherwise read again and redone.
    fn returns false to leave it as it is. Content nothing points at any more is tidied away afterwards. */
async function changeManifest(userId: string, fn: (m: Manifest) => boolean) {
  for (let tries = 0; tries < 12; tries++) {
    const { m: old, exists } = await readManifest(userId);
    const m = structuredClone(old);
    if (!fn(m)) return m;
    m.rev = old.rev + 1;
    const now = new Date().toISOString();
    let saved = false;
    if (!exists) {
      const { error } = await db().insert({ user_id: userId, project_id: MANIFEST, data: m, updated_at: now });
      if (error && error.code !== "23505") throw error;
      saved = !error;
    } else {
      const { data, error } = await db().update({ data: m, updated_at: now }).eq("user_id", userId).eq("project_id", MANIFEST).eq("data->>rev", String(old.rev)).select("project_id");
      if (error) throw error;
      saved = Boolean(data?.length);
    }
    if (saved) {
      const kept = refs(m);
      if ([...refs(old)].some((sha) => !kept.has(sha))) await tidyBlobs(userId);
      return m;
    }
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 160));
  }
  throw new Error("Your editing setup kept changing while it was being saved.");
}

/** Delete content nothing points at any more - except what a Mac is sending right now. */
async function tidyBlobs(userId: string) {
  // In this order: anything listed here was saved after the Mac said it was sending it, or after it was referenced.
  const ids: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db().select("project_id").eq("user_id", userId).like("project_id", `${BLOB}%`).range(from, from + 999);
    ids.push(...(data ?? []).map((r) => r.project_id as string));
    if ((data ?? []).length < 1000) break;
  }
  if (!ids.length) return;
  const { data: sending } = await db().select("want:data->want").eq("user_id", userId).like("project_id", `${REQ}%`).eq("data->>state", "upload:working");
  const keep = refs((await readManifest(userId)).m);
  for (const r of (sending ?? []) as { want: string[] | null }[]) for (const sha of r.want ?? []) keep.add(sha);
  const gone = ids.filter((id) => !keep.has(id.slice(BLOB.length)));
  for (let i = 0; i < gone.length; i += 100) await db().delete().eq("user_id", userId).in("project_id", gone.slice(i, i + 100));
}

type Incoming = { path: string; sha: string; size: number; mtime: string; exec: boolean; binary: boolean };
type Mac = { id: string; name: string };

/** What a Mac's version of a file means for the shared one:
    same: nothing new (it's the shared one, the other kept one, or what this Mac already had at its last sync - it gets the shared one next)
    update: changed on this Mac since it last had the shared one - it becomes the shared one
    newer / older: a different version than the shared one, from a Mac that didn't have it - a conflict, and the newer one (by the file's own time) is shared. */
function decide(e: Entry | undefined, f: Incoming, macId: string): "new" | "same" | "update" | "newer" | "older" {
  if (!e) return "new";
  if (f.sha === e.sha || f.sha === e.other?.sha) return "same";
  const had = e.seen?.[macId];
  if (had === f.sha) return "same";
  if (had === e.sha) return "update";
  return Date.parse(f.mtime) > Date.parse(e.mtime) ? "newer" : "older";
}

const versionOf = (e: Entry): Version => ({ sha: e.sha, size: e.size, mtime: e.mtime, exec: e.exec, binary: e.binary, mac: e.mac, macId: e.macId, updatedAt: e.updatedAt });

/** Add a Mac's version of a file (its content already kept). Returns whether anything changed, or why it couldn't be kept. */
function apply(m: Manifest, f: Incoming, mac: Mac, now: string): { changed: boolean; why?: string } {
  const e = m.files[f.path];
  const d = decide(e, f, mac.id);
  if (d === "same") {
    if (e!.seen?.[mac.id] === f.sha) return { changed: false };
    e!.seen = { ...e!.seen, [mac.id]: f.sha };
    return { changed: true };
  }
  if (d === "new" && Object.keys(m.files).length >= MAX_SETUP_FILES) return { changed: false, why: `Creator Desk keeps up to ${MAX_SETUP_FILES.toLocaleString("en-GB")} files` };
  if (!refs(m).has(f.sha) && totalBytes(m) + f.size > MAX_SETUP_BYTES) return { changed: false, why: `Creator Desk keeps up to ${MAX_SETUP_BYTES / 1024 / 1024} MB of your setup` };
  const v: Version = { sha: f.sha, size: f.size, mtime: f.mtime, exec: f.exec, binary: f.binary, mac: mac.name, macId: mac.id, updatedAt: now };
  const seen = { ...e?.seen, [mac.id]: f.sha };
  if (d === "new") m.files[f.path] = { ...v, seen };
  else if (d === "update") m.files[f.path] = { ...v, ...(e!.other && { other: e!.other }), seen };
  else if (d === "newer") m.files[f.path] = { ...v, other: versionOf(e!), seen };
  else m.files[f.path] = { ...e!, other: v, seen };
  return { changed: true };
}

// ---------------------------------------------------------------- content

async function saveBlobs(userId: string, blobs: { sha: string; size: number; text?: string; base64?: string }[]) {
  const now = new Date().toISOString();
  const rows = [...new Map(blobs.map((b) => [b.sha, b])).values()].map((b) => ({
    user_id: userId,
    project_id: `${BLOB}${b.sha}`,
    data: { size: b.size, ...(b.base64 !== undefined ? { base64: b.base64 } : { text: b.text }) },
    updated_at: now,
  }));
  if (!rows.length) return;
  const { error } = await db().upsert(rows);
  if (error) throw error;
}

async function loadBlobs(userId: string, shas: string[]) {
  const out = new Map<string, { text?: string; base64?: string }>();
  const ids = [...new Set(shas)].map((s) => `${BLOB}${s}`);
  for (let i = 0; i < ids.length; i += 40) {
    const { data, error } = await db().select("project_id, data").eq("user_id", userId).in("project_id", ids.slice(i, i + 40));
    if (error) throw error;
    for (const r of (data ?? []) as { project_id: string; data: { text?: string; base64?: string } }[]) out.set(r.project_id.slice(BLOB.length), r.data);
  }
  return out;
}

/** One file's content for the page: its text, or that it's binary (no viewer). */
export async function setupContent(userId: string, sha: string) {
  const blob = (await loadBlobs(userId, [sha])).get(sha);
  if (!blob) return null;
  return blob.text !== undefined ? { text: blob.text } : { binary: true as const };
}

// ---------------------------------------------------------------- syncs

type State = "upload:waiting" | "upload:working" | "upload:done" | "download:waiting" | "download:working" | "done" | "failed";
type ReqData = {
  batch: string;
  deviceId: string;
  mac: string;
  state: State;
  createdAt: string;
  /** When the current waiting began (for expiry) and when this Mac picked up its current part. */
  since?: string;
  handedAt?: string;
  /** The batch moved on to getting the files (set on every Mac's request). */
  flippedAt?: string;
  upload?: SetupRequest["upload"];
  download?: SetupRequest["download"];
  notKept?: SetupRequest["notKept"];
  /** Content this Mac is about to send (kept safe from tidying), and what it was given to download, by path. */
  want?: string[];
  gave?: Record<string, string>;
};
type Light = Omit<ReqData, "want" | "gave"> & { project_id: string };
// Everything but the long lists, for the checks that run on every poll.
const LIGHT =
  "project_id, batch:data->>batch, deviceId:data->>deviceId, mac:data->>mac, state:data->>state, createdAt:data->>createdAt, since:data->>since, handedAt:data->>handedAt, flippedAt:data->>flippedAt, upload:data->upload, download:data->download, notKept:data->notKept";

async function lightRows(userId: string, pattern: string) {
  const { data, error } = await db().select(LIGHT).eq("user_id", userId).like("project_id", pattern);
  if (error) throw error;
  return ((data ?? []) as unknown as Light[]).map((r) => ({ ...r, since: r.since ?? undefined, handedAt: r.handedAt ?? undefined, flippedAt: r.flippedAt ?? undefined, upload: r.upload ?? undefined, download: r.download ?? undefined, notKept: r.notKept ?? undefined }));
}

/** A part nobody picked up in time reads as expired; one picked up but never finished, as failed. */
function stale(r: Light): "expired" | "failed" | null {
  const now = Date.now();
  if (r.state.endsWith(":waiting") && now - Date.parse(r.since ?? r.createdAt) > WAIT_MS) return "expired";
  if (r.state.endsWith(":working") && now - Date.parse(r.handedAt ?? r.createdAt) > ANSWER_MS) return "failed";
  return null;
}

const STATUS: Record<State, SetupRequest["status"]> = {
  "upload:waiting": "waiting",
  "upload:working": "uploading",
  "upload:done": "sent",
  "download:waiting": "waiting",
  "download:working": "downloading",
  done: "done",
  failed: "failed",
};

function view(r: Light): SetupRequest {
  const s = stale(r);
  const error =
    s === "failed" ? "Your Mac stopped answering partway (asleep, or its helper was closed)." : s === "expired" ? "Your Mac didn't pick this up in time - is the Creator Desk Helper running on it?" : r.state === "failed" ? r.download?.error || "Something went wrong on your Mac." : undefined;
  return {
    id: r.project_id,
    batch: r.batch,
    deviceId: r.deviceId,
    mac: r.mac,
    phase: r.state.startsWith("upload:") ? "upload" : "download",
    status: s ?? STATUS[r.state],
    createdAt: r.createdAt,
    ...(error && { error }),
    ...(r.upload && { upload: r.upload }),
    ...(r.download && { download: r.download }),
    ...(r.notKept?.length && { notKept: r.notKept }),
  };
}

/** Move a request on, only if it's still in one of the states it was read in (so two Macs, or a Mac and this page, can't both move it). */
async function patchReq(userId: string, id: string, from: State[], patch: Partial<ReqData>) {
  const { data: row } = await db().select("data").eq("user_id", userId).eq("project_id", id).maybeSingle<{ data: ReqData }>();
  if (!row || !from.includes(row.data.state)) return null;
  const next = { ...row.data, ...patch };
  const { data } = await db().update({ data: next, updated_at: new Date().toISOString() }).eq("user_id", userId).eq("project_id", id).eq("data->>state", row.data.state).select("project_id");
  return data?.length ? next : null;
}

/** Start a sync: one request for each of these Macs (any earlier sync is cleared away). */
export async function createSync(userId: string, macs: Mac[]) {
  await db().delete().eq("user_id", userId).like("project_id", `${REQ}%`);
  const batch = randomUUID();
  const now = new Date().toISOString();
  const rows = macs.map((m) => ({ user_id: userId, project_id: `${REQ}${batch}:${m.id}`, data: { batch, deviceId: m.id, mac: m.name, state: "upload:waiting", createdAt: now, since: now } satisfies ReqData }));
  const { error } = await db().insert(rows);
  if (error) throw error;
  // The sync's tidy-up may have freed content held for a Mac that was sending.
  await tidyBlobs(userId);
  return { batch, startedAt: now, requests: rows.map((r) => view({ project_id: r.project_id, ...r.data })) };
}

/** Once every Mac has sent its files (or failed to), or 3 minutes after the sync started, every Mac moves on to getting the shared files.
    A Mac still sending then moves on as soon as it's done. Returns whether anything moved. */
async function advance(userId: string, rows: Light[]) {
  if (!rows.length) return false;
  const now = new Date().toISOString();
  const started = Math.min(...rows.map((r) => Date.parse(r.createdAt)));
  const sending = (r: Light) => r.state === "upload:working" && stale(r) !== "failed";
  const flipped = rows.some((r) => r.flippedAt);
  const allSent = rows.every((r) => r.state !== "upload:waiting" && !sending(r));
  if (!flipped && !allSent && Date.now() - started < FLIP_MS) return false;
  let moved = false;
  for (const r of rows) {
    const flippedAt = r.flippedAt ?? now;
    if (r.state === "upload:waiting" || r.state === "upload:done") {
      moved = Boolean(await patchReq(userId, r.project_id, [r.state], { state: "download:waiting", since: now, handedAt: undefined, flippedAt })) || moved;
    } else if (r.state === "upload:working" && !sending(r)) {
      const upload = { finishedAt: now, error: "Your Mac stopped answering while sending its files." };
      moved = Boolean(await patchReq(userId, r.project_id, ["upload:working"], { state: "download:waiting", since: now, handedAt: undefined, flippedAt, upload, want: [] })) || moved;
    } else if (r.state === "upload:working" && !r.flippedAt) {
      moved = Boolean(await patchReq(userId, r.project_id, ["upload:working"], { flippedAt })) || moved;
    }
  }
  return moved;
}

/** The latest sync, each Mac's part in it, moved on if it's time. */
export async function latestSync(userId: string) {
  const all = await lightRows(userId, `${REQ}%`);
  if (!all.length) return null;
  const batch = all.reduce((a, b) => (b.createdAt > a.createdAt ? b : a)).batch;
  let rows = all.filter((r) => r.batch === batch);
  if (await advance(userId, rows)) rows = await lightRows(userId, `${REQ}${batch}:%`);
  const startedAt = rows.reduce((t, r) => (r.createdAt < t ? r.createdAt : t), rows[0]?.createdAt ?? "");
  return { batch, startedAt, requests: rows.map(view).sort((a, b) => a.mac.localeCompare(b.mac)) };
}

export type SetupWork = { id: string; phase: "upload" | "download"; skills: Settings; folders: string[] };

/** For the helper's poll: this Mac's part in a sync, if it's its turn. Each part is handed out once. */
export async function setupWorkFor(auth: DeviceAuth): Promise<SetupWork | null> {
  const mine = await lightRows(auth.userId, `${REQ}%:${auth.deviceId}`);
  let r = mine.reduce<Light | null>((a, b) => (!a || b.createdAt > a.createdAt ? b : a), null);
  if (!r) return null;
  if (r.state.startsWith("upload:") && (await advance(auth.userId, await lightRows(auth.userId, `${REQ}${r.batch}:%`)))) {
    r = (await lightRows(auth.userId, r.project_id))[0] ?? null;
    if (!r) return null;
  }
  if ((r.state !== "upload:waiting" && r.state !== "download:waiting") || stale(r)) return null;
  const phase = r.state === "upload:waiting" ? "upload" : "download";
  if (!(await patchReq(auth.userId, r.project_id, [r.state], { state: `${phase}:working`, handedAt: new Date().toISOString() }))) return null;
  const [skills, folders] = await Promise.all([setupSettings(auth.userId), syncFolders(auth.userId)]);
  return { id: r.project_id, phase, skills, folders };
}

/** This Mac's own request, in one of these states. */
async function ownRequest(auth: DeviceAuth, id: string, states: State[]) {
  if (!REQ_ID.test(id) || !id.endsWith(`:${auth.deviceId}`)) return null;
  const { data } = await db().select("data").eq("user_id", auth.userId).eq("project_id", id).maybeSingle<{ data: ReqData }>();
  return data && states.includes(data.data.state) ? data.data : null;
}

const GONE = { ok: false, error: "That sync isn't going any more - press Sync on Creator Desk again." } as const;

// ---------------------------------------------------------------- your Mac sends its files

type Listed = { path: string; sha: string; size: number; mtime: string; exec: boolean };

/** Each path once (the last one listed), only real setup paths with a proper sha and time, and none from skills you've left out. */
function usable<F extends { path: string; sha: string; mtime: string }>(files: F[], settings: Settings): F[] {
  return [...new Map(files.map((f) => [f.path, f])).values()]
    .filter((f) => readPath(f.path) && validSha(f.sha) && !Number.isNaN(Date.parse(f.mtime)) && !leftOut(f.path, settings))
    .map((f) => ({ ...f, mtime: new Date(f.mtime).toISOString() }));
}

/** A Mac lists every file it has: ones whose content Creator Desk already holds are added straight away; it's asked to send the rest. */
export async function receiveList(auth: DeviceAuth, id: string, files: Listed[], skippedSkills: { name: string; description: string }[]) {
  const req = await ownRequest(auth, id, ["upload:working"]);
  if (!req) return GONE;
  const settings = await setupSettings(auth.userId);
  const list = usable(files, settings);
  const mac = { id: auth.deviceId, name: req.mac };
  const now = new Date().toISOString();
  let want: Listed[] = [];
  let notKept: { path: string; why: string }[] = [];
  await changeManifest(auth.userId, (m) => {
    want = [];
    notKept = [];
    const held = new Map<string, boolean>();
    for (const e of Object.values(m.files)) {
      held.set(e.sha, e.binary);
      if (e.other) held.set(e.other.sha, e.other.binary);
    }
    for (const f of list) {
      const binary = held.get(f.sha);
      if (binary !== undefined) {
        const r = apply(m, { ...f, binary }, mac, now);
        if (r.why) notKept.push({ path: f.path, why: r.why });
      } else if (decide(m.files[f.path], { ...f, binary: false }, mac.id) !== "same") want.push(f);
    }
    // Only ask for what there's room for.
    let count = Object.keys(m.files).length;
    let bytes = totalBytes(m);
    want = want.filter((f) => {
      const fresh = !m.files[f.path];
      const why = fresh && count >= MAX_SETUP_FILES ? `Creator Desk keeps up to ${MAX_SETUP_FILES.toLocaleString("en-GB")} files` : bytes + f.size > MAX_SETUP_BYTES ? `Creator Desk keeps up to ${MAX_SETUP_BYTES / 1024 / 1024} MB of your setup` : f.size > MAX_SETUP_FILE ? `Files over ${MAX_SETUP_FILE / 1024 / 1024} MB aren't carried` : "";
      if (why) {
        notKept.push({ path: f.path, why });
        return false;
      }
      if (fresh) count++;
      bytes += f.size;
      return true;
    });
    m.skipped[mac.id] = skippedSkills.slice(0, 200);
    m.macs[mac.id] = { name: mac.name, at: m.macs[mac.id]?.at ?? now };
    return true;
  });
  // Said before any content arrives, so tidying never takes it away mid-sync.
  await patchReq(auth.userId, id, ["upload:working"], { want: [...new Set(want.map((f) => f.sha))], notKept: notKept.slice(0, 200) });
  return { want: want.map((f) => f.path) };
}

type Sent = Listed & { text?: string; base64?: string };

/** A Mac sends the files it was asked for. Ones whose content doesn't match their sha, or that are too big, are skipped. */
export async function receiveFiles(auth: DeviceAuth, id: string, files: Sent[]) {
  const req = await ownRequest(auth, id, ["upload:working"]);
  if (!req) return GONE;
  const settings = await setupSettings(auth.userId);
  const good: (Incoming & { text?: string; base64?: string })[] = [];
  for (const f of usable(files, settings)) {
    if ((f.text === undefined) === (f.base64 === undefined)) continue;
    const bytes = f.text !== undefined ? Buffer.from(f.text, "utf8") : Buffer.from(f.base64!, "base64");
    if (bytes.length > MAX_SETUP_FILE || sha256(bytes) !== f.sha) continue;
    // Text with a NUL in it can't be kept as text, so it's kept as bytes.
    const binary = f.text === undefined || f.text.includes("\0");
    good.push({ path: f.path, sha: f.sha, size: bytes.length, mtime: f.mtime, exec: f.exec, binary, ...(binary ? { base64: bytes.toString("base64") } : { text: f.text }) });
  }
  if (!good.length) return { ok: true, saved: 0 };
  await saveBlobs(auth.userId, good);
  const mac = { id: auth.deviceId, name: req.mac };
  const now = new Date().toISOString();
  let notKept: { path: string; why: string }[] = [];
  await changeManifest(auth.userId, (m) => {
    notKept = [];
    let changed = false;
    for (const f of good) {
      const r = apply(m, { path: f.path, sha: f.sha, size: f.size, mtime: f.mtime, exec: f.exec, binary: f.binary }, mac, now);
      changed ||= r.changed;
      if (r.why) notKept.push({ path: f.path, why: r.why });
    }
    return changed;
  });
  if (notKept.length) {
    const cur = await ownRequest(auth, id, ["upload:working"]);
    if (cur) await patchReq(auth.userId, id, ["upload:working"], { notKept: [...(cur.notKept ?? []), ...notKept].slice(0, 200) });
  }
  return { ok: true, saved: good.length };
}

// ---------------------------------------------------------------- your Mac gets the shared files

/** Every file's shared version (leaving out skills you've turned off), for a Mac to compare with what it has. */
export async function sendList(auth: DeviceAuth, id: string) {
  const req = await ownRequest(auth, id, ["download:working"]);
  if (!req) return GONE;
  const [{ m }, settings] = await Promise.all([readManifest(auth.userId), setupSettings(auth.userId)]);
  const files = Object.entries(m.files)
    .filter(([path]) => !leftOut(path, settings))
    .map(([path, e]) => ({ path, sha: e.sha, size: e.size, mtime: e.mtime, exec: e.exec }));
  // Remembered, so once it's done we know what this Mac has.
  await patchReq(auth.userId, id, ["download:working"], { gave: Object.fromEntries(files.map((f) => [f.path, f.sha])) });
  return { files, folders: await syncFolders(auth.userId, m) };
}

/** The content of the files a Mac asks for, stopping before about 3.5 MB (it asks again for the rest). */
export async function sendFiles(auth: DeviceAuth, id: string, paths: string[]) {
  const req = await ownRequest(auth, id, ["download:working"]);
  if (!req) return GONE;
  const [{ m }, settings] = await Promise.all([readManifest(auth.userId), setupSettings(auth.userId)]);
  let room = SETUP_CHUNK;
  const chosen: [string, Entry][] = [];
  for (const path of new Set(paths)) {
    const e = m.files[path];
    if (!e || leftOut(path, settings)) continue;
    const cost = e.binary ? Math.ceil(e.size / 3) * 4 : e.size;
    if (chosen.length && cost > room) break;
    room -= cost;
    chosen.push([path, e]);
  }
  const blobs = await loadBlobs(auth.userId, chosen.map(([, e]) => e.sha));
  return {
    files: chosen.flatMap(([path, e]) => {
      const b = blobs.get(e.sha);
      if (!b) return [];
      return [{ path, sha: e.sha, exec: e.exec, ...(b.base64 !== undefined ? { base64: b.base64 } : { text: b.text ?? "" }) }];
    }),
  };
}

// ---------------------------------------------------------------- your Mac says how it went

export type Finished = { phase: "upload" | "download"; error?: string; sent?: number; written?: string[]; backedUp?: string[]; backupDir?: string; skipped?: { path: string; why: string }[] };

export async function finishPart(auth: DeviceAuth, id: string, b: Finished) {
  const now = new Date().toISOString();
  if (b.phase === "upload") {
    const req = await ownRequest(auth, id, ["upload:working"]);
    if (!req) return GONE;
    const upload = { finishedAt: now, ...(b.error && { error: b.error.slice(0, 500) }), ...(b.sent !== undefined && { sent: b.sent }) };
    // If the others have already moved on, this Mac goes straight on to getting the files.
    const next: Partial<ReqData> = req.flippedAt ? { state: "download:waiting", since: now } : { state: "upload:done" };
    await patchReq(auth.userId, id, ["upload:working"], { ...next, handedAt: undefined, upload, want: [] });
    await changeManifest(auth.userId, (m) => {
      m.macs[auth.deviceId] = { name: req.mac, at: now };
      return true;
    });
    await advance(auth.userId, await lightRows(auth.userId, `${REQ}${req.batch}:%`));
    // Content it sent that didn't end up in the setup goes.
    await tidyBlobs(auth.userId);
    return { ok: true };
  }
  const req = await ownRequest(auth, id, ["download:working"]);
  if (!req) return GONE;
  const written = (b.written ?? []).slice(0, 2000);
  const skipped = (b.skipped ?? []).slice(0, 500).map((s) => ({ path: s.path.slice(0, 500), why: s.why.slice(0, 300) }));
  const download = { finishedAt: now, ...(b.error && { error: b.error.slice(0, 500) }), written, backedUp: (b.backedUp ?? []).slice(0, 2000), ...(b.backupDir && { backupDir: b.backupDir.slice(0, 500) }), skipped };
  await patchReq(auth.userId, id, ["download:working"], { state: b.error ? "failed" : "done", handedAt: undefined, download, gave: {} });
  // What this Mac has now: everything it was given, except what it skipped (or, if it stopped partway, just what it wrote).
  const skip = new Set(skipped.map((s) => s.path));
  const wrote = new Set(written);
  await changeManifest(auth.userId, (m) => {
    for (const [path, sha] of Object.entries(req.gave ?? {})) {
      const e = m.files[path];
      if (!e || skip.has(path) || (b.error && !wrote.has(path)) || e.seen?.[auth.deviceId] === sha) continue;
      e.seen = { ...e.seen, [auth.deviceId]: sha };
    }
    m.macs[auth.deviceId] = { name: req.mac, at: now };
    return true;
  });
  return { ok: true };
}

// ---------------------------------------------------------------- the page

const forPage = (v: Version): SetupVersion => ({ sha: v.sha, size: v.size, mtime: v.mtime, exec: v.exec, binary: v.binary, mac: v.mac, updatedAt: v.updatedAt });

/** Everything the Editing setup page shows: the files, your Macs, the skills, and the latest sync. */
export async function setupOverview(userId: string) {
  const [{ m }, settings, sync] = await Promise.all([readManifest(userId), setupSettings(userId), latestSync(userId)]);
  const folders = await syncFolders(userId, m);
  const files: SetupFile[] = Object.entries(m.files)
    .map(([path, e]) => ({ path, ...forPage(e), ...(e.other && { other: forPage(e.other) }) }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const choice = (name: string) => (settings.include.includes(name) ? "include" : settings.exclude.includes(name) ? "exclude" : null);
  const skills = new Map<string, SetupSkill>();
  const skill = (name: string) => skills.get(name) ?? skills.set(name, { name, files: 0, choice: choice(name) }).get(name)!;
  for (const f of files) {
    const s = skillOf(f.path);
    if (s) skill(s).files++;
  }
  for (const [macId, list] of Object.entries(m.skipped)) {
    for (const k of list) {
      const s = skill(k.name);
      s.description ||= k.description;
      const mac = m.macs[macId]?.name;
      if (mac && !s.skippedBy?.includes(mac)) s.skippedBy = [...(s.skippedBy ?? []), mac];
    }
  }
  for (const name of [...settings.include, ...settings.exclude]) skill(name);
  return {
    files,
    macs: Object.entries(m.macs).map(([id, v]) => ({ id, ...v })),
    skills: [...skills.values()].sort((a, b) => a.name.localeCompare(b.name)),
    folders,
    sync,
    totals: { files: files.length, bytes: totalBytes(m), maxFiles: MAX_SETUP_FILES, maxBytes: MAX_SETUP_BYTES },
  };
}

// ---------------------------------------------------------------- different on your Macs

/** Keep one of a file's two versions (by its sha): it's what every Mac gets at the next sync. */
export async function chooseVersion(userId: string, path: string, keep: string) {
  let found: "ok" | "gone" | "other" = "gone";
  await changeManifest(userId, (m) => {
    const e = m.files[path];
    if (!e?.other) return false;
    if (keep === e.sha) {
      delete e.other;
    } else if (keep === e.other.sha) {
      m.files[path] = { ...e.other, updatedAt: new Date().toISOString(), ...(e.seen && { seen: e.seen }) };
    } else {
      found = "other";
      return false;
    }
    found = "ok";
    return true;
  });
  if (found === "gone") throw new NotFound("That file isn't different on your Macs any more.");
  if (found === "other") throw new BadRequest("That version has changed - reload the page.");
}

const COMBINE_SYSTEM = `You combine two versions of a file from a video creator's editing setup.

The creator edits their short-form videos in CapCut with Claude Code on two Macs. Claude Code follows files like this one - a CLAUDE.md, a skill (SKILL.md and the files beside it, such as brand profiles and scripts), or a memory file - and this one ended up different on each Mac. You're given both versions, with which Mac each came from and when it was last changed.

Write the one version that keeps everything from both:
- Every rule, instruction, note, example, brand profile, script, list item and detail in either version stays in. Never drop, shorten or summarise anything.
- Where both say the same thing, keep it once.
- Where they truly disagree, keep the newer version's wording and put the older one's right beside it, marked as from the other Mac, so nothing is lost.
- Keep the file's own format and layout exactly: markdown stays markdown, front matter stays at the very top, headings, order, code and spacing stay as they were. Claude Code reads it, so write nothing about the merge inside the file.

text: the whole combined file, exactly as it should be saved.
note: one or two plain, friendly sentences to the creator saying what was different between the two and how you combined them.`;

const Combined = z.object({ text: z.string(), note: z.string() });
/** Both versions together, at most (bigger files are for choosing one). */
const MAX_COMBINE = 400_000;

/** Claude combines a text file's two versions into one that keeps everything from both; that becomes the shared version. */
export async function combineVersions(userId: string, path: string) {
  const e = (await readManifest(userId)).m.files[path];
  if (!e?.other) throw new NotFound("That file isn't different on your Macs any more.");
  if (e.binary || e.other.binary) throw new BadRequest("Only text files can be combined - pick one version instead.");
  if (e.size + e.other.size > MAX_COMBINE) throw new BadRequest("These are too long for Claude to combine - pick one version instead.");
  const blobs = await loadBlobs(userId, [e.sha, e.other.sha]);
  const a = blobs.get(e.sha)?.text, b = blobs.get(e.other.sha)?.text;
  if (a === undefined || b === undefined) throw new NotFound("One of the versions is missing - press Sync again.");
  const [older, newer] = Date.parse(e.mtime) >= Date.parse(e.other.mtime) ? [{ v: e.other, text: b }, { v: e, text: a }] : [{ v: e, text: a }, { v: e.other, text: b }];
  const attr = (s: string) => s.replace(/"/g, "'");
  let answer: z.infer<typeof Combined>;
  try {
    answer = await ask({
      system: COMBINE_SYSTEM,
      content: [
        {
          type: "text",
          text: [
            `The file: ${path}`,
            `<version which="older" mac="${attr(older.v.mac)}" changed="${older.v.mtime}">\n${older.text}\n</version>`,
            `<version which="newer" mac="${attr(newer.v.mac)}" changed="${newer.v.mtime}">\n${newer.text}\n</version>`,
          ].join("\n\n"),
        },
      ],
      schema: Combined,
      effort: "low",
    });
  } catch (err) {
    throw new BadRequest(studioErrorMessage(err));
  }
  const bytes = Buffer.from(answer.text, "utf8");
  if (!answer.text.trim() || bytes.length > MAX_SETUP_FILE) throw new BadRequest("Claude's combined version didn't come out right - try again, or pick one version.");
  const sha = sha256(bytes);
  const now = new Date().toISOString();
  // Kept safe from tidying until the file points at it.
  await changeManifest(userId, (m) => {
    m.pending = [...(m.pending ?? []), sha];
    return true;
  });
  await saveBlobs(userId, [{ sha, size: bytes.length, ...(answer.text.includes("\0") ? { base64: bytes.toString("base64") } : { text: answer.text }) }]);
  let ok = false;
  await changeManifest(userId, (m) => {
    m.pending = (m.pending ?? []).filter((s) => s !== sha);
    const cur = m.files[path];
    if (cur && cur.sha === e.sha && cur.other?.sha === e.other!.sha) {
      m.files[path] = { sha, size: bytes.length, mtime: now, exec: cur.exec, binary: answer.text.includes("\0"), mac: "Claude (combined)", macId: null, updatedAt: now, ...(cur.seen && { seen: cur.seen }) };
      ok = true;
    }
    return true;
  });
  if (!ok) throw new BadRequest("That file changed while Claude was combining it - try again.");
  return { note: answer.note.trim().slice(0, 1_000) };
}
