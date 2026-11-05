import "server-only";
import { adminClient } from "../supabase/admin";
import { BRAND_ID } from "../studio/brand-types";
import { getBrand } from "../studio/brand";
import { getWorkspace } from "../studio/data";
import { bufferCalendar, jobChannels } from "./data";
import type { Channel } from "./types";

/* Finished videos, straight from CapCut's export, matched to what they are:
   the edit card that made the draft (its draft name is the file name), the
   shoot sheet video it came from and that video's caption, and the job's
   Buffer accounts (saved from last time, or matched from the job's handles). */

export type FinishedVideo = {
  /** The file's name, as picked. */
  name: string;
  projectId: string | null;
  brand: string;
  /** V3, T2… */
  code: string;
  /** What the video is, from its card or sheet. */
  title: string;
  caption: string;
  channelIds: string[];
  /** Where the accounts came from: saved for the job, matched from its handles, or none yet. */
  channelsFrom: "saved" | "handles" | "none";
  videosPerDay: number | null;
  /** Why it couldn't be matched, or a caption couldn't be found; empty if all's well. */
  problem: string;
  /** The same caption is already waiting in the queue on one of its accounts. */
  alreadyQueued: boolean;
};

type EditRow = { id: string; project_id: string; sheet_id: string | null; video_code: string | null; title: string; draft_name: string | null; updated_at: string };
type Project = { id: string; data: { brand?: string; title?: string; videosPerDay?: number | null } };
type Rec = Record<string, unknown>;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** "SOL V3 (1).mp4" → "SOL V3": CapCut exports a draft under its name; Finder adds " (1)" to a copy. */
export const baseName = (file: string) =>
  file
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/\s*\(\d+\)$/, "")
    .replace(/_/g, " ")
    .trim();
const codeIn = (s: string) => /\b([VT]\d{1,2})\b/i.exec(s)?.[1].toUpperCase() ?? "";
const codeNumber = (code: string) => Number(code.slice(1)) || 0;

/** A video's caption on a shoot sheet (Creator Desk's own, or the job's own template), with its hashtags. */
function captionOnSheet(data: unknown, code: string): { caption: string; title: string } | null {
  const videos = ((data as Rec | null)?.videos ?? []) as Rec[];
  const v = Array.isArray(videos) ? videos.find((x) => String(x?.code ?? "").toUpperCase() === code) : undefined;
  if (!v) return null;
  const opts = (v.captionsOpts ?? v.captionOpts ?? []) as unknown[];
  const first = Array.isArray(opts) ? opts[0] : undefined;
  // { label, caption } on Creator Desk's sheet; [label, caption] in a job's own template.
  const fromOpts = Array.isArray(first) ? String(first[1] ?? "") : first && typeof first === "object" ? String((first as Rec).caption ?? "") : "";
  const caption = (fromOpts || (typeof v.caption === "string" ? v.caption : "") || (typeof v.postCaption === "string" ? v.postCaption : "")).trim();
  const tags = typeof v.hashtags === "string" ? v.hashtags.trim() : "";
  const withTags = tags && !caption.includes(tags.split(/\s+/)[0]) ? `${caption}\n\n${tags}`.trim() : caption;
  return { caption: withTags, title: String(v.title ?? "") };
}

/** The handles a job's videos go out on (its Account tab), as platform + handle; suggested ones not made yet are left out. */
function handlesFrom(text: string) {
  return text
    .split("\n")
    .filter((l) => !/suggested|not created/i.test(l))
    .flatMap((l) => {
      const platform = /tiktok/i.test(l) ? "tiktok" : /insta/i.test(l) ? "instagram" : /youtube/i.test(l) ? "youtube" : "";
      return [...l.matchAll(/@([\w.]+)/g)].map((m) => ({ platform, handle: m[1].toLowerCase() }));
    });
}

/** The accounts a job's handles name - and its other accounts under the same name (a Facebook page or YouTube channel
    called what the TikTok's display name is), as a suggestion to tick or untick. */
function channelsForHandles(handles: { platform: string; handle: string }[], channels: Channel[]) {
  const usable = channels.filter((c) => !c.isDisconnected && !c.isLocked);
  const named = usable.filter((c) => handles.some((h) => h.handle === c.name.replace(/^@/, "").toLowerCase() && (!h.platform || h.platform === c.service)));
  const names = new Set(named.flatMap((c) => [c.displayName, c.name].filter(Boolean).map((n) => norm(String(n)))));
  const alsoNamed = usable.filter((c) => !named.includes(c) && [c.displayName, c.name].some((n) => n && names.has(norm(n))));
  return [...named, ...alsoNamed].map((c) => c.id);
}

/** Where a job's videos go: the accounts saved for it, or (until you save some) the ones its handles suggest. */
export async function jobAccounts(userId: string, projectId: string) {
  const [calendar, saved] = await Promise.all([bufferCalendar(userId).catch(() => null), jobChannels(userId)]);
  const channels = calendar?.channels ?? [];
  const usable = new Set(channels.filter((c) => !c.isDisconnected && !c.isLocked).map((c) => c.id));
  const kept = (saved[projectId] ?? []).filter((id) => usable.has(id));
  if (projectId in saved) return { channels, channelIds: kept, from: "saved" as const };
  const handles = projectId === BRAND_ID ? (await getBrand(userId)).accounts.map((a) => ({ platform: a.platform, handle: a.handle.replace(/^@/, "").toLowerCase() })) : handlesFrom((await getWorkspace(userId, projectId)).account.handles);
  return { channels, channelIds: channelsForHandles(handles, channels), from: "handles" as const };
}

/** Each file matched; `jobFor` names the job for a file you've told it about (by file name). */
export async function matchFinished(userId: string, names: string[], jobFor: Record<string, string> = {}): Promise<{ videos: FinishedVideo[]; channels: Channel[] }> {
  const db = adminClient();
  const [{ data: edits }, { data: projects }, calendar, saved] = await Promise.all([
    db.from("hub_edits").select("id, project_id, sheet_id, video_code, title, draft_name, updated_at").eq("user_id", userId).not("draft_name", "is", null).order("updated_at", { ascending: false }).limit(500),
    db.from("hub_projects").select("id, data").eq("user_id", userId),
    bufferCalendar(userId).catch(() => null),
    jobChannels(userId),
  ]);
  const channels = calendar?.channels ?? [];
  const usable = new Set(channels.filter((c) => !c.isDisconnected && !c.isLocked).map((c) => c.id));
  const projectList = (projects ?? []) as Project[];
  const project = (id: string) => projectList.find((p) => p.id === id);
  const sheets = new Map<string, unknown>();
  const sheet = async (id: string) => {
    if (!sheets.has(id)) sheets.set(id, (await db.from("hub_shoot_sheets").select("data").eq("user_id", userId).eq("id", id).maybeSingle<{ data: unknown }>()).data?.data ?? null);
    return sheets.get(id);
  };
  // A job's newest sheet with that video on it, for a file whose card isn't found.
  const latestSheetWith = async (projectId: string, code: string) => {
    const { data } = await db.from("hub_shoot_sheets").select("id, data").eq("user_id", userId).eq("project_id", projectId).order("created_at", { ascending: false }).limit(10);
    return (data ?? []).find((r) => captionOnSheet(r.data, code)) ?? null;
  };
  let brand: Awaited<ReturnType<typeof getBrand>> | null = null;
  const brandData = async () => (brand ??= await getBrand(userId));
  const handleCache = new Map<string, string[]>();
  const fromHandles = async (projectId: string) => {
    if (!handleCache.has(projectId)) {
      const handles = projectId === BRAND_ID ? (await brandData()).accounts.map((a) => ({ platform: a.platform, handle: a.handle.replace(/^@/, "").toLowerCase() })) : handlesFrom((await getWorkspace(userId, projectId)).account.handles);
      handleCache.set(projectId, channelsForHandles(handles, channels));
    }
    return handleCache.get(projectId)!;
  };

  const out: FinishedVideo[] = [];
  for (const name of names) {
    const base = baseName(name);
    const v: FinishedVideo = { name, projectId: null, brand: "", code: codeIn(base), title: "", caption: "", channelIds: [], channelsFrom: "none", videosPerDay: null, problem: "", alreadyQueued: false };
    // The card whose draft has this name (the newest, if a name was used again).
    const told = jobFor[name];
    const edit = told ? undefined : ((edits ?? []) as EditRow[]).find((e) => (e.draft_name ?? "").split(/,\s*/).some((d) => norm(d) === norm(base)));
    if (told) {
      if (told === BRAND_ID || project(told)) v.projectId = told;
    } else if (edit) {
      v.projectId = edit.project_id;
      if (!v.code && edit.video_code && edit.video_code !== "ALL") v.code = edit.video_code.toUpperCase();
      v.title = edit.title;
      if (edit.project_id === BRAND_ID) {
        // Your own videos: the caption from the idea or trial version it was made from.
        const b = await brandData();
        const idea = b.ideas.find((i) => i.editId === edit.id);
        const trial = b.trials.find((t) => t.editId === edit.id);
        const version = trial?.versions.find((x) => x.code.toUpperCase() === v.code);
        v.caption = (version?.caption ?? idea?.caption ?? "").trim();
        v.title = idea?.title ?? trial?.title ?? edit.title;
      } else if (edit.sheet_id && v.code) {
        const found = captionOnSheet(await sheet(edit.sheet_id), v.code);
        if (found) {
          v.caption = found.caption;
          v.title = found.title || edit.title;
        }
      }
    } else {
      // No card made it (edited by hand): the job by the name before the video number, and its newest sheet.
      const before = v.code ? norm(base.slice(0, base.toUpperCase().indexOf(v.code)).trim()) : "";
      const p = before === "personal" ? { id: BRAND_ID, data: { brand: "Personal brand" } } : projectList.find((x) => before && norm(String(x.data?.brand ?? "")) === before);
      if (p) v.projectId = p.id;
    }
    if (v.projectId && !v.caption && v.code && v.projectId !== BRAND_ID) {
      const r = await latestSheetWith(v.projectId, v.code);
      const found = r && captionOnSheet(r.data, v.code);
      if (found) {
        v.caption = found.caption;
        v.title ||= found.title;
      }
    }
    if (v.projectId) {
      const p = project(v.projectId);
      v.brand = v.projectId === BRAND_ID ? "Personal brand" : String(p?.data?.brand ?? "");
      v.videosPerDay = typeof p?.data?.videosPerDay === "number" ? p.data.videosPerDay : null;
      const kept = (saved[v.projectId] ?? []).filter((id) => usable.has(id));
      if (v.projectId in saved) {
        v.channelIds = kept;
        v.channelsFrom = "saved";
      } else {
        v.channelIds = await fromHandles(v.projectId);
        v.channelsFrom = v.channelIds.length ? "handles" : "none";
      }
    }
    v.problem = !v.projectId
      ? `Couldn't tell which job "${base}" is for - pick it below.`
      : !v.caption
        ? `No caption found for ${v.code || "this video"} on ${v.brand}'s shoot sheets - write one below.`
        : !v.channelIds.length
          ? `Pick which accounts ${v.brand}'s videos go to (saved for next time).`
          : "";
    // Already waiting in the queue with the same caption on one of these accounts: probably scheduled before.
    const same = (t: string) => norm(t) === norm(v.caption);
    v.alreadyQueued = Boolean(v.caption && calendar?.scheduled.some((post) => v.channelIds.includes(post.channelId) && same(post.text)));
    out.push(v);
  }
  // In posting order: by job, then video number, so each job's queue fills V1, V2, V3…
  // Ones it couldn't place go last.
  out.sort((a, b) => Number(!a.projectId) - Number(!b.projectId) || a.brand.localeCompare(b.brand) || codeNumber(a.code) - codeNumber(b.code) || a.name.localeCompare(b.name));
  return { videos: out, channels };
}
