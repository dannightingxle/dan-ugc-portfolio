import "server-only";
import { execFile } from "node:child_process";
import { accessSync, chmodSync, constants, copyFileSync, existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { type SocialVideo, apifyEnabled, fetchSocialVideos } from "./apify";
import type { LinkedPage } from "./linked-pages";

/* Reference videos, watched the only way Claude can: as still frames.
   Claude reads images, not video, so (as in the Claude apps) a video is
   turned into a frame every second or so, each stamped with its time, plus
   what's said in it where the platform has captions or a transcript. Videos
   come from files uploaded into a linked Notion page and from TikTok and
   Instagram links in the brief (downloaded through Apify). */

export type VideoFrame = { at: number; data: string };
export type WatchedVideo = { label: string; url: string; seconds: number; caption: string; transcript: string; frames: VideoFrame[] };
export type Watched = { videos: WatchedVideo[]; failed: string[] };

const MAX_VIDEOS = 4;
const MAX_FRAMES_PER_VIDEO = 20;
const MAX_FRAMES = 60;
const MAX_VIDEO_BYTES = 150_000_000;
// Frames are scaled so their long side is at most this: on-screen text stays readable.
const FRAME_SIZE = 768;
const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; CreatorDesk/1.0; +https://www.dannightingxle.com)" };
const APIFY_BASE = process.env.APIFY_API_BASE || "https://api.apify.com";

type Source = { label: string; url: string; download?: string; caption?: string; transcript?: string; subtitles?: string };

// ---------------------------------------------------------------- finding them

/** A TikTok or Instagram video link (not a profile, search or hashtag page). */
export function socialVideoKind(raw: string): "tiktok" | "instagram" | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\./, "");
  if (host === "tiktok.com" && /^\/(@[\w.-]+\/(video|photo)\/\d+|t\/\w+|v\/\d+)/.test(url.pathname)) return "tiktok";
  if ((host === "vm.tiktok.com" || host === "vt.tiktok.com") && url.pathname.length > 2) return "tiktok";
  if (host === "instagram.com" && /^\/([\w.]+\/)?(reels?|p|tv)\/[\w-]+/.test(url.pathname)) return "instagram";
  return null;
}

const LINK = /https?:\/\/[^\s<>"'`)\]]+/gi;

/** The videos to watch: files uploaded into the linked pages first, then TikTok and Instagram links in the order they appear. */
export function findVideos(text: string, pages: LinkedPage[]) {
  const uploads = pages.flatMap((p) => p.files.filter((f) => f.kind === "video").map((f) => ({ label: `${f.name} (uploaded to "${p.title}")`, url: f.url })));
  const social: { url: string; kind: "tiktok" | "instagram" }[] = [];
  for (const raw of [text, ...pages.map((p) => p.text)].join("\n").match(LINK) ?? []) {
    const url = raw.replace(/[.,;:!?]+$/, "");
    const kind = socialVideoKind(url);
    if (kind && !social.some((s) => s.url === url)) social.push({ url, kind });
  }
  return { uploads, social };
}

// ---------------------------------------------------------------- frames

/** ffmpeg: the copy bundled with the app (ffmpeg-static), else one on the machine. */
let ffmpegBin = "";
function ffmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  if (ffmpegBin) return ffmpegBin;
  const bundled = ffmpegStatic;
  ffmpegBin = !bundled || !existsSync(bundled) ? "ffmpeg" : runnable(bundled);
  return ffmpegBin;
}

/** A bundled binary can lose its "runnable" flag on the way to the server: if so, run a copy from the temp folder. */
function runnable(file: string) {
  try {
    accessSync(file, constants.X_OK);
    return file;
  } catch {
    const copy = path.join(tmpdir(), "creator-desk-ffmpeg");
    if (!existsSync(copy)) copyFileSync(file, copy);
    chmodSync(copy, 0o755);
    return copy;
  }
}

function ffmpeg(args: string[]): Promise<{ stdout: Buffer; stderr: string; ok: boolean }> {
  return new Promise((resolve) => {
    const done = (err: Error | null, stdout: Buffer, stderr: Buffer) => resolve({ stdout, stderr: stderr.toString(), ok: !err });
    // Called through Reflect so the build doesn't try to trace which program runs (it would bundle the whole project).
    Reflect.apply(execFile, null, [ffmpegPath(), ["-hide_banner", "-nostdin", ...args], { encoding: "buffer", maxBuffer: 20_000_000, timeout: 60_000 }, done]);
  });
}

async function videoSeconds(file: string) {
  const { stderr } = await ffmpeg(["-i", file]); // exits with "no output file", but prints the length first
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (!m || !/Stream #.*Video:/.test(stderr)) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** When to take frames: every second for a short video; for a longer one, the first three seconds (the hook) then evenly to the end. */
export function frameTimes(seconds: number, max = MAX_FRAMES_PER_VIDEO) {
  const end = Math.max(0, seconds - 0.1);
  if (end <= 0) return [0];
  if (Math.ceil(end) <= max) return Array.from({ length: Math.floor(end) + 1 }, (_, i) => i);
  const hook = [0, 1, 2];
  const rest = max - hook.length;
  const from = 3;
  const to = Math.max(from, seconds - 0.5);
  return [...hook, ...Array.from({ length: rest }, (_, i) => Math.round((from + (i * (to - from)) / Math.max(1, rest - 1)) * 10) / 10)];
}

export function timeLabel(at: number) {
  const s = Math.floor(at);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

async function grabFrame(file: string, at: number): Promise<VideoFrame | null> {
  const scale = `scale=${FRAME_SIZE}:${FRAME_SIZE}:force_original_aspect_ratio=decrease:force_divisible_by=2`;
  const { stdout, ok } = await ffmpeg(["-loglevel", "error", "-ss", String(at), "-i", file, "-frames:v", "1", "-vf", scale, "-q:v", "4", "-f", "image2", "-c:v", "mjpeg", "pipe:1"]);
  return ok && stdout.length > 100 ? { at, data: stdout.toString("base64") } : null;
}

async function framesOf(file: string, max: number) {
  const seconds = await videoSeconds(file);
  if (!seconds) return null;
  const times = frameTimes(seconds, max);
  const frames: VideoFrame[] = [];
  for (let i = 0; i < times.length; i += 4) {
    const batch = await Promise.all(times.slice(i, i + 4).map((t) => grabFrame(file, t)));
    frames.push(...batch.filter((f): f is VideoFrame => Boolean(f)));
  }
  return frames.length ? { seconds, frames } : null;
}

// Apify's storage wants the token; nothing else gets it.
const headersFor = (url: string) => (url.startsWith(`${APIFY_BASE}/`) && process.env.APIFY_TOKEN ? { ...HEADERS, Authorization: `Bearer ${process.env.APIFY_TOKEN}` } : HEADERS);

async function download(url: string, file: string) {
  const res = await fetch(url, { headers: headersFor(url), redirect: "follow", signal: AbortSignal.timeout(60_000), cache: "no-store" });
  if (!res.ok) throw new Error(`the video didn't download (${res.status})`);
  if (Number(res.headers.get("content-length") || 0) > MAX_VIDEO_BYTES) throw new Error("the video is too big to look at");
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_VIDEO_BYTES) throw new Error("the video is too big to look at");
  await writeFile(file, bytes);
}

// ---------------------------------------------------------------- watching

/** Download each video and turn it into timed frames (and captions where the platform has them). */
export async function watchVideos(text: string, pages: LinkedPage[]): Promise<Watched> {
  const { uploads, social } = findVideos(text, pages);
  const failed: string[] = [];
  const sources: Source[] = uploads.slice(0, MAX_VIDEOS);
  const wanted = social.slice(0, MAX_VIDEOS - sources.length);
  if (wanted.length && !apifyEnabled) {
    failed.push(...wanted.map((s) => `${s.url} - Creator Desk needs Apify connected to download TikTok and Instagram videos.`));
  } else if (wanted.length) {
    const got = await fetchSocialVideos(wanted);
    for (const s of wanted) {
      const v: SocialVideo | undefined = got.videos[s.url];
      if (v?.download) sources.push({ label: v.label, url: s.url, download: v.download, caption: v.caption, transcript: v.transcript, subtitles: v.subtitles });
      else failed.push(`${s.url} - ${got.problem || "couldn't download that video to look at it (private, removed, or not a video)"}. Its link still works on the sheet.`);
    }
  }
  if (!sources.length) return { videos: [], failed };

  const dir = await mkdtemp(path.join(tmpdir(), "cd-video-"));
  const perVideo = Math.min(MAX_FRAMES_PER_VIDEO, Math.floor(MAX_FRAMES / sources.length));
  try {
    const watched = await Promise.all(
      sources.map(async (s, i): Promise<WatchedVideo | null> => {
        const file = path.join(dir, `v${i}.mp4`);
        try {
          const [, transcript] = await Promise.all([download(s.download ?? s.url, file), s.transcript || (s.subtitles ? subtitles(s.subtitles) : "")]);
          const got = await framesOf(file, perVideo);
          if (!got) throw new Error("the file isn't a video Creator Desk can read");
          return { label: s.label, url: s.url, seconds: got.seconds, caption: s.caption ?? "", transcript, frames: got.frames };
        } catch (e) {
          const why = e instanceof Error && !/fetch failed|aborted|timeout/i.test(e.message) ? e.message : "the video didn't download";
          failed.push(`${s.url} - ${why}. Its link still works on the sheet.`);
          return null;
        }
      }),
    );
    return { videos: watched.filter((v): v is WatchedVideo => Boolean(v)), failed };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** The videos for Claude: for each, what it is and what's said, then its frames in order, each with its time. */
export function videoBlocks(w: Watched) {
  return w.videos.flatMap((v, n) => [
    {
      type: "text" as const,
      text: [
        `Reference video ${n + 1}: ${v.label}`,
        `Link: ${v.url}`,
        `Length: ${Math.round(v.seconds)}s. Below are ${v.frames.length} frames in order, each after its time${v.frames.length > 1 && v.frames[1].at - v.frames[0].at === 1 ? " (one per second)" : ""}.`,
        v.caption && `Caption: ${v.caption}`,
        v.transcript ? `What's said (from the platform's captions):\n${v.transcript}` : "There's no transcript for this one: you can't hear it, so go by the frames and any words on screen.",
      ]
        .filter(Boolean)
        .join("\n"),
    },
    ...v.frames.flatMap((f) => [
      { type: "text" as const, text: `Video ${n + 1} at ${timeLabel(f.at)}` },
      { type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: f.data } },
    ]),
  ]);
}

/** The platform's captions for a video, as timed lines; nothing if they won't load. */
async function subtitles(url: string) {
  try {
    const res = await fetch(url, { headers: headersFor(url), signal: AbortSignal.timeout(20_000), cache: "no-store" });
    return res.ok ? vttToText(await res.text()) : "";
  } catch {
    return "";
  }
}

/** WebVTT captions as short timed lines ("0:03 text"). */
export function vttToText(vtt: string) {
  const out: string[] = [];
  for (const cue of vtt.replace(/\r/g, "").split(/\n\n+/)) {
    const lines = cue.split("\n");
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const m = /(?:(\d+):)?(\d+):(\d+)[.,]\d+\s*-->/.exec(lines[i]);
    const words = lines
      .slice(i + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (!m || !words) continue;
    const at = Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    if (out.at(-1)?.endsWith(words)) continue;
    out.push(`${timeLabel(at)} ${words}`);
  }
  return out.join("\n").slice(0, 8000);
}
