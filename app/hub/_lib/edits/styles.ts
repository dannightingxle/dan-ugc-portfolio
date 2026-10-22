import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { adminClient } from "../supabase/admin";
import { BRAND_ID } from "../studio/brand-types";
import { ask, studioErrorMessage } from "../studio/claude";
import type { DeviceAuth } from "./data";
import {
  FRAME_DATA,
  MAX_FRAMES,
  MAX_FRAME_CHARS,
  MAX_RULES,
  MAX_STYLES,
  STYLE_KINDS,
  defaultKind,
  styleFor,
  type EditStyle,
  type StyleFrame,
  type StyleKind,
  type StyleRequest,
} from "./style-types";

/* Edit styles in the cloud, one set per person, in hub_workspaces rows (every
   id has a ":" so it never looks like a job):
   - "editstyles:list": the styles themselves (no pictures)
   - "editstyle:<id>:frames": one style's key frames
   - "stylereq:scan:<uuid>" / "stylereq:grab:<uuid>": asking your Mac to read
     its editing setup, or to grab frames from a video you pick there.
   Which style a job uses lives in its editcfg row (see data.ts). */

const LIST = "editstyles:list";
const framesRow = (styleId: string) => `editstyle:${styleId}:frames`;
const REQ = "stylereq:";
/** A request your Mac hasn't picked up in this long is dropped. */
const WAIT_MS = 10 * 60_000;
/** Once picked up, how long before we stop waiting to hear back. */
const ANSWER_MS = 15 * 60_000;

export const validStyleId = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{12}$/.test(id);
const newId = () => randomBytes(6).toString("hex");
type Stored = EditStyle & { frameCount?: number };

// ---------------------------------------------------------------- the styles

export async function listStyles(userId: string): Promise<Stored[]> {
  const { data } = await adminClient().from("hub_workspaces").select("data").eq("user_id", userId).eq("project_id", LIST).maybeSingle<{ data: { styles?: Stored[] } }>();
  return data?.data?.styles ?? [];
}

async function saveStyles(userId: string, styles: Stored[]) {
  const { error } = await adminClient().from("hub_workspaces").upsert({ user_id: userId, project_id: LIST, data: { styles: styles.slice(0, MAX_STYLES) }, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export type StyleInput = { name: string; kind: StyleKind; summary: string; rules: string[] };
const cleanRules = (rules: string[]) => [...new Set(rules.map((r) => r.trim().replace(/\s+/g, " ").slice(0, 300)).filter(Boolean))].slice(0, MAX_RULES);
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export async function createStyle(userId: string, input: StyleInput) {
  const styles = await listStyles(userId);
  if (styles.length >= MAX_STYLES) return { error: `You can keep up to ${MAX_STYLES} styles - delete one first.` };
  if (styles.some((s) => sameName(s.name, input.name))) return { error: "You already have a style with that name." };
  const style: Stored = { id: newId(), name: input.name.trim(), kind: input.kind, summary: input.summary.trim(), rules: cleanRules(input.rules), source: "you", updatedAt: new Date().toISOString(), frameCount: 0 };
  await saveStyles(userId, [...styles, style]);
  return { style };
}

/** Your own changes: the style is yours from now on, so reading your Mac again won't overwrite it. */
export async function updateStyle(userId: string, id: string, patch: Partial<StyleInput>) {
  const styles = await listStyles(userId);
  const old = styles.find((s) => s.id === id);
  if (!old) return { error: "That style isn't there any more." };
  if (patch.name !== undefined && styles.some((s) => s.id !== id && sameName(s.name, patch.name!))) return { error: "You already have a style with that name." };
  const style: Stored = {
    ...old,
    ...(patch.name !== undefined && { name: patch.name.trim() }),
    ...(patch.kind !== undefined && { kind: patch.kind }),
    ...(patch.summary !== undefined && { summary: patch.summary.trim() }),
    ...(patch.rules !== undefined && { rules: cleanRules(patch.rules) }),
    source: "you",
    updatedAt: new Date().toISOString(),
  };
  await saveStyles(userId, styles.map((s) => (s.id === id ? style : s)));
  return { style };
}

export async function deleteStyle(userId: string, id: string) {
  const styles = await listStyles(userId);
  await saveStyles(userId, styles.filter((s) => s.id !== id));
  await adminClient().from("hub_workspaces").delete().eq("user_id", userId).eq("project_id", framesRow(id));
}

// ---------------------------------------------------------------- key frames

export async function styleFrames(userId: string, styleId: string): Promise<StyleFrame[]> {
  const { data } = await adminClient().from("hub_workspaces").select("data").eq("user_id", userId).eq("project_id", framesRow(styleId)).maybeSingle<{ data: { frames?: StyleFrame[] } }>();
  return data?.data?.frames ?? [];
}

async function saveFrames(userId: string, styleId: string, frames: StyleFrame[]) {
  const db = adminClient();
  const { error } = await db.from("hub_workspaces").upsert({ user_id: userId, project_id: framesRow(styleId), data: { frames }, updated_at: new Date().toISOString() });
  if (error) throw error;
  // The list keeps a count, so the page knows which styles have pictures without loading them all.
  const styles = await listStyles(userId);
  if (styles.some((s) => s.id === styleId && s.frameCount !== frames.length)) await saveStyles(userId, styles.map((s) => (s.id === styleId ? { ...s, frameCount: frames.length } : s)));
}

/** A frame that's really a JPEG or PNG picture of a sensible size. */
export const goodFrame = (data: string) => data.length <= MAX_FRAME_CHARS && FRAME_DATA.test(data);

/** Add frames to a style (the newest MAX_FRAMES are kept). Ones that aren't pictures, or are too big, are skipped. */
export async function addFrames(userId: string, styleId: string, incoming: { data: string; at?: number | null; source?: string }[]) {
  const styles = await listStyles(userId);
  if (!styles.some((s) => s.id === styleId)) return null;
  const now = new Date().toISOString();
  const fresh: StyleFrame[] = incoming
    .filter((f) => goodFrame(f.data))
    .map((f) => ({ id: newId(), data: f.data, at: typeof f.at === "number" && Number.isFinite(f.at) && f.at >= 0 ? Math.round(f.at * 10) / 10 : null, source: (f.source ?? "").slice(0, 300), addedAt: now }));
  const frames = [...(await styleFrames(userId, styleId)), ...fresh].slice(-MAX_FRAMES);
  if (fresh.length) await saveFrames(userId, styleId, frames);
  return { frames, added: fresh.length, skipped: incoming.length - fresh.length };
}

export async function deleteFrame(userId: string, styleId: string, frameId: string) {
  const frames = (await styleFrames(userId, styleId)).filter((f) => f.id !== frameId);
  await saveFrames(userId, styleId, frames);
  return frames;
}

// ---------------------------------------------------------------- which style each job uses

type Scope = { id: string; name: string; personal: boolean; tech: boolean };

/** The personal brand and every live job, with whether each is a tech UGC job. */
async function scopes(userId: string): Promise<Scope[]> {
  const { data } = await adminClient().from("hub_projects").select("id, data").eq("user_id", userId);
  const jobs = (data ?? [])
    .map((p) => ({ id: p.id as string, d: (p.data ?? {}) as { brand?: string; title?: string; stage?: string; techStage?: string; example?: boolean } }))
    .filter(({ d }) => d.stage !== "Lost" && d.techStage !== "Lost" && d.techStage !== "Ended")
    .map(({ id, d }) => ({ id, name: d.brand || d.title || "Job", personal: false, tech: Boolean(d.techStage) }));
  return [{ id: BRAND_ID, name: "Personal brand", personal: true, tech: false }, ...jobs];
}

/** Every editcfg row's chosen style and Mac folder. */
async function cfgRows(userId: string) {
  const { data } = await adminClient().from("hub_workspaces").select("project_id, styleId:data->>styleId, folder:data->>folder").eq("user_id", userId).like("project_id", "editcfg:%");
  return ((data ?? []) as { project_id: string; styleId: string | null; folder: string | null }[]).map((r) => ({ scope: r.project_id.slice("editcfg:".length), styleId: r.styleId ?? "", folder: r.folder ?? "" }));
}

/** Which jobs use each style (the one you picked for them, or their default). */
export async function stylesInUse(userId: string, styles: Stored[]) {
  const [all, cfgs] = await Promise.all([scopes(userId), cfgRows(userId)]);
  const used = new Map<string, { id: string; name: string; auto: boolean }[]>();
  for (const s of all) {
    const { style, auto } = styleFor(styles, cfgs.find((c) => c.scope === s.id)?.styleId, s);
    if (style) used.set(style.id, [...(used.get(style.id) ?? []), { id: s.id, name: s.name, auto }]);
  }
  return used;
}

/** The style one job (or the personal brand) uses, with the choice of all of them. */
export async function scopeStyle(userId: string, scope: string, pickedId: string | undefined) {
  const styles = await listStyles(userId);
  let tech = false;
  if (scope !== BRAND_ID) {
    const { data } = await adminClient().from("hub_projects").select("data").eq("user_id", userId).eq("id", scope).maybeSingle<{ data: { techStage?: string } }>();
    tech = Boolean(data?.data?.techStage);
  }
  const { style, auto } = styleFor(styles, pickedId, { personal: scope === BRAND_ID, tech });
  return { style: style && { id: style.id, name: style.name, kind: style.kind }, auto, usual: defaultKind({ personal: scope === BRAND_ID, tech }), styles: styles.map((s) => ({ id: s.id, name: s.name, kind: s.kind })) };
}

// ---------------------------------------------------------------- asking your Mac

type ReqRow = { project_id: string; data: Omit<StyleRequest, "id"> };

/** How a request stands now: one nobody answered in time reads as expired. */
function view(r: ReqRow): StyleRequest {
  const d = r.data;
  const now = Date.now();
  const stale =
    (d.status === "waiting" && now - Date.parse(d.createdAt) > WAIT_MS) || ((d.status === "taken" || d.status === "sorting") && now - Date.parse(d.takenAt ?? d.createdAt) > ANSWER_MS);
  return { ...d, id: r.project_id, status: stale ? "expired" : d.status };
}

/** Ask a Mac (or whichever of yours asks first, with no deviceId) to read its editing setup, or grab frames for a style. */
export async function createRequest(userId: string, kind: "scan" | "grab", deviceId: string | null, styleId?: string) {
  const db = adminClient();
  // Tidy up: a new read replaces the last one; frame grabs go after a day.
  if (kind === "scan") await db.from("hub_workspaces").delete().eq("user_id", userId).like("project_id", `${REQ}scan:%`);
  await db.from("hub_workspaces").delete().eq("user_id", userId).like("project_id", `${REQ}grab:%`).lt("updated_at", new Date(Date.now() - 86_400_000).toISOString());
  const row: ReqRow = { project_id: `${REQ}${kind}:${randomUUID()}`, data: { kind, deviceId, status: "waiting", createdAt: new Date().toISOString(), ...(styleId && { styleId }) } };
  const { error } = await db.from("hub_workspaces").insert({ user_id: userId, project_id: row.project_id, data: row.data });
  if (error) throw error;
  return view(row);
}

async function requestRow(userId: string, id: string): Promise<ReqRow | null> {
  if (!/^stylereq:(scan|grab):[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await adminClient().from("hub_workspaces").select("project_id, data").eq("user_id", userId).eq("project_id", id).maybeSingle<ReqRow>();
  return data;
}

export async function getRequest(userId: string, id: string) {
  const row = await requestRow(userId, id);
  return row && view(row);
}

/** The last time you asked your Mac to read its setup. */
export async function latestScan(userId: string) {
  const { data } = await adminClient().from("hub_workspaces").select("project_id, data").eq("user_id", userId).like("project_id", `${REQ}scan:%`).order("updated_at", { ascending: false }).limit(1);
  const row = (data ?? [])[0] as ReqRow | undefined;
  return row ? view(row) : null;
}

async function patchRequest(userId: string, row: ReqRow, patch: Partial<StyleRequest>, onlyIf?: StyleRequest["status"]) {
  let q = adminClient()
    .from("hub_workspaces")
    .update({ data: { ...row.data, ...patch }, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("project_id", row.project_id);
  if (onlyIf) q = q.eq("data->>status", onlyIf);
  const { data } = await q.select("project_id");
  return Boolean(data?.length);
}

/** For the helper's poll: a setup read and frame grabs waiting for this Mac. Each is handed out once. */
export async function styleWorkFor(auth: DeviceAuth) {
  const db = adminClient();
  const { data } = await db.from("hub_workspaces").select("project_id, data").eq("user_id", auth.userId).like("project_id", `${REQ}%`);
  const waiting = ((data ?? []) as ReqRow[])
    .filter((r) => view(r).status === "waiting" && (!r.data.deviceId || r.data.deviceId === auth.deviceId))
    .sort((a, b) => b.data.createdAt.localeCompare(a.data.createdAt));
  // Claimed only if still waiting, so two Macs polling at once don't both take it.
  const take = (r: ReqRow) => patchRequest(auth.userId, r, { status: "taken", takenAt: new Date().toISOString(), deviceId: auth.deviceId }, "waiting");

  let styleScan: { id: string; folders: string[] } | null = null;
  const scan = waiting.find((r) => r.data.kind === "scan");
  if (scan && (await take(scan))) {
    // Every folder your jobs' edits start in: their CLAUDE.md, skills and notes are where the styles are written down.
    const folders = [...new Set((await cfgRows(auth.userId)).map((c) => c.folder.trim()).filter(Boolean))];
    styleScan = { id: scan.project_id, folders };
  }
  // With the style's name, so the Mac's picker can say what the frames are for.
  const frameGrabs: { id: string; styleId: string; styleName: string }[] = [];
  const grabs = waiting.filter((r) => r.data.kind === "grab" && r.data.styleId);
  const styles = grabs.length ? await listStyles(auth.userId) : [];
  for (const g of grabs) {
    const style = styles.find((s) => s.id === g.data.styleId);
    if (style && (await take(g))) frameGrabs.push({ id: g.project_id, styleId: style.id, styleName: style.name });
  }
  return { styleScan, frameGrabs };
}

/** A request this Mac may answer: its own, or one no Mac has taken yet. */
async function answerable(auth: DeviceAuth, id: string, kind: "scan" | "grab") {
  const row = await requestRow(auth.userId, id);
  if (!row || row.data.kind !== kind) return null;
  const v = view(row);
  if (v.status !== "waiting" && v.status !== "taken") return null;
  if (row.data.deviceId && row.data.deviceId !== auth.deviceId) return null;
  return row;
}

// ---------------------------------------------------------------- reading your Mac's setup

const SORT_SYSTEM = `You sort a video creator's editing setup into edit styles.

The creator edits their short-form videos in CapCut with Claude Code on their Mac. How each kind of video should be edited is written down in files on that Mac: CLAUDE.md files, skills (SKILL.md and the files beside them), memory files and notes. You're given those files.

Find the distinct edit styles in them - for example their personal brand videos, tech UGC videos (app and software videos made for tech companies), brand deals - whatever is actually there. Different folders or skills often mean different styles; files that describe the same style belong together as one.

For each style:
- name: short and plain, the way the creator would say it ("Personal brand", "Tech UGC", "Brand deals"). If one of their existing styles is the same thing, use its exact name.
- kind: "personal" (their own brand's content), "tech" (tech UGC for clients), "brand" (brand deals and sponsored videos), or "other".
- summary: 2-4 plain sentences for the creator on what videos in this style look and feel like.
- rules: the concrete editing rules for this style, one line each, starting with what it's about ("Captions:", "Text:", "Fonts:", "B-roll:", "Cuts:", "Music:", "Hook:", "Zooms:", "Length:", "Export:"). Keep the specifics (fonts, sizes, colours, positions, timings). Only rules that are written in the files: never invent, guess or pad one.
Leave out instructions that aren't about how the videos look and sound (running tools, MCP setup, file housekeeping) and one-offs for a single video. If the files hold no editing rules at all, return no styles.

reply: one or two friendly sentences to the creator saying which styles you found (or that you found none, and why).`;

const Sorted = z.object({
  styles: z.array(z.object({ name: z.string(), kind: z.enum(STYLE_KINDS), summary: z.string(), rules: z.array(z.string()) })),
  reply: z.string(),
});

/** Mark a read your Mac couldn't do as failed. */
export async function failRequest(auth: DeviceAuth, id: string, kind: "scan" | "grab", error: string) {
  const row = await answerable(auth, id, kind);
  if (!row) return false;
  return patchRequest(auth.userId, row, { status: "failed", error: error.slice(0, 500), finishedAt: new Date().toISOString() });
}

/** Your Mac sent its CLAUDE.md, skill and memory files: Claude sorts them into styles, merged into the ones you have by name.
    Styles from an earlier read are updated; ones you've changed yourself are left as they are. */
export async function sortScan(auth: DeviceAuth, id: string, files: { path: string; text: string }[]): Promise<{ ok: boolean; error?: string }> {
  const row = await answerable(auth, id, "scan");
  if (!row) return { ok: false, error: "That request isn't waiting any more." };
  const paths = files.map((f) => f.path);
  await patchRequest(auth.userId, row, { status: "sorting", files: paths, deviceId: auth.deviceId, takenAt: row.data.takenAt ?? new Date().toISOString() });
  const sorting: ReqRow = { ...row, data: { ...row.data, status: "sorting", files: paths, deviceId: auth.deviceId } };
  const done = (patch: Partial<StyleRequest>) => patchRequest(auth.userId, sorting, { ...patch, finishedAt: new Date().toISOString() });

  if (!files.some((f) => f.text.trim())) {
    await done({ status: "done", reply: "Your Mac didn't find any CLAUDE.md, skill or memory files to read, so nothing changed.", added: [], updated: [], kept: [] });
    return { ok: true };
  }
  const current = await listStyles(auth.userId);
  let answer: z.infer<typeof Sorted>;
  try {
    answer = await ask({
      system: SORT_SYSTEM,
      content: [
        {
          type: "text",
          text: [
            current.length ? `Their existing styles:\n${current.map((s) => `- ${s.name} (${s.kind})`).join("\n")}` : "They have no styles saved yet.",
            `The files from their Mac (${files.length}):`,
            ...files.map((f) => `<file path="${f.path.replace(/"/g, "'")}">\n${f.text}\n</file>`),
          ].join("\n\n"),
        },
      ],
      schema: Sorted,
      effort: "low",
    });
  } catch (e) {
    const error = studioErrorMessage(e);
    await done({ status: "failed", error });
    return { ok: false, error };
  }

  // Merge by name: update earlier reads, never overwrite one you've changed, add the new ones.
  const now = new Date().toISOString();
  const latest = await listStyles(auth.userId);
  const next = [...latest];
  const added: string[] = [], updated: string[] = [], kept: string[] = [];
  const seen = new Set<string>();
  for (const s of answer.styles) {
    const name = s.name.trim().slice(0, 80);
    const rules = cleanRules(s.rules);
    if (!name || seen.has(name.toLowerCase()) || (!rules.length && !s.summary.trim())) continue;
    seen.add(name.toLowerCase());
    const i = next.findIndex((x) => sameName(x.name, name));
    if (i >= 0 && next[i].source === "you") {
      kept.push(next[i].name);
    } else if (i >= 0) {
      next[i] = { ...next[i], kind: s.kind, summary: s.summary.trim().slice(0, 1_000), rules, updatedAt: now };
      updated.push(next[i].name);
    } else if (next.length < MAX_STYLES) {
      next.push({ id: newId(), name, kind: s.kind, summary: s.summary.trim().slice(0, 1_000), rules, source: "mac", updatedAt: now, frameCount: 0 });
      added.push(name);
    }
  }
  if (added.length || updated.length) await saveStyles(auth.userId, next);
  await done({ status: "done", reply: answer.reply.trim().slice(0, 1_000), added, updated, kept });
  return { ok: true };
}

/** Frames your Mac grabbed from a video you picked there. */
export async function grabbedFrames(auth: DeviceAuth, id: string, styleId: string, frames: { data: string; at: number; source: string }[]) {
  const row = await answerable(auth, id, "grab");
  if (!row || row.data.styleId !== styleId) return { ok: false, error: "That request isn't waiting any more." };
  const r = await addFrames(auth.userId, styleId, frames);
  if (!r) {
    await patchRequest(auth.userId, row, { status: "failed", error: "That style was deleted.", finishedAt: new Date().toISOString() });
    return { ok: false, error: "That style isn't there any more." };
  }
  await patchRequest(auth.userId, row, {
    status: r.added || !frames.length ? "done" : "failed",
    frames: r.added,
    deviceId: auth.deviceId,
    ...(!r.added && frames.length ? { error: "The frames didn't come through as pictures." } : {}),
    finishedAt: new Date().toISOString(),
  });
  return { ok: true, added: r.added, skipped: r.skipped };
}
