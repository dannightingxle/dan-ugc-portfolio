import "server-only";
import { readsFor } from "./mac-reads";
import { listStyles, styleWorkFor } from "./styles";
import { styleFor } from "./style-types";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { adminClient } from "../supabase/admin";
import { BRAND_ID } from "../studio/brand-types";
import { ALL_EDITS, DEFAULT_MAX_EDITS, type EditNote, type NotesChatMessage, type Device, type DeviceFile, type EditCard, type EditEvent, type EditFile, type EditStatus } from "./types";

/* Edit cards, their conversations, and the Macs that run them. Every query is
   scoped to one user here; the tables themselves are server-only. */

const ONLINE_MS = 45_000;
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");

type EditRow = {
  id: string;
  project_id: string;
  sheet_id: string | null;
  video_code: string;
  title: string;
  brief: string;
  status: EditStatus;
  files: EditFile[];
  pick_requested_at: string | null;
  pick_mode: "files" | "folder";
  draft_name: string | null;
  updated_at: string;
  session_id: string | null;
  device_id: string | null;
  cancel_requested: boolean;
};
const EDIT_COLS = "id, project_id, sheet_id, video_code, title, brief, status, files, pick_requested_at, pick_mode, draft_name, updated_at, session_id, device_id, cancel_requested";

export function toCard(r: EditRow): EditCard {
  return {
    id: r.id,
    projectId: r.project_id,
    sheetId: r.sheet_id,
    videoCode: r.video_code,
    title: r.title,
    brief: r.brief,
    status: r.status,
    files: r.files ?? [],
    pickRequested: Boolean(r.pick_requested_at),
    pickMode: r.pick_mode ?? "files",
    draftName: r.draft_name,
    updatedAt: r.updated_at,
    canCarryOn: Boolean(r.session_id),
    deviceId: r.device_id,
  };
}

export async function listEdits(userId: string, projectId: string): Promise<EditCard[]> {
  const { data, error } = await adminClient().from("hub_edits").select(`${EDIT_COLS}, created_at`).eq("user_id", userId).eq("project_id", projectId).order("created_at");
  if (error) throw error;
  return newestFirst(data as (EditRow & { created_at: string })[]).map(toCard);
}

/** Newest first, but a shoot sheet's cards stay together in their own order (whole sheet, V1, V2…). */
function newestFirst<R extends { sheet_id: string | null; id: string; created_at: string }>(rows: R[]) {
  const groups = new Map<string, R[]>();
  for (const r of rows) {
    const key = r.sheet_id ?? r.id;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const latest = (g: R[]) => g.reduce((t, r) => (r.created_at > t ? r.created_at : t), "");
  return [...groups.values()].sort((a, b) => latest(b).localeCompare(latest(a))).flat();
}

/** Every job's edits that are going, waiting on you, to do, or done lately - for the Edits page. */
export async function listAllEdits(userId: string) {
  const db = adminClient();
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data, error } = await db
    .from("hub_edits")
    .select("id, project_id, title, video_code, status, updated_at, created_at, files, draft_name")
    .eq("user_id", userId)
    .or(`status.neq.done,updated_at.gt.${since}`)
    .order("updated_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  const ids = [...new Set((data ?? []).map((e) => e.project_id as string))];
  const { data: projects } = ids.length ? await db.from("hub_projects").select("id, data").eq("user_id", userId).in("id", ids) : { data: [] };
  const brands = new Map<string, string>([[BRAND_ID, "Personal brand"], ...(projects ?? []).map((p) => [p.id as string, String((p.data as { brand?: string })?.brand || "Job")] as [string, string])]);
  return (data ?? []).map((e) => ({
    id: e.id as string,
    projectId: e.project_id as string,
    brand: brands.get(e.project_id) ?? "Job",
    title: e.title as string,
    videoCode: e.video_code as string,
    status: e.status as EditStatus,
    updatedAt: e.updated_at as string,
    createdAt: e.created_at as string,
    clips: ((e.files as EditFile[] | null) ?? []).length,
    draftName: (e.draft_name as string | null) ?? null,
  }));
}

export async function getEdit(userId: string, id: string): Promise<EditRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await adminClient().from("hub_edits").select(EDIT_COLS).eq("user_id", userId).eq("id", id).maybeSingle<EditRow>();
  if (error) throw error;
  return data;
}

export async function createEdit(userId: string, e: { projectId: string; sheetId?: string | null; videoCode: string; title: string; brief: string }): Promise<EditCard> {
  const row = { user_id: userId, project_id: e.projectId, sheet_id: e.sheetId ?? null, video_code: e.videoCode, title: e.title, brief: e.brief };
  // A shoot sheet's video only ever gets one card.
  const q = e.sheetId
    ? adminClient().from("hub_edits").upsert(row, { onConflict: "user_id,sheet_id,video_code", ignoreDuplicates: false })
    : adminClient().from("hub_edits").insert(row);
  const { data, error } = await q.select(EDIT_COLS).single<EditRow>();
  if (error) throw error;
  return toCard(data);
}

/** One of the user's Macs, or null if that id isn't theirs. */
export async function ownDevice(userId: string, deviceId: string | undefined) {
  if (!deviceId) return null;
  const { data } = await adminClient().from("hub_devices").select("id").eq("user_id", userId).eq("id", deviceId).not("token_hash", "is", null).maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

export async function updateEdit(userId: string, id: string, patch: Record<string, unknown>) {
  const { data, error } = await adminClient()
    .from("hub_edits")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id)
    .select(EDIT_COLS)
    .single<EditRow>();
  if (error) throw error;
  return toCard(data);
}

export async function deleteEdit(userId: string, id: string) {
  const { error } = await adminClient().from("hub_edits").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
}

export async function addEvents(editId: string, events: { kind: EditEvent["kind"]; text: string; delivered?: boolean }[]) {
  if (!events.length) return;
  const rows = events.map((e) => ({ edit_id: editId, kind: e.kind, text: e.text.slice(0, 20_000), delivered: e.delivered ?? true }));
  const { error } = await adminClient().from("hub_edit_events").insert(rows);
  if (error) throw error;
}

export async function listEvents(editId: string, after = 0): Promise<EditEvent[]> {
  const { data, error } = await adminClient().from("hub_edit_events").select("id, kind, text, at").eq("edit_id", editId).gt("id", after).order("id").limit(500);
  if (error) throw error;
  return data as EditEvent[];
}

// ---------------------------------------------------------------- devices

/** Start connecting a Mac: a short one-time code, valid for 15 minutes. */
export async function newPairCode(userId: string) {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const raw = Array.from({ length: 8 }, () => abc[randomInt(abc.length)]).join("");
  const code = `${raw.slice(0, 4)}-${raw.slice(4)}`;
  const expires = new Date(Date.now() + 15 * 60_000).toISOString();
  // Drop any earlier unused codes so only the newest one works.
  await adminClient().from("hub_devices").delete().eq("user_id", userId).is("token_hash", null);
  const { error } = await adminClient().from("hub_devices").insert({ user_id: userId, pair_code_hash: hash(raw), pair_expires_at: expires });
  if (error) throw error;
  return { code, expires };
}

/** The helper swaps a pairing code for its own long-lived token. */
export async function pairDevice(code: string, name: string, info: Record<string, unknown>) {
  const raw = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const { data } = await adminClient()
    .from("hub_devices")
    .select("id, user_id, pair_expires_at")
    .eq("pair_code_hash", hash(raw))
    .is("token_hash", null)
    .maybeSingle<{ id: string; user_id: string; pair_expires_at: string }>();
  if (!data || Date.parse(data.pair_expires_at) < Date.now()) return null;
  const token = "cdh_" + randomBytes(32).toString("base64url");
  const { error } = await adminClient()
    .from("hub_devices")
    .update({ token_hash: hash(token), pair_code_hash: null, pair_expires_at: null, name: name.slice(0, 80) || "Mac", info, last_seen: new Date().toISOString() })
    .eq("id", data.id);
  if (error) throw error;
  await replaceOldEntries(data.user_id, data.id, name.slice(0, 80) || "Mac");
  return { token, userId: data.user_id, deviceId: data.id };
}

/** Connecting the same Mac again (same name, old entry offline): its edits and settings move to the new entry and the old one goes. */
async function replaceOldEntries(userId: string, deviceId: string, name: string) {
  const db = adminClient();
  const { data: old } = await db.from("hub_devices").select("id, last_seen, info").eq("user_id", userId).eq("name", name).neq("id", deviceId).not("token_hash", "is", null);
  const gone = (old ?? []).filter((d) => !d.last_seen || Date.now() - Date.parse(d.last_seen) > ONLINE_MS);
  if (!gone.length) return;
  const ids = gone.map((d) => d.id as string);
  await db.from("hub_edits").update({ device_id: deviceId }).eq("user_id", userId).in("device_id", ids);
  const maxEdits = gone.map((d) => (d.info as Device["info"] | null)?.maxEdits).find(Boolean);
  if (maxEdits) await setMaxEdits(userId, deviceId, maxEdits);
  await db.from("hub_devices").delete().eq("user_id", userId).in("id", ids);
}

export type DeviceAuth = { deviceId: string; userId: string };

/** The Mac behind a helper request (Authorization: Bearer <token>), or null. */
export async function deviceFromRequest(request: Request): Promise<DeviceAuth | null> {
  const m = /^Bearer (cdh_[\w-]{20,})$/.exec(request.headers.get("authorization") ?? "");
  if (!m) return null;
  const { data } = await adminClient().from("hub_devices").select("id, user_id").eq("token_hash", hash(m[1])).maybeSingle<{ id: string; user_id: string }>();
  return data ? { deviceId: data.id, userId: data.user_id } : null;
}

export async function touchDevice(deviceId: string, info?: Record<string, unknown>) {
  // What the helper reports replaces what it reported before; your settings for that Mac stay.
  let next = info;
  if (info) {
    const { data } = await adminClient().from("hub_devices").select("info").eq("id", deviceId).maybeSingle<{ info: Device["info"] | null }>();
    const maxEdits = data?.info?.maxEdits;
    next = { ...info, ...(maxEdits ? { maxEdits } : {}) };
  }
  await adminClient()
    .from("hub_devices")
    .update({ last_seen: new Date().toISOString(), ...(next ? { info: next } : {}) })
    .eq("id", deviceId);
}

// How a job's edits are done, one row per job (and one for every edit, ALL_EDITS): the folder on your Mac
// Claude Code works in (so that folder's CLAUDE.md, notes and skills apply), your editing notes -
// feedback Claude remembers for next time - with the chat you gave it in, and the edit style it uses
// (see styles.ts; unset means the default for its kind of job).
const folderRow = (scope: string) => `editcfg:${scope}`;
export type EditCfg = { folder?: string; notes?: EditNote[]; chat?: NotesChatMessage[]; styleId?: string };

async function getCfg(userId: string, scope: string): Promise<EditCfg> {
  const { data } = await adminClient().from("hub_workspaces").select("data").eq("user_id", userId).eq("project_id", folderRow(scope)).maybeSingle<{ data: EditCfg }>();
  return data?.data ?? {};
}

async function saveCfg(userId: string, scope: string, patch: EditCfg) {
  const next = { ...(await getCfg(userId, scope)), ...patch };
  const { error } = await adminClient().from("hub_workspaces").upsert({ user_id: userId, project_id: folderRow(scope), data: next, updated_at: new Date().toISOString() });
  if (error) throw error;
  return next;
}

/** The folder on your Mac a job's edits start in ("" = the helper's usual one). */
export async function editFolder(userId: string, projectId: string) {
  return (await getCfg(userId, projectId)).folder ?? "";
}

export async function setEditFolder(userId: string, projectId: string, folder: string) {
  await saveCfg(userId, projectId, { folder });
}

/** The edit style picked for a job or the personal brand ("" = the default for its kind). */
export async function editStyleId(userId: string, scope: string) {
  return (await getCfg(userId, scope)).styleId ?? "";
}

export async function setEditStyle(userId: string, scope: string, styleId: string) {
  await saveCfg(userId, scope, { styleId });
}

/** A job's editing notes and their chat (or every edit's, for ALL_EDITS). */
export async function editNotes(userId: string, scope: string) {
  const cfg = await getCfg(userId, scope);
  return { notes: cfg.notes ?? [], chat: cfg.chat ?? [] };
}

/** Add notes, skipping ones already there; the newest 60 are kept. */
export async function addNotes(userId: string, scope: string, texts: string[], from: EditNote["from"]) {
  const { notes } = await editNotes(userId, scope);
  const have = new Set(notes.map((n) => n.text.trim().toLowerCase()));
  const added = [...new Set(texts.map((t) => t.trim()).filter(Boolean))].filter((t) => !have.has(t.toLowerCase())).map((text) => ({ id: randomBytes(6).toString("hex"), text: text.slice(0, 500), at: new Date().toISOString(), from }));
  if (added.length) await saveCfg(userId, scope, { notes: [...notes, ...added].slice(-60) });
  return added;
}

export async function saveNotes(userId: string, scope: string, patch: { notes?: EditNote[]; chat?: NotesChatMessage[] }) {
  const next = await saveCfg(userId, scope, { ...patch, ...(patch.notes ? { notes: patch.notes.slice(-60) } : {}), ...(patch.chat ? { chat: patch.chat.slice(-40) } : {}) });
  return { notes: next.notes ?? [], chat: next.chat ?? [] };
}

/** How many edits one of your Macs runs at once. */
export async function setMaxEdits(userId: string, deviceId: string, maxEdits: number) {
  const db = adminClient();
  const { data } = await db.from("hub_devices").select("info").eq("user_id", userId).eq("id", deviceId).maybeSingle<{ info: Device["info"] | null }>();
  if (!data) return;
  const { error } = await db.from("hub_devices").update({ info: { ...(data.info ?? {}), maxEdits } }).eq("user_id", userId).eq("id", deviceId);
  if (error) throw error;
}

export async function listDevices(userId: string): Promise<Device[]> {
  const { data, error } = await adminClient()
    .from("hub_devices")
    .select("id, name, last_seen, info")
    .eq("user_id", userId)
    .not("token_hash", "is", null)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((d) => ({ id: d.id, name: d.name, lastSeen: d.last_seen, online: Boolean(d.last_seen && Date.now() - Date.parse(d.last_seen) < ONLINE_MS), info: d.info ?? {} }));
}

export async function removeDevice(userId: string, id: string) {
  const { error } = await adminClient().from("hub_devices").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
}

/** Replace the list of recent clips a Mac can see. */
export async function saveDeviceFiles(deviceId: string, files: Omit<DeviceFile, "deviceId">[]) {
  const db = adminClient();
  await db.from("hub_device_files").delete().eq("device_id", deviceId);
  if (!files.length) return;
  const rows = files.slice(0, 80).map((f) => ({
    device_id: deviceId,
    path: f.path,
    name: f.name,
    folder: f.folder,
    modified_at: f.modifiedAt,
    duration: f.duration,
    thumb: f.thumb && f.thumb.length < 60_000 ? f.thumb : null,
  }));
  const { error } = await db.from("hub_device_files").insert(rows);
  if (error) throw error;
}

export async function listDeviceFiles(userId: string): Promise<DeviceFile[]> {
  const devices = await listDevices(userId);
  if (!devices.length) return [];
  const { data, error } = await adminClient()
    .from("hub_device_files")
    .select("device_id, path, name, folder, modified_at, duration, thumb")
    .in("device_id", devices.map((d) => d.id))
    .order("modified_at", { ascending: false })
    .limit(80);
  if (error) throw error;
  return (data ?? []).map((f) => ({ deviceId: f.device_id, path: f.path, name: f.name, folder: f.folder, modifiedAt: f.modified_at, duration: f.duration, thumb: f.thumb }));
}

// ---------------------------------------------------------------- the helper's work queue

/** What a Mac should do next: edits to start, clip pickers to open, replies to pass on, edits to stop.
    runningIds: the edits its helper is running right now (newer helpers say), so ones it dropped can be let go. */
export async function workFor(auth: DeviceAuth, runningIds: string[] | null = null) {
  const db = adminClient();
  if (runningIds) await releaseDropped(auth, runningIds);
  const [queued, picks, running, device, styles] = await Promise.all([
    db.from("hub_edits").select(EDIT_COLS).eq("user_id", auth.userId).eq("status", "queued").or(`device_id.is.null,device_id.eq.${auth.deviceId}`).order("updated_at").limit(5),
    // A picker opens only on the Mac it was asked of (or any Mac, if none was named).
    db.from("hub_edits").select("id, video_code, title, pick_mode").eq("user_id", auth.userId).not("pick_requested_at", "is", null).or(`device_id.is.null,device_id.eq.${auth.deviceId}`).limit(5),
    db.from("hub_edits").select("id, project_id, session_id, cancel_requested").eq("user_id", auth.userId).eq("device_id", auth.deviceId).in("status", ["editing", "needs_you", "ready"]),
    db.from("hub_devices").select("info").eq("id", auth.deviceId).maybeSingle<{ info: Device["info"] | null }>(),
    listStyles(auth.userId),
  ]);
  const runIds = (running.data ?? []).map((r) => r.id);
  // The brand name for each queued edit, so the prompt can say whose video it is.
  const projectIds = [...new Set(((queued.data ?? []) as EditRow[]).map((r) => r.project_id))];
  const brands = new Map<string, string>([[BRAND_ID, "Personal brand"]]);
  // Tech UGC jobs default to your tech style, other jobs to your brand deals style.
  const tech = new Set<string>();
  if (projectIds.length) {
    const { data: projects } = await db.from("hub_projects").select("id, data").eq("user_id", auth.userId).in("id", projectIds);
    for (const p of projects ?? []) {
      brands.set(p.id, String((p.data as { brand?: string })?.brand ?? ""));
      if ((p.data as { techStage?: string })?.techStage) tech.add(p.id);
    }
  }
  // Each job's folder on the Mac (a carried-on edit needs the same one, as Claude Code keeps its sessions per folder).
  // And the editing notes for every edit and for each job, so new edits follow them.
  const folderIds = [...new Set([...projectIds, ...(running.data ?? []).map((r) => r.project_id as string)])];
  const folders = new Map<string, string>();
  const notes = new Map<string, string[]>();
  const styleIds = new Map<string, string>();
  {
    const { data: rows } = await db.from("hub_workspaces").select("project_id, data").eq("user_id", auth.userId).in("project_id", [...folderIds, ALL_EDITS].map(folderRow));
    for (const r of rows ?? []) {
      const scope = String(r.project_id).slice("editcfg:".length);
      const cfg = (r.data ?? {}) as EditCfg;
      folders.set(scope, String(cfg.folder ?? ""));
      notes.set(scope, (cfg.notes ?? []).map((n) => n.text));
      if (cfg.styleId) styleIds.set(scope, cfg.styleId);
    }
  }
  const replies = runIds.length
    ? ((await db.from("hub_edit_events").select("id, edit_id, text").in("edit_id", runIds).eq("kind", "user").eq("delivered", false).order("id")).data ?? [])
    : [];
  // The edit style each edit follows (its key frames stay on Creator Desk).
  const styleOf = (projectId: string) => {
    const { style } = styleFor(styles, styleIds.get(projectId), { personal: projectId === BRAND_ID, tech: tech.has(projectId) });
    return style && { name: style.name, summary: style.summary, rules: style.rules };
  };
  return {
    edits: ((queued.data ?? []) as EditRow[]).map((r) => ({ id: r.id, brief: r.brief, title: r.title, videoCode: r.video_code, brand: brands.get(r.project_id) ?? "", personal: r.project_id === BRAND_ID, folder: folders.get(r.project_id) ?? "", notes: [...(notes.get(ALL_EDITS) ?? []), ...(notes.get(r.project_id) ?? [])], files: r.files ?? [], sessionId: r.session_id, style: styleOf(r.project_id) })),
    picks: (picks.data ?? []).map((p) => ({ id: p.id, mode: p.pick_mode, label: p.video_code === "ALL" ? p.title : [p.video_code, p.title].filter(Boolean).join(" · ") })),
    replies: replies.map((r) => {
      const run = running.data?.find((x) => x.id === r.edit_id);
      return { eventId: r.id, editId: r.edit_id, text: r.text, sessionId: run?.session_id ?? null, folder: folders.get(run?.project_id ?? "") ?? "" };
    }),
    cancels: (running.data ?? []).filter((r) => r.cancel_requested).map((r) => r.id),
    reads: await readsFor(auth),
    // Reading this Mac's editing setup into styles, and grabbing key frames from a video picked on it.
    ...(await styleWorkFor(auth)),
    // How many edits this Mac runs side by side.
    maxEdits: device.data?.info?.maxEdits ?? DEFAULT_MAX_EDITS,
  };
}

/** Edits this Mac's helper was running when it restarted (an update, or its window closed) stop showing as editing, so they can be carried on. */
async function releaseDropped(auth: DeviceAuth, runningIds: string[]) {
  const db = adminClient();
  // A minute's grace: a reply just sent marks a card editing before the helper picks it up.
  const before = new Date(Date.now() - 60_000).toISOString();
  const { data } = await db.from("hub_edits").select("id").eq("user_id", auth.userId).eq("device_id", auth.deviceId).eq("status", "editing").lt("updated_at", before);
  const dropped = (data ?? []).map((r) => r.id as string).filter((id) => !runningIds.includes(id));
  if (!dropped.length) return;
  const { data: waiting } = await db.from("hub_edit_events").select("edit_id").in("edit_id", dropped).eq("kind", "user").eq("delivered", false);
  const ids = dropped.filter((id) => !(waiting ?? []).some((w) => w.edit_id === id));
  if (!ids.length) return;
  await db.from("hub_edits").update({ status: "failed", cancel_requested: false, updated_at: new Date().toISOString() }).eq("user_id", auth.userId).in("id", ids);
  for (const id of ids) {
    await addEvents(id, [{ kind: "status", text: "The helper on your Mac restarted (an update, or its window closed), so this edit stopped partway. Press Carry on to pick up where it left off." }]);
  }
}

/** Edits whose Mac went away mid-edit (asleep, closed, its helper stopped, or disconnected) stop showing as editing, so they can be carried on or started again. */
export async function releaseOffline(userId: string) {
  const db = adminClient();
  const { data: editing } = await db.from("hub_edits").select("id, device_id").eq("user_id", userId).eq("status", "editing");
  if (!editing?.length) return;
  const { data: devices } = await db.from("hub_devices").select("id, name, last_seen").eq("user_id", userId);
  const gone = (deviceId: string | null) => {
    const d = (devices ?? []).find((x) => x.id === deviceId);
    return !d || !d.last_seen || Date.now() - Date.parse(d.last_seen) > 2 * 60_000;
  };
  const stopped = editing.filter((e) => gone(e.device_id as string | null));
  if (!stopped.length) return;
  await db.from("hub_edits").update({ status: "failed", cancel_requested: false, updated_at: new Date().toISOString() }).eq("user_id", userId).in("id", stopped.map((e) => e.id as string)).eq("status", "editing");
  for (const e of stopped) {
    const name = (devices ?? []).find((x) => x.id === e.device_id)?.name;
    await addEvents(e.id as string, [
      {
        kind: "status",
        text: name
          ? `Your Mac (${name}) went offline mid-edit (asleep, closed, or its helper stopped), so it stopped partway. Carry on where it stopped once that Mac's helper is running again, or start it again on another Mac.`
          : "The Mac editing this was disconnected or replaced mid-edit, so it stopped partway. Press Carry on where it stopped to pick it up on your Mac.",
      },
    ]);
  }
}

/** Is the Mac with this id connected right now? */
export async function deviceOnline(deviceId: string | null) {
  if (!deviceId) return false;
  const { data } = await adminClient().from("hub_devices").select("last_seen").eq("id", deviceId).maybeSingle<{ last_seen: string | null }>();
  return Boolean(data?.last_seen && Date.now() - Date.parse(data.last_seen) < ONLINE_MS);
}

/** The helper claims a queued edit so no other Mac starts it too. */
export async function claimEdit(auth: DeviceAuth, id: string) {
  const { data } = await adminClient()
    .from("hub_edits")
    .update({ status: "editing", device_id: auth.deviceId, cancel_requested: false, updated_at: new Date().toISOString() })
    .eq("user_id", auth.userId)
    .eq("id", id)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();
  return Boolean(data);
}

export async function markDelivered(auth: DeviceAuth, eventIds: number[]) {
  if (!eventIds.length) return;
  const { data: own } = await adminClient().from("hub_edits").select("id").eq("user_id", auth.userId).eq("device_id", auth.deviceId);
  const ids = (own ?? []).map((r) => r.id);
  if (!ids.length) return;
  await adminClient().from("hub_edit_events").update({ delivered: true }).in("id", eventIds).in("edit_id", ids);
}
