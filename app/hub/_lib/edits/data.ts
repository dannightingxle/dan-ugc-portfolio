import "server-only";
import { readsFor } from "./mac-reads";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { adminClient } from "../supabase/admin";
import { DEFAULT_MAX_EDITS, type Device, type DeviceFile, type EditCard, type EditEvent, type EditFile, type EditStatus } from "./types";

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
  };
}

export async function listEdits(userId: string, projectId: string): Promise<EditCard[]> {
  const { data, error } = await adminClient().from("hub_edits").select(EDIT_COLS).eq("user_id", userId).eq("project_id", projectId).order("created_at");
  if (error) throw error;
  return (data as EditRow[]).map(toCard);
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
  return { token, userId: data.user_id, deviceId: data.id };
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

/** What a Mac should do next: edits to start, clip pickers to open, replies to pass on, edits to stop. */
export async function workFor(auth: DeviceAuth) {
  const db = adminClient();
  const [queued, picks, running, device] = await Promise.all([
    db.from("hub_edits").select(EDIT_COLS).eq("user_id", auth.userId).eq("status", "queued").or(`device_id.is.null,device_id.eq.${auth.deviceId}`).order("updated_at").limit(5),
    // A picker opens only on the Mac it was asked of (or any Mac, if none was named).
    db.from("hub_edits").select("id, video_code, title, pick_mode").eq("user_id", auth.userId).not("pick_requested_at", "is", null).or(`device_id.is.null,device_id.eq.${auth.deviceId}`).limit(5),
    db.from("hub_edits").select("id, session_id, cancel_requested").eq("user_id", auth.userId).eq("device_id", auth.deviceId).in("status", ["editing", "needs_you", "ready"]),
    db.from("hub_devices").select("info").eq("id", auth.deviceId).maybeSingle<{ info: Device["info"] | null }>(),
  ]);
  const runIds = (running.data ?? []).map((r) => r.id);
  // The brand name for each queued edit, so the prompt can say whose video it is.
  const projectIds = [...new Set(((queued.data ?? []) as EditRow[]).map((r) => r.project_id))];
  const brands = new Map<string, string>();
  if (projectIds.length) {
    const { data: projects } = await db.from("hub_projects").select("id, data").eq("user_id", auth.userId).in("id", projectIds);
    for (const p of projects ?? []) brands.set(p.id, String((p.data as { brand?: string })?.brand ?? ""));
  }
  const replies = runIds.length
    ? ((await db.from("hub_edit_events").select("id, edit_id, text").in("edit_id", runIds).eq("kind", "user").eq("delivered", false).order("id")).data ?? [])
    : [];
  return {
    edits: ((queued.data ?? []) as EditRow[]).map((r) => ({ id: r.id, brief: r.brief, title: r.title, videoCode: r.video_code, brand: brands.get(r.project_id) ?? "", files: r.files ?? [], sessionId: r.session_id })),
    picks: (picks.data ?? []).map((p) => ({ id: p.id, mode: p.pick_mode, label: p.video_code === "ALL" ? p.title : [p.video_code, p.title].filter(Boolean).join(" · ") })),
    replies: replies.map((r) => ({ eventId: r.id, editId: r.edit_id, text: r.text, sessionId: running.data?.find((x) => x.id === r.edit_id)?.session_id ?? null })),
    cancels: (running.data ?? []).filter((r) => r.cancel_requested).map((r) => r.id),
    reads: await readsFor(auth),
    // How many edits this Mac runs side by side.
    maxEdits: device.data?.info?.maxEdits ?? DEFAULT_MAX_EDITS,
  };
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
