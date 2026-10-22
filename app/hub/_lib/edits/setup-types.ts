/* Editing setup: the actual files Claude Code edits your videos with (its
   main CLAUDE.md, skills, each edit folder's CLAUDE.md files and memory),
   word for word, kept in the cloud and carried between your Macs. Safe to
   import anywhere. */

import { HELPER_FOR_SETUP } from "./style-types";
import { helperOlderThan, type Device } from "./types";

/** Files and bytes kept per person, at most. */
export const MAX_SETUP_FILES = 1000;
export const MAX_SETUP_BYTES = 80 * 1024 * 1024;
/** One file, at most. */
export const MAX_SETUP_FILE = 2 * 1024 * 1024;
/** File content in one request either way (Vercel turns away bodies over 4.5 MB). */
export const SETUP_CHUNK = 3_500_000;
export const MAX_SETUP_PATH = 400;

/** Where a file lives on a Mac, written the same way on every Mac:
    - "~/.claude/CLAUDE.md": Claude Code's main instructions
    - "~/.claude/skills/<skill>/<file>": a skill
    - "F/CLAUDE.md", "F/CLAUDE.local.md", "F/.claude/CLAUDE.md", "F/.claude/skills/<skill>/<file>": an edit folder F ("~/…")
    - "memory:F/<file>": Claude Code's memory for folder F. */
export type SetupPlace =
  | { kind: "main" }
  | { kind: "skill"; skill: string; where: string; file: string }
  | { kind: "folder"; folder: string; file: string }
  | { kind: "memory"; rest: string };

const HOME_SKILL = /^~\/\.claude\/skills\/([^/]+)\/(.+)$/;
const FOLDER_MD = /^(~\/.+?)\/(\.claude\/CLAUDE\.md|CLAUDE\.md|CLAUDE\.local\.md)$/;
const FOLDER_SKILL = /^(~\/.+?)\/\.claude\/skills\/([^/]+)\/(.+)$/;
const MEMORY = /^memory:(~\/[^/]+(?:\/[^/]+)+)$/;

/** What a path is, or null if it isn't one of the shapes above (or tries to leave them). */
export function readPath(path: unknown): SetupPlace | null {
  if (typeof path !== "string" || !path || path.length > MAX_SETUP_PATH) return null;
  if (path.includes("..") || path.includes("//") || path.includes("\\") || path.includes("\0") || path.endsWith("/")) return null;
  const parts = path.split("/");
  if (parts.some((s) => s === ".")) return null;
  // Secrets stay on the Mac.
  const name = parts.at(-1)!;
  if (name === ".env" || name.startsWith(".env.")) return null;
  if (path === "~/.claude/CLAUDE.md") return { kind: "main" };
  let m = HOME_SKILL.exec(path);
  if (m) return { kind: "skill", skill: m[1], where: "~", file: m[2] };
  m = MEMORY.exec(path);
  if (m) return { kind: "memory", rest: m[1] };
  if (!path.startsWith("~/")) return null;
  // An edit folder is never inside a .claude folder: of F/.claude only CLAUDE.md and skills are carried (never settings).
  const inClaude = (f: string) => f.split("/").includes(".claude");
  m = FOLDER_SKILL.exec(path);
  if (m) return inClaude(m[1]) ? null : { kind: "skill", skill: m[2], where: m[1], file: m[3] };
  // "F/.claude/CLAUDE.md" reads as folder F, not "F/.claude".
  m = FOLDER_MD.exec(path);
  if (m) return inClaude(m[1]) ? null : { kind: "folder", folder: m[1], file: m[2] };
  return null;
}

/** The skill a file belongs to, if it's part of one. */
export const skillOf = (path: string) => {
  const p = readPath(path);
  return p?.kind === "skill" ? p.skill : null;
};

/** The edit folder a path belongs to, if any: F of "F/CLAUDE.md", "F/.claude/…", or (memory) everything before the file name. */
export function folderOf(path: string) {
  const p = readPath(path);
  if (p?.kind === "folder") return p.folder;
  if (p?.kind === "skill" && p.where !== "~") return p.where;
  if (p?.kind === "memory") return p.rest.slice(0, p.rest.lastIndexOf("/"));
  return null;
}

/** Which edit folder a memory file is for: the longest of your folders it starts with (memory:F/<file>), or else everything before the file name. */
export function memoryFolder(rest: string, folders: string[]) {
  const known = folders.filter((f) => rest.startsWith(`${f}/`)).sort((a, b) => b.length - a.length)[0];
  return known ?? rest.slice(0, rest.lastIndexOf("/"));
}

/** An edit folder as the helper gets it: "~/…", without a trailing slash. */
export function cleanFolder(folder: string) {
  const f = folder.trim().replace(/\/+$/, "");
  return f.startsWith("~/") && f.length > 2 && !f.includes("..") && !f.includes("//") && !f.includes("\\") && !f.includes("\0") ? f : null;
}

/** One version of a file, as the page sees it. */
export type SetupVersion = { sha: string; size: number; mtime: string; exec: boolean; binary: boolean; mac: string; updatedAt: string };
/** A file in your setup: the version every Mac gets, and (when two Macs had different ones) the other version, until you choose. */
export type SetupFile = SetupVersion & { path: string; other?: SetupVersion };

export type SetupSkill = {
  name: string;
  /** Files of it kept here. */
  files: number;
  /** What your Macs said about a skill they left out. */
  description?: string;
  skippedBy?: string[];
  /** Your choice: "include", "exclude", or null for the helper's own judgement (editing-related skills). */
  choice: "include" | "exclude" | null;
};

/** One Mac's part in a sync: send its files (upload), then, once every Mac has sent (or 3 minutes on), get the shared ones (download). */
export type SetupRequest = {
  id: string;
  batch: string;
  deviceId: string;
  mac: string;
  phase: "upload" | "download";
  /** waiting: not picked up yet · uploading · sent: waiting for your other Macs · downloading · done · failed · expired: the Mac didn't pick it up in time. */
  status: "waiting" | "uploading" | "sent" | "downloading" | "done" | "failed" | "expired";
  createdAt: string;
  error?: string;
  upload?: { finishedAt: string; error?: string; sent?: number };
  download?: { finishedAt: string; error?: string; written: string[]; backedUp: string[]; backupDir?: string; skipped: { path: string; why: string }[] };
  /** Files this Mac had that Creator Desk had no room for. */
  notKept?: { path: string; why: string }[];
};

export const SYNC_LIVE = new Set<SetupRequest["status"]>(["waiting", "uploading", "sent", "downloading"]);

/** A Mac whose helper can sync the setup: it says so (setup: true), or it's new enough. */
export const canSyncSetup = (d: Pick<Device, "info">) => (d.info as { setup?: boolean }).setup === true || !helperOlderThan(d.info.helper, HELPER_FOR_SETUP);
