import type { SheetData } from "../studio/types";
import { type CustomSheet, isCustomSheet, sheetText, videoText } from "../studio/custom-template";

/* Edit cards: one per video, edited on the creator's Mac by the Creator Desk
   Helper. Safe to import anywhere. */

export const EDIT_STATUSES = ["todo", "queued", "editing", "needs_you", "ready", "done", "failed"] as const;
export type EditStatus = (typeof EDIT_STATUSES)[number];

export const STATUS_LABEL: Record<EditStatus, string> = {
  todo: "To edit",
  queued: "Waiting for your Mac",
  editing: "Editing",
  needs_you: "Needs you",
  ready: "Check it in CapCut",
  done: "Done",
  failed: "Stopped",
};

export type EditFile = { path: string; name: string; duration?: number | null };

/** A card for a whole shoot sheet (every video, edited in one go) has this video code. */
export const WHOLE_SHEET = "ALL";

/** A card whose clips your Mac finds itself, in Apple Photos and on your drives: its brief has a line "LIBRARY SEARCH: laptop, coffee, desk". */
export const LIBRARY_LINE = /^LIBRARY SEARCH:[ \t]*(.+)$/m;
export const findsOwnClips = (brief: string) => LIBRARY_LINE.test(brief);
/** A trial-versions card that starts from a CapCut draft already on the Mac. */
export const DRAFT_LINE = /^CapCut draft to start from:[ \t]*(.+)$/m;
/** Cards the Mac can edit without picked clips. */
export const needsNoClips = (brief: string) => findsOwnClips(brief) || DRAFT_LINE.test(brief);

/** The oldest helper that can do the above (and trial versions); older ones need updating. */
export const HELPER_FOR_LIBRARY = "0.2.0";
export function helperOlderThan(version: string | undefined, wanted: string) {
  if (!version) return true;
  const a = version.split(".").map(Number);
  const b = wanted.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) < (b[i] || 0);
  return false;
}

export type EditCard = {
  id: string;
  projectId: string;
  sheetId: string | null;
  videoCode: string;
  title: string;
  brief: string;
  status: EditStatus;
  files: EditFile[];
  pickRequested: boolean;
  pickMode: "files" | "folder";
  draftName: string | null;
  updatedAt: string;
};

export type EditEvent = { id: number; kind: "status" | "assistant" | "tool" | "user" | "error" | "done"; text: string; at: string };

/** A recent clip on one of your Macs (deviceId says which). */
export type DeviceFile = { deviceId: string; path: string; name: string; folder: string; modifiedAt: string | null; duration: number | null; thumb: string | null };
export type Device = {
  id: string;
  name: string;
  lastSeen: string | null;
  online: boolean;
  info: { capcut?: string; claude?: string; macos?: string; capcutRunning?: boolean; helper?: string; folders?: string[]; libraries?: string[]; osxphotos?: boolean; maxEdits?: number; workdir?: string };
};

/** How many edits a Mac runs side by side, unless you choose otherwise on the Mac helper page. */
export const DEFAULT_MAX_EDITS = 3;
export const MAX_EDITS_CHOICES = [1, 2, 3, 4];
/** The oldest helper that runs more than one edit at once. */
export const HELPER_FOR_PARALLEL = "0.3.3";

const TYPE: Record<string, string> = { th: "Talking head", ls: "Lip-sync", ac: "Acting", gs: "Green screen" };

/** The whole shoot sheet as text: the week, where to film (with every clip in filming order), then each video. */
export function briefForWholeSheet(sheet: SheetData | CustomSheet): string {
  if (isCustomSheet(sheet)) return sheetText(sheet.custom.header, sheet);
  const head = [sheet.kicker, sheet.h1, sheet.summary].filter(Boolean).join("\n");
  const where = sheet.sessions
    .map((s) => [`${s.key} · ${s.name} (${s.light}) - videos ${s.videos.join(", ")}`, s.setup, "Film in this order:", ...s.clips.map((c) => `- ${c.code} · ${c.video}: ${c.text}`), s.note].filter(Boolean).join("\n"))
    .join("\n\n");
  const videos = sheet.videos.map((v) => briefFromSheet(sheet, v.code)).join("\n\n-----\n\n");
  return [head, "WHERE TO FILM", where, "VIDEOS", videos].join("\n\n");
}

/** Everything about one video, as text - the same thing as "Copy everything" on a shoot sheet card. */
export function briefFromSheet(sheet: SheetData | CustomSheet, code: string): string {
  if (isCustomSheet(sheet)) {
    const cv = sheet.videos.find((x) => x.code === code);
    return cv ? videoText(cv, sheet) : "";
  }
  const v = sheet.videos.find((x) => x.code === code);
  if (!v) return "";
  const where = sheet.sessions.find((s) => s.key === v.session);
  const clips = sheet.sessions.flatMap((s) => s.clips.filter((c) => c.video === v.code).map((c) => `- ${c.code}: ${c.text}`));
  const out: string[] = [];
  const add = (...lines: (string | false | null | undefined)[]) => lines.forEach((l) => l && out.push(l));
  add(`${v.code} · ${v.title}`, `${sheet.kicker} · Day ${v.day} · format ${v.format}`, `${TYPE[v.type] ?? v.type} · ${v.length} · film in ${v.session}${where ? ` (${where.name})` : ""}`, "");
  add(`Reference: ${v.ref}`, `Sound: ${v.sound.label}${v.sound.url ? ` (${v.sound.url})` : ""}${v.sound.sub ? ` - ${v.sound.sub}` : ""}`);
  add(`Headline: ${v.headline}${v.headSub ? ` (${v.headSub})` : ""}`, `Captions: ${v.captions}`, "");
  if (v.script.length) {
    add("Script:", ...v.script, "");
    if (v.hooks.length) add("Other hooks (swap for the first line):", ...v.hooks.map((h) => `- ${h}`), "");
    add(v.delivery && `Delivery: ${v.delivery}`, v.scriptNote && `Note: ${v.scriptNote}`);
  }
  if (v.beats.length) {
    add("What to do:", ...v.beats.map((b, i) => `${i + 1}. ${b}`), "");
    if (v.alts.length) add("Other headlines:", ...v.alts.map((h) => `- ${h}`), "");
  }
  add(`Where: ${v.where}`, `Props: ${v.props}`, "");
  if (clips.length) add("Clips filmed for this video:", ...clips, "");
  add("B-roll and app shots:", ...(v.over.length ? v.over.map((o) => `- ${o.code}: ${o.text}`) : [v.overNote || "None"]), "");
  add("Edit notes:", ...v.edit.map((e, i) => `${i + 1}. ${e}`), "");
  for (const c of v.captionsOpts) add(`Post caption (${c.label}): ${c.caption}`);
  add(v.hashtags);
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
