import type { SheetData } from "../studio/types";

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
  draftName: string | null;
  updatedAt: string;
};

export type EditEvent = { id: number; kind: "status" | "assistant" | "tool" | "user" | "error" | "done"; text: string; at: string };

export type DeviceFile = { path: string; name: string; folder: string; modifiedAt: string | null; duration: number | null; thumb: string | null };
export type Device = {
  id: string;
  name: string;
  lastSeen: string | null;
  online: boolean;
  info: { capcut?: string; claude?: string; macos?: string; capcutRunning?: boolean; helper?: string; folders?: string[] };
};

const TYPE: Record<string, string> = { th: "Talking head", ls: "Lip-sync", ac: "Acting", gs: "Green screen" };

/** Everything about one video, as text - the same thing as "Copy everything" on a shoot sheet card. */
export function briefFromSheet(sheet: SheetData, code: string): string {
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
