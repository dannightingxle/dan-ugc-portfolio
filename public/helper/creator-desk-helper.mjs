#!/usr/bin/env node
/*
  Creator Desk Helper - runs on your Mac and does the editing for your Creator Desk edit cards.

  It asks Creator Desk every couple of seconds whether there's anything to do:
    - open the Mac file picker so you can choose the clips for a video,
    - edit a video: it hands the video card and the clips to YOUR Claude Code (same login,
      same skills, same CapCut tool you already use) and sends the conversation back to the card,
    - pass on your replies from the card to that same Claude Code session,
    - stop an edit.
  It also tells Creator Desk your latest video files (name, length, a small thumbnail), so you
  can pick clips from the website. Videos never leave your Mac.

  For a card made from an idea ("LIBRARY SEARCH: laptop, coffee" in its brief) it finds the
  B-roll itself first: it searches Apple Photos (the same search as the Photos app, so "beach",
  "dog" or "laptop" work) and exports what it finds, and looks through every video on your
  external drives by folder and file name. Claude Code then picks the clips that fit.

  It also keeps your edit styles in step: Creator Desk can ask it to read how your Claude Code is set
  up to edit (your CLAUDE.md files, skills and Claude Code's memory for your edit folders - read only),
  or to take a few key frames from a finished video you pick, so every Mac edits in the same style.
  Only your editing skills are read (ones about CapCut, video, captions, B-roll, shortform…), not the rest.

  And it can copy your editing setup word for word between your Macs ("Sync my editing setup"): one Mac
  sends Creator Desk its ~/.claude/CLAUDE.md, its editing skills (every file in them: brands/*.md, caption
  timing scripts…), the CLAUDE.md files and skills in your edit folders and Claude Code's memory for them;
  the other Mac writes them into the same places. Before replacing a file that's different it keeps a copy
  in ~/.creator-desk/backups, it never deletes anything, and it only ever writes CLAUDE.md files, skills
  and Claude Code memory.

  An edit can use any media you pick: videos, images (stills, logos, screenshots) and audio (voiceovers,
  music). Claude is told which is which.

  It keeps itself up to date: Creator Desk says which helper is newest every time it checks in, so a
  new one is downloaded and started as soon as no edit is running - in the same window, never needing a
  new connect code (set CDH_NO_UPDATE=1 to stop that). It can also run in the background, with no
  Terminal window: press "Run in the background" on Creator Desk's Mac helper page (or run
  "autostart on"), and macOS starts it when you log in and again if it ever stops.

  Usage:
    node creator-desk-helper.mjs connect ABCD-EFGH     connect this Mac (code from Creator Desk)
    node creator-desk-helper.mjs                       run (keep the window open)
    node creator-desk-helper.mjs autostart on|off      run in the background, starting by itself when you log in
    node creator-desk-helper.mjs status                show what it can see
    node creator-desk-helper.mjs find "laptop"         try the B-roll search (Apple Photos and drives)

  Needs: macOS, Node 18+, Claude Code (`claude`) signed in, CapCut desktop. ffmpeg/ffprobe for
  clip lengths and thumbnails (optional). Settings: ~/.creator-desk/helper.json ("libraries":
  the folders to look through for B-roll; by default every external drive under /Volumes).
*/

import { spawn, execFile, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const VERSION = "0.3.11";
const HOME = process.env.CDH_HOME || path.join(os.homedir(), ".creator-desk");
const CONFIG = path.join(HOME, "helper.json");
const THUMBS = path.join(HOME, "thumbs.json");
const LIBRARY = path.join(HOME, "library.json");
const LIBRARY_LIST = path.join(HOME, "library.txt");
const BROLL = path.join(os.homedir(), "Movies", "Creator Desk", "B-roll");
const TRIALS = path.join(os.homedir(), "Movies", "Creator Desk", "Trial reels");
const POLL_MS = Number(process.env.CDH_POLL_MS) || 2000;
const VIDEO = /\.(mov|mp4|m4v)$/i;
// Anything CapCut takes: videos, images (stills, logos, screenshots) and audio (voiceovers, music).
const MEDIA_VIDEO = /\.(mov|mp4|m4v|avi|mkv|webm|mts|m2ts|3gp)$/i;
const MEDIA_IMAGE = /\.(jpe?g|png|heic|heif|gif|webp|tiff?|bmp|svg|psd)$/i;
const MEDIA_AUDIO = /\.(mp3|wav|m4a|aac|aiff?|flac|ogg|caf|opus)$/i;
const mediaKind = (name) => (MEDIA_VIDEO.test(name) ? "video" : MEDIA_IMAGE.test(name) ? "image" : MEDIA_AUDIO.test(name) ? "audio" : null);

// ------------------------------------------------------------ settings

function load() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  } catch {
    return null;
  }
}
function save(cfg) {
  fs.mkdirSync(HOME, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}
// Web search and fetch let an edit find and fetch a sound, a logo or a screenshot like in a normal chat.
const TOOLS = ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "Skill", "WebFetch", "WebSearch", "mcp__capcut"];
function defaults(cfg) {
  const home = os.homedir();
  const shortform = path.join(home, "Movies", "shortform");
  return {
    folders: [path.join(home, "Downloads"), path.join(home, "Desktop"), path.join(home, "Movies")],
    workdir: fs.existsSync(shortform) ? shortform : home,
    claude: "claude",
    ...cfg,
    // What Claude Code may do without asking (it runs without a window to approve things in); configs saved by older helpers get the newer tools too.
    allowedTools: [...new Set([...(cfg?.allowedTools ?? []), ...TOOLS])],
    // Overrides (handy for testing): CDH_FOLDERS=a:b, CDH_WORKDIR, CDH_CLAUDE
    ...(process.env.CDH_FOLDERS ? { folders: process.env.CDH_FOLDERS.split(":") } : {}),
    ...(process.env.CDH_WORKDIR ? { workdir: process.env.CDH_WORKDIR } : {}),
    ...(process.env.CDH_CLAUDE ? { claude: process.env.CDH_CLAUDE } : {}),
    ...(process.env.CDH_LIBRARIES ? { libraries: process.env.CDH_LIBRARIES.split(":") } : {}),
  };
}

// ------------------------------------------------------------ small helpers

// The Mac's own name (as in System Settings), e.g. "Dan's MacBook Air".
const macName = () => process.env.CDH_NAME || run("scutil", ["--get", "ComputerName"]) || os.hostname().replace(/\.local$/, "");
const log = (...a) => console.log(new Date().toLocaleTimeString("en-GB"), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function run(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15_000, ...opts }).trim();
  } catch {
    return "";
  }
}
const has = (bin) => Boolean(run("/usr/bin/which", [bin]));
const ffprobe = () => process.env.CDH_FFPROBE || (has("ffprobe") ? "ffprobe" : "");
const ffmpeg = () => process.env.CDH_FFMPEG || (has("ffmpeg") ? "ffmpeg" : "");

function duration(file) {
  if (mediaKind(file) === "image") return null;
  const bin = ffprobe();
  if (!bin) return null;
  const out = run(bin, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
  const n = Number(out);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : null;
}
const mmss = (s) => (s == null ? "" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);

// A small JPEG from a second into the clip, as a data URL. Cached so each clip is only done once.
let thumbCache = {};
try {
  thumbCache = JSON.parse(fs.readFileSync(THUMBS, "utf8"));
} catch {}
function thumb(file, mtime) {
  const key = `${file}|${mtime}`;
  if (thumbCache[key] !== undefined) return thumbCache[key];
  const bin = mediaKind(file) === "audio" ? null : ffmpeg();
  let data = null;
  if (bin) {
    const out = path.join(os.tmpdir(), `cdh-${process.pid}.jpg`);
    // A picture is its own thumbnail; a video's is a second in.
    const from = mediaKind(file) === "image" ? ["-i", file] : ["-ss", "1", "-i", file];
    run(bin, ["-v", "error", "-y", ...from, "-frames:v", "1", "-vf", "scale=160:-2", "-q:v", "6", out], { timeout: 20_000 });
    try {
      data = "data:image/jpeg;base64," + fs.readFileSync(out).toString("base64");
      fs.rmSync(out);
    } catch {}
  }
  thumbCache[key] = data && data.length < 55_000 ? data : null;
  try {
    fs.writeFileSync(THUMBS, JSON.stringify(thumbCache));
  } catch {}
  return thumbCache[key];
}

// ------------------------------------------------------------ talking to Creator Desk

let cfg = null;
async function api(method, route, body) {
  const res = await fetch(cfg.server.replace(/\/$/, "") + route, {
    method,
    headers: { authorization: `Bearer ${cfg.token}`, "content-type": "application/json", "user-agent": `creator-desk-helper/${VERSION}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) {
    console.error("\nThis Mac isn't connected to Creator Desk any more. Get a new code on Creator Desk and run:\n  node " + process.argv[1] + " connect YOUR-CODE\n");
    process.exit(1);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Creator Desk said ${res.status}`);
  return json;
}
const update = (id, body) => api("POST", `/api/hub/helper/edits/${id}`, body);

// ------------------------------------------------------------ what this Mac can see

function info() {
  return {
    helper: VERSION,
    macos: run("sw_vers", ["-productVersion"]) || os.release(),
    capcut: run("defaults", ["read", "/Applications/CapCut.app/Contents/Info.plist", "CFBundleShortVersionString"]) || null,
    capcutRunning: Boolean(run("pgrep", ["-x", "CapCut"])),
    claude: run(cfg.claude, ["--version"]) || null,
    ffmpeg: Boolean(ffmpeg()),
    folders: cfg.folders,
    libraries: libraries(),
    osxphotos: Boolean(osxphotos()),
    workdir: cfg.workdir,
    // Pages you're logged in to (a brand's portal, a Google-login brief) can be read through your browser.
    reads: true,
    browser: BROWSER,
    // It can read your editing setup and take key frames for Creator Desk's edit styles.
    styles: true,
    // It runs in the background (macOS starts it at login and keeps it going), not in a Terminal window.
    background: !leavingBackground && fs.existsSync(PLIST),
    // It can copy your editing setup (CLAUDE.md files, editing skills, memory) between your Macs.
    setup: true,
  };
}

// The newest media in your folders (two levels deep, last 3 weeks), skipping CapCut's own files: up to 40 videos,
// 20 images and 20 audio files, so a pile of screenshots never pushes your clips off the list.
function recentClips() {
  const since = Date.now() - 21 * 86_400_000;
  const found = [];
  const walk = (dir, depth) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < 2 && !/^(CapCut|node_modules|Library|Photos Library\.photoslibrary)$/i.test(e.name) && !e.name.endsWith(".photoslibrary")) walk(p, depth + 1);
      } else if (mediaKind(e.name)) {
        try {
          const st = fs.statSync(p);
          if (st.mtimeMs >= since) found.push({ path: p, name: e.name, kind: mediaKind(e.name), folder: dir.replace(os.homedir(), "~"), mtime: st.mtimeMs });
        } catch {}
      }
    }
  };
  for (const f of cfg.folders) walk(f, 0);
  const newest = (kind, n) => found.filter((f) => f.kind === kind).sort((a, b) => b.mtime - a.mtime).slice(0, n);
  return [...newest("video", 40), ...newest("image", 20), ...newest("audio", 20)]
    .sort((a, b) => b.mtime - a.mtime)
    .map((f) => ({ path: f.path, name: f.name, folder: f.folder, modifiedAt: new Date(f.mtime).toISOString(), duration: duration(f.path), thumb: thumb(f.path, f.mtime) }));
}

let lastFilesKey = "";
let lastReport = 0;
async function report(force = false) {
  if (!force && Date.now() - lastReport < 30_000) return;
  lastReport = Date.now();
  const files = recentClips();
  const key = files.map((f) => f.path + f.modifiedAt).join("|");
  const body = { info: info() };
  if (key !== lastFilesKey || force) body.files = files;
  await api("POST", "/api/hub/helper/report", body);
  lastFilesKey = key;
}

// ------------------------------------------------------------ finding B-roll: Apple Photos and your drives

// The folders to look through for B-roll: your setting, or every external drive that's plugged in.
function libraries() {
  if (Array.isArray(cfg.libraries)) return cfg.libraries;
  let names = [];
  try {
    names = fs.readdirSync("/Volumes");
  } catch {
    return [];
  }
  return names
    .filter((n) => !n.startsWith(".") && !/^(Recovery|Preboot|VM|Update|com\.apple\..*)$/i.test(n))
    .map((n) => path.join("/Volumes", n))
    .filter((p) => {
      try {
        return fs.realpathSync(p) !== "/"; // the Mac's own disk shows up here too
      } catch {
        return false;
      }
    });
}

const SKIP_DIR = /^(\$RECYCLE\.BIN|System Volume Information|Backups\.backupdb|node_modules|CapCut|Library)$|\.(photoslibrary|fcpbundle|imovielibrary|app|lrdata)$/i;

// Every video on those drives, by path and date. Kept for a few hours, since walking a big drive takes a
// while; a walk that ran out of time is only kept for half an hour, so the next search finishes it.
async function libraryIndex() {
  const roots = libraries();
  try {
    const cached = JSON.parse(fs.readFileSync(LIBRARY, "utf8"));
    const keep = cached.complete === false ? 30 * 60_000 : 6 * 3_600_000;
    if (Date.now() - cached.builtAt < keep && JSON.stringify(cached.roots) === JSON.stringify(roots)) return cached.files;
  } catch {}
  const files = [];
  const until = Date.now() + 180_000;
  let complete = true;
  const walk = async (dir, depth) => {
    if (depth > 10) return;
    if (files.length >= 100_000 || Date.now() > until) {
      complete = false;
      return;
    }
    let entries = [];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIR.test(e.name)) await walk(p, depth + 1);
      } else if (VIDEO.test(e.name)) {
        try {
          files.push({ p, m: (await fs.promises.stat(p)).mtimeMs });
        } catch {}
      }
    }
  };
  if (roots.length) log(`Looking through the videos on ${roots.join(", ")}…`);
  for (const r of roots) await walk(r, 0);
  if (!complete) log(`Only got through part of your drives (${files.length} videos) - the rest next time.`);
  try {
    fs.writeFileSync(LIBRARY, JSON.stringify({ builtAt: Date.now(), roots, files, complete }));
    fs.writeFileSync(LIBRARY_LIST, files.map((f) => f.p).join("\n"));
  } catch {}
  return files;
}

// Videos on your drives whose folder or file name has every word of the search, newest first.
function searchDrives(index, term, max = 6) {
  const words = term.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return index
    .filter((f) => {
      const p = f.p.toLowerCase();
      return words.every((w) => p.includes(w));
    })
    .sort((a, b) => b.m - a.m)
    .slice(0, max)
    .map((f) => f.p);
}

// Apple Photos' own search (the same as typing in the Photos search field), newest first: the ids
// and file names of up to a few videos, or a few photos when there are no videos. Nothing is
// exported here.
const PHOTOS_FIND = [
  "on run argv",
  "set maxVideos to (item 2 of argv) as integer",
  'tell application "Photos"',
  "with timeout of 300 seconds",
  "set found to search for (item 1 of argv)",
  "set vids to {}",
  "set stills to {}",
  "set n to count of found",
  "set lowest to n - 300",
  "if lowest < 1 then set lowest to 1",
  "repeat with i from n to lowest by -1",
  "set m to item i of found",
  "set fn to filename of m",
  'if fn ends with ".mov" or fn ends with ".mp4" or fn ends with ".m4v" then',
  "set end of vids to (id of m) & tab & fn",
  "if (count of vids) >= maxVideos then exit repeat",
  "else if (count of stills) < 3 then",
  "set end of stills to (id of m) & tab & fn",
  "end if",
  "end repeat",
  "if (count of vids) = 0 then set vids to stills",
  "set AppleScript's text item delimiters to linefeed",
  "return vids as text",
  "end timeout",
  "end tell",
  "end run",
];

// Photos' own export, by id. It only works for originals already on this Mac: for ones kept in
// iCloud it says it's done and writes nothing, which is why osxphotos comes first.
const PHOTOS_EXPORT = [
  "on run argv",
  "set dest to (POSIX file (item 1 of argv)) as alias",
  'tell application "Photos"',
  "with timeout of 900 seconds",
  "set picked to {}",
  "repeat with i from 2 to count of argv",
  "set end of picked to media item id (item i of argv)",
  "end repeat",
  "export picked to dest with using originals",
  "end timeout",
  "end tell",
  "end run",
];

const runAsync = (cmd, args, timeout, env = process.env) =>
  new Promise((resolve) => execFile(cmd, args, { timeout, maxBuffer: 10_000_000, env }, (err, stdout, stderr) => resolve({ err, stdout: String(stdout), stderr: String(stderr) })));
const filesIn = (dir) => {
  try {
    return fs.readdirSync(dir).filter((n) => !n.startsWith(".")).map((n) => path.join(dir, n));
  } catch {
    return [];
  }
};

// osxphotos (github.com/RhetTbull/osxphotos) downloads originals that only live in iCloud.
function osxphotos() {
  const found = [cfg.osxphotos, process.env.CDH_OSXPHOTOS, run("/usr/bin/which", ["osxphotos"]), path.join(os.homedir(), ".local", "bin", "osxphotos"), "/opt/homebrew/bin/osxphotos", "/usr/local/bin/osxphotos"];
  return found.find((p) => p && fs.existsSync(p)) || "";
}

// ------------------------------------------------------------ reading pages you're logged in to

// Creator Desk can't use your logins, but your browser can: a link that needs you signed in is
// opened in a new tab of your own browser, its text copied, and the tab closed again.
const BROWSER = process.env.CDH_BROWSER || "Google Chrome";
const READ_JS =
  "JSON.stringify({title: document.title, url: location.href, text: document.body ? document.body.innerText : '', links: Array.from(document.links).slice(0, 300).map(a => [a.innerText.trim().slice(0, 120), a.href])})";
const readScript = (js = READ_JS) => [
  "on run argv",
  "set theURL to item 1 of argv",
  `tell application "${BROWSER.replace(/"/g, "")}"`,
  "if (count of windows) = 0 then make new window",
  "set t to make new tab at end of tabs of window 1 with properties {URL:theURL}",
  "try",
  "set waited to 0",
  "repeat while (loading of t) and waited < 40",
  "delay 0.5",
  "set waited to waited + 0.5",
  "end repeat",
  "delay 2",
  `set js to ${JSON.stringify(js)}`,
  "set out to execute t javascript js",
  // Pages that load their content after the page itself: wait until the text stops changing.
  'set prev to ""',
  "repeat 6 times",
  "if out is equal to prev then exit repeat",
  "set prev to out",
  "delay 1.5",
  "set out to execute t javascript js",
  "end repeat",
  "close t",
  "return out",
  "on error msg",
  "try",
  "close t",
  "end try",
  "error msg",
  "end try",
  "end tell",
  "end run",
];

async function readPage(url) {
  if (!/^https?:\/\//i.test(url)) return { error: "not a web link" };
  const { err, stdout, stderr } = process.env.CDH_READ_CMD
    ? await runAsync("/bin/sh", ["-c", process.env.CDH_READ_CMD, "sh", url], 120_000)
    : await runAsync("osascript", [...readScript().flatMap((l) => ["-e", l]), url], 120_000);
  const why = String(stderr || err?.message || "");
  if (err) {
    if (/turned off|Allow JavaScript from Apple Events/i.test(why)) {
      return { error: `${BROWSER} won't let the helper read pages yet: in ${BROWSER}, open the View menu → Developer → tick "Allow JavaScript from Apple Events"` };
    }
    if (/-1743|not authori[sz]ed|not allowed/i.test(why)) {
      return { error: `macOS hasn't let the helper control ${BROWSER}: System Settings → Privacy & Security → Automation → let Terminal (or node) control ${BROWSER}` };
    }
    return { error: `${BROWSER} couldn't open it (${why.trim().split("\n").pop()?.slice(0, 200) || "no reason given"})` };
  }
  try {
    const page = JSON.parse(stdout.trim());
    return { title: String(page.title || "").slice(0, 300), url: String(page.url || url), text: String(page.text || "").slice(0, 60_000), links: Array.isArray(page.links) ? page.links.slice(0, 300) : [] };
  } catch {
    return { error: "the page came back empty" };
  }
}

// ------------------------------------------------------------ sounds from links

// A sound from a link, for an edit: a TikTok sound page (its audio file, or else a video that uses it),
// an Instagram audio page (a reel that uses it), or any TikTok / Instagram / YouTube video (its audio).
// Sound pages are read in your own browser, where you're signed in.
const SOUNDS = path.join(os.homedir(), "Movies", "Creator Desk", "Sounds");
const SOUND_JS = `(() => {
  let play = "", title = "";
  try {
    const d = JSON.parse(document.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__").textContent);
    const m = d.__DEFAULT_SCOPE__["webapp.music-detail"].musicInfo.music;
    play = m.playUrl || ""; title = [m.title, m.authorName].filter(Boolean).join(" - ");
  } catch (e) {}
  const videos = Array.from(document.querySelectorAll('a[href*="/video/"], a[href*="/reel/"]')).map((a) => a.href).filter((h, i, all) => all.indexOf(h) === i).slice(0, 5);
  return JSON.stringify({ play, title: title || document.title, videos });
})()`.replace(/\n\s*/g, " ");

function ytdlp() {
  const uv = [run("/usr/bin/which", ["uvx"]), path.join(os.homedir(), ".local", "bin", "uvx"), "/opt/homebrew/bin/uvx"].find((p) => p && fs.existsSync(p));
  const direct = [process.env.CDH_YTDLP, run("/usr/bin/which", ["yt-dlp"]), "/opt/homebrew/bin/yt-dlp", path.join(os.homedir(), ".local", "bin", "yt-dlp")].find((p) => p && fs.existsSync(p));
  return direct ? [direct] : uv ? [uv, "yt-dlp"] : null;
}

async function soundFromVideo(url, out) {
  const tool = ytdlp();
  if (!tool) return { error: "yt-dlp isn't on this Mac. Install it once in Terminal: curl -LsSf https://astral.sh/uv/install.sh | sh (then it runs through uvx)" };
  const base = out.replace(/\.[a-z0-9]+$/i, "");
  // Instagram needs you signed in, so it uses Chrome's login; TikTok usually doesn't.
  const tries = /instagram\.com/i.test(url) ? [["--cookies-from-browser", "chrome"]] : [[], ["--cookies-from-browser", "chrome"]];
  let why = "";
  for (const extra of tries) {
    const [bin, ...pre] = tool;
    const r = await runAsync(bin, [...pre, "-x", "--audio-format", "m4a", "--no-playlist", "-o", `${base}.%(ext)s`, ...extra, url], 300_000);
    if (!r.err && fs.existsSync(`${base}.m4a`)) return { file: `${base}.m4a`, from: url };
    why = (r.stderr || r.err?.message || "").trim().split("\n").pop() ?? "";
  }
  return { error: `couldn't get the audio from ${url}${why ? ` (${why.slice(0, 200)})` : ""}` };
}

async function grabSound(url, out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const soundPage = /tiktok\.com\/music\/|instagram\.com\/(reels\/)?audio\//i.test(url);
  if (!soundPage) return soundFromVideo(url, out);
  const { err, stdout, stderr } = process.env.CDH_SOUND_PAGE_CMD
    ? await runAsync("/bin/sh", ["-c", process.env.CDH_SOUND_PAGE_CMD, "sh", url], 120_000)
    : await runAsync("osascript", [...readScript(SOUND_JS).flatMap((l) => ["-e", l]), url], 120_000);
  if (err) return { error: `${BROWSER} couldn't open the sound page (${String(stderr || err.message).trim().split("\n").pop()?.slice(0, 200)})` };
  let page;
  try {
    page = JSON.parse(stdout.trim());
  } catch {
    return { error: "the sound page came back empty" };
  }
  // TikTok: the sound's own audio file.
  if (page.play) {
    try {
      const res = await fetch(page.play, { headers: { referer: "https://www.tiktok.com/", "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36" } });
      if (res.ok) {
        const file = out.replace(/\.[a-z0-9]+$/i, "") + ".mp3";
        fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
        if (fs.statSync(file).size > 10_000) return { file, title: page.title, from: url };
      }
    } catch {}
  }
  // Else a video that uses it.
  for (const v of page.videos ?? []) {
    const got = await soundFromVideo(v, out);
    if (got.file) return { ...got, title: page.title, via: v };
  }
  return { error: `couldn't get "${page.title || "that sound"}" from its page or a video using it - paste a link to a TikTok that uses it` };
}

const readsSeen = new Set();
async function handleReads(reads) {
  for (const r of reads ?? []) {
    if (readsSeen.has(r.id)) continue;
    readsSeen.add(r.id);
    const { ok } = await api("POST", "/api/hub/helper/reads", { id: r.id, claim: true }).catch(() => ({ ok: false }));
    if (!ok) continue;
    log(`Reading ${r.url} in ${BROWSER} for a shoot sheet…`);
    const result = await readPage(r.url);
    if (result.error) log("Couldn't read it:", result.error);
    await api("POST", "/api/hub/helper/reads", { id: r.id, ...result }).catch((e) => log("Couldn't send the page back:", e.message));
  }
}

const photosDenied = (text) => /not allowed|-1743|not authori[sz]ed/i.test(text);
const DENIED = "your Mac didn't let the helper use Photos (System Settings → Privacy & Security → Automation)";

async function searchPhotos(term, dir, max = 5) {
  fs.mkdirSync(dir, { recursive: true });
  // Already exported for this card (an edit run again): use those.
  const done = filesIn(dir);
  if (done.length) return { files: done, error: "" };

  const find = await runAsync("osascript", [...PHOTOS_FIND.flatMap((l) => ["-e", l]), term, String(max)], 300_000);
  if (find.err) return { files: [], error: photosDenied(find.stderr) ? DENIED : (find.stderr || find.err.message).trim().split("\n").pop() };
  const ids = find.stdout.split("\n").map((l) => l.split("\t")[0].trim()).filter(Boolean);
  if (!ids.length) return { files: [], error: "" };

  // osxphotos wants the id without Photos' "/L0/001" ending.
  const bin = osxphotos();
  let why = "";
  if (bin) {
    const out = await runAsync(bin, ["export", dir, "--download-missing", "--use-photokit", ...ids.flatMap((id) => ["--uuid", id.split("/")[0]])], 900_000);
    if (filesIn(dir).length) return { files: filesIn(dir), error: "" };
    why = `osxphotos couldn't export them: ${(out.stderr || out.stdout || out.err?.message || "").trim().split("\n").pop()}`;
  }
  const out = await runAsync("osascript", [...PHOTOS_EXPORT.flatMap((l) => ["-e", l]), dir, ...ids], 900_000);
  // Photos can finish writing a moment after it says it's done.
  for (let i = 0; i < 15 && !filesIn(dir).length; i++) await sleep(2000);
  if (filesIn(dir).length) return { files: filesIn(dir), error: "" };
  if (out.err && photosDenied(out.stderr)) return { files: [], error: DENIED };
  return {
    files: [],
    error: why || `Photos found ${ids.length} for "${term}" but didn't export them - they're probably kept in iCloud. Install osxphotos so the helper can download them (Creator Desk → Studio → Mac helper shows how).`,
  };
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "clip";

// For a card that finds its own clips: search Photos and the drives for each term, tell the card
// what was found, and return the part of the prompt that lists it.
async function gatherBroll(edit, terms) {
  const dir = path.join(BROLL, `${slug(edit.title)}-${edit.id.slice(0, 6)}`);
  await update(edit.id, { events: [{ kind: "status", text: `Looking for ${terms.join(", ")} in Apple Photos and on your drives…` }] });
  // Searching can take minutes (big drives, Photos downloading from iCloud): keep telling Creator Desk this Mac is here.
  const alive = setInterval(() => api("POST", "/api/hub/helper/report", { info: info() }).catch(() => {}), 20_000);
  try {
    return await gather(edit, terms, dir);
  } finally {
    clearInterval(alive);
  }
}

async function gather(edit, terms, dir) {
  const index = await libraryIndex();
  const lines = [];
  const found = [];
  const problems = new Set();
  for (const term of terms) {
    const photos = await searchPhotos(term, path.join(dir, slug(term)));
    if (photos.error) problems.add(photos.error);
    const drives = searchDrives(index, term);
    const all = [...photos.files, ...drives];
    lines.push(`- "${term}": ${all.length ? all.map((f) => `${f}${duration(f) ? ` (${mmss(duration(f))})` : ""}`).join("; ") : "nothing found"}`);
    found.push(...all);
  }
  const unique = [...new Set(found)];
  const fromPhotos = unique.filter((f) => f.startsWith(dir)).length;
  await update(edit.id, {
    events: [
      { kind: "status", text: `Found ${fromPhotos} in Apple Photos and ${unique.length - fromPhotos} on your drives.${problems.size ? ` (${[...problems].join("; ")})` : ""}` },
    ],
  });
  if (unique.length) await update(edit.id, { pickDone: true, picked: unique.slice(0, 40).map((f) => ({ path: f, name: path.basename(f), duration: duration(f) })) });
  return [
    "B-roll I found for you (Apple Photos exports are in " + dir + "; the rest are on my drives):",
    ...lines,
    "",
    "Look at a frame or two of each before choosing (ffmpeg -ss 1 -i FILE -frames:v 1 frame.jpg, then read the image) and use only what fits the shots; skip anything blurry, shaky or with people who aren't me unless the card wants them.",
    `If something's missing, look again: search Photos (osascript: tell application "Photos" to search for "WORDS" gives each item's id; then ${osxphotos() ? `${osxphotos()} export FOLDER --download-missing --use-photokit --uuid ID (the id before "/L0/001")` : 'export them with "export ... with using originals" - most of my originals are in iCloud, so check the files actually arrived'}), or search the list of every video on my drives in ${LIBRARY_LIST} (one path per line). Say what you used.`,
  ].join("\n");
}

// ------------------------------------------------------------ picking clips with the Mac file picker

// The videos, images and audio in a folder (and the folders inside it), by name - the order you filmed them in.
function mediaIn(dir) {
  const out = [];
  const walk = (d, depth) => {
    let entries = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory() && depth < 1) walk(p, depth + 1);
      else if (mediaKind(e.name)) out.push(p);
    }
  };
  walk(dir, 0);
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

// The Mac's own picker: "folder" (a folder of clips), "files" (several videos, images or audio files) or "video" (just one video).
function pickerScript(prompt, mode) {
  const p = prompt.replace(/"/g, "'");
  if (mode === "folder") return ['tell application "Finder"', "activate", `set picked to choose folder with prompt "${p}"`, "end tell", "return POSIX path of picked"];
  if (mode === "video") return ['tell application "Finder"', "activate", `set picked to choose file with prompt "${p}" of type {"public.movie"}`, "end tell", "return POSIX path of picked"];
  return [
    'tell application "Finder"',
    "activate",
    `set picked to choose file with prompt "${p}" of type {"public.movie", "public.image", "public.audio"} with multiple selections allowed`,
    "end tell",
    'set out to ""',
    "repeat with f in picked",
    "set out to out & POSIX path of f & linefeed",
    "end repeat",
    "return out",
  ];
}

function pickFiles(label, mode) {
  const folder = mode === "folder";
  if (process.env.CDH_PICK_CMD) {
    const lines = run("/bin/sh", ["-c", process.env.CDH_PICK_CMD], { timeout: 600_000, env: { ...process.env, CDH_PICK_MODE: folder ? "folder" : "files" } }).split("\n").filter(Boolean);
    return folder ? lines.flatMap(mediaIn) : lines;
  }
  const prompt = `${folder ? "Pick the folder with the files" : "Pick the videos, images and audio"} for ${label || "this video"}`;
  const lines = run("osascript", pickerScript(prompt, folder ? "folder" : "files").flatMap((l) => ["-e", l]), { timeout: 600_000 }).split("\n").filter(Boolean);
  return folder ? lines.flatMap(mediaIn) : lines;
}

// One video, without holding everything else up while the picker is open. Cancelled: nothing.
async function pickVideo(prompt) {
  const { err, stdout } = process.env.CDH_PICK_CMD
    ? await runAsync("/bin/sh", ["-c", process.env.CDH_PICK_CMD], 600_000, { ...process.env, CDH_PICK_MODE: "video" })
    : await runAsync("osascript", pickerScript(prompt, "video").flatMap((l) => ["-e", l]), 600_000);
  if (err) return "";
  return stdout.split("\n").map((l) => l.trim()).find(Boolean) || "";
}

async function handlePick(p) {
  log(`Opening the ${p.mode === "folder" ? "folder" : "file"} picker for ${p.label || "a video"}…`);
  const paths = pickFiles(p.label, p.mode);
  const picked = paths.map((f) => ({ path: f, name: path.basename(f), duration: duration(f) }));
  await update(p.id, { pickDone: true, picked });
  log(picked.length ? `Picked ${picked.length} file(s).` : "Nothing picked.");
}

// ------------------------------------------------------------ edit styles: your editing setup and key frames

// Creator Desk keeps your edit styles (personal brand, tech UGC, brand deals…) so every Mac edits the same way.
// "Read my Mac's editing setup" sends it the text of how Claude Code is set up to edit here (read only - nothing
// on the Mac changes); "Add key frames" sends a few stills from a finished video you pick, so it can see the look.
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
const SCAN = { files: 60, chars: 20_000, total: 400_000, bytes: 200_000, extraBytes: 50_000 };
// Files about editing come first; ones that never mention it only fill any room left.
const ABOUT_EDITING = /capcut|edit|caption|font|b-?roll|video/i;
const STYLE_FILE = /style|brand|edit|note|caption|font|template/i;

const expandHome = (p) => (p === "~" ? os.homedir() : p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p);
const tilde = (p) => (p === os.homedir() || p.startsWith(os.homedir() + path.sep) ? "~" + p.slice(os.homedir().length) : p);
async function isDir(p) {
  try {
    return (await fs.promises.stat(p)).isDirectory();
  } catch {
    return false;
  }
}
async function entries(dir) {
  try {
    return await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

// A text file's contents, or null when it's missing, too big or not text.
async function readText(p, maxBytes = SCAN.bytes) {
  try {
    const st = await fs.promises.stat(p);
    if (!st.isFile() || st.size > maxBytes) return null;
    const buf = await fs.promises.readFile(p);
    if (buf.subarray(0, 8000).includes(0)) return null;
    return buf.toString("utf8");
  } catch {
    return null;
  }
}

// .md (and .txt) files in a folder and the folders inside it, two levels down, skipping CapCut, node_modules and hidden folders.
async function textFilesIn(dir, maxDepth, test = () => true) {
  const out = [];
  const walk = async (d, depth) => {
    for (const e of await entries(d)) {
      if (e.name.startsWith(".") || out.length >= 200) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (depth < maxDepth && !SKIP_DIR.test(e.name)) await walk(p, depth + 1);
      } else if (e.isFile() && /\.(md|txt)$/i.test(e.name) && test(e.name)) out.push(p);
    }
  };
  await walk(dir, 0);
  return out;
}

// Claude Code keeps a folder's memory in ~/.claude/projects/<its path, with everything but letters and numbers
// turned into "-">/memory (paths over 200 characters are cut short and given a hash). In a git repo it's the
// repo's top folder that counts, so both are looked for.
async function memoryDirs(folder) {
  const roots = [folder];
  for (let d = folder; d !== path.dirname(d); d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, ".git"))) {
      if (d !== folder) roots.push(d);
      break;
    }
  }
  const projects = path.join(CLAUDE_DIR, "projects");
  const names = (await entries(projects)).filter((e) => e.isDirectory()).map((e) => e.name);
  const dirs = [];
  for (const r of roots) {
    const key = r.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
    for (const n of names) {
      const low = n.toLowerCase();
      if (low === key || (key.length > 200 && low.startsWith(key.slice(0, 200) + "-"))) dirs.push(path.join(projects, n, "memory"));
    }
  }
  return dirs;
}

// Which skills are about editing: ones whose name, description or first 4 KB mention CapCut, video, captions,
// B-roll, shortform and so on (as whole words, give or take an "s" or "ing"). "Edit" and "hook" are everyday
// words too (editing a PDF or marketing copy, git hooks), so they only count in a skill's name or description,
// and not when that's about copy, documents or code. Creator Desk can pick skills itself by folder name.
const EDITING_WORDS = /(?<![a-z0-9])(capcut|video|caption|subtitle|b-?roll|footage|short-?form|ugc|reel|tiktok|ffmpeg)(s|es|ed|er|ers|ing)?(?![a-z0-9])/i;
const EDIT_WORDS = /(?<![a-z0-9])(edit|hook)(s|ed|er|ers|ing|or|ors)?(?![a-z0-9])/i;
const NOT_VIDEO = /(?<![a-z0-9])(copy|copywriting|documents?|docs|docx|pdfs?|spreadsheets?|xlsx|pptx|presentations?|slides|code|codebase|emails?|landing pages?)(?![a-z0-9])/i;

// A SKILL.md's name and description (from the --- block at its top).
function frontmatter(text) {
  const out = {};
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return out;
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = /^(name|description):\s*(.*)$/.exec(lines[i]);
    if (!kv) continue;
    let v = kv[2].trim();
    if (!v || /^[>|][-+]?$/.test(v)) {
      const more = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) more.push(lines[++i].trim());
      v = more.join(" ");
    }
    out[kv[1]] = v.replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

// Creator Desk's own choice of skills (folder names): include wins over the guess, exclude over both.
const listOf = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : []);
const pickOf = (skills) => ({ include: listOf(skills?.include), exclude: listOf(skills?.exclude) });
const picked = (s, pick) => (pick.exclude.includes(s.name) ? false : pick.include.includes(s.name) ? true : s.editing);

// The skills in a skills folder: { name (its folder), dir, description, editing }. Folders without a SKILL.md aren't skills.
async function skillFolders(dir) {
  const out = [];
  for (const e of await entries(dir)) {
    const skill = path.join(dir, e.name);
    if (e.name.startsWith(".") || !(await isDir(skill))) continue;
    let head;
    try {
      const fh = await fs.promises.open(path.join(skill, "SKILL.md"), "r");
      try {
        const buf = Buffer.alloc(16_384);
        const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
        head = buf.subarray(0, bytesRead).toString("utf8");
      } finally {
        await fh.close();
      }
    } catch {
      continue;
    }
    const fm = frontmatter(head);
    const about = [e.name, fm.name, fm.description].filter(Boolean).join("\n");
    const editing = EDITING_WORDS.test(about) || EDITING_WORDS.test(head.slice(0, 4096)) || (EDIT_WORDS.test(about) && !NOT_VIDEO.test(about));
    out.push({ name: e.name, dir: skill, description: String(fm.description || "").slice(0, 500), editing });
  }
  return out;
}

// A skills folder, for the edit styles: each editing skill's SKILL.md, plus the smaller .md files that come with it.
async function skillsIn(dir, add, pick) {
  for (const s of await skillFolders(dir)) {
    if (!picked(s, pick)) continue;
    const main = path.join(s.dir, "SKILL.md");
    const text = await readText(main);
    if (text == null) continue;
    await add(main, 2, text);
    for (const extra of await textFilesIn(s.dir, 2, (n) => n !== "SKILL.md" && /\.md$/i.test(n))) {
      const more = await readText(extra, SCAN.extraBytes);
      if (more != null) await add(extra, 2, more);
    }
  }
}

// Everything that says how you edit, best first: CLAUDE.md files (always), Claude Code's memory for your edit
// folders, then your editing skills and notes about editing, then other notes if there's room. Read only.
async function collectSetup(folders, pick = pickOf()) {
  const found = [];
  const seen = new Set();
  // tier: 0 CLAUDE.md, 1 memory, 2 about editing, 3 the rest.
  const add = async (p, tier, text) => {
    let real;
    try {
      real = await fs.promises.realpath(p);
    } catch {
      return;
    }
    if (seen.has(real)) return;
    if (text === undefined) text = await readText(real);
    if (text == null || !text.trim()) return;
    seen.add(real);
    found.push({ path: tilde(p), text, tier });
  };

  await add(path.join(CLAUDE_DIR, "CLAUDE.md"), 0);
  const dirs = [];
  for (const f of [cfg.workdir, ...folders].filter((f) => typeof f === "string" && f.trim()).slice(0, 50)) {
    const full = path.resolve(expandHome(f.trim()));
    if (!dirs.includes(full) && (await isDir(full))) dirs.push(full);
  }
  for (const dir of dirs) {
    // Claude Code reads the CLAUDE.md files in the folders above too (up to your home folder).
    const home = os.homedir();
    if (dir.startsWith(home + path.sep)) for (let d = path.dirname(dir); d.startsWith(home); d = path.dirname(d)) await add(path.join(d, "CLAUDE.md"), 0);
    for (const n of ["CLAUDE.md", "CLAUDE.local.md", path.join(".claude", "CLAUDE.md")]) await add(path.join(dir, n), 0);
    for (const mem of await memoryDirs(dir)) for (const m of await textFilesIn(mem, 1, (n) => /\.md$/i.test(n))) await add(m, 1);
    await skillsIn(path.join(dir, ".claude", "skills"), add, pick);
    // Notes in the folder itself - not when it's your whole home folder.
    if (dir === home || dir === path.parse(dir).root) continue;
    for (const p of await textFilesIn(dir, 2, (n) => STYLE_FILE.test(n) && !/^CLAUDE(\.local)?\.md$/i.test(n))) {
      const text = await readText(p);
      if (text != null) await add(p, ABOUT_EDITING.test(path.basename(p) + "\n" + text) ? 2 : 3, text);
    }
  }
  await skillsIn(path.join(CLAUDE_DIR, "skills"), add, pick);

  // Best first, then within Creator Desk's limits (long files are cut short).
  const files = [];
  let total = 0;
  for (const f of found.sort((a, b) => a.tier - b.tier)) {
    if (files.length >= SCAN.files) break;
    const room = Math.min(SCAN.chars, SCAN.total - total);
    if (room < 500) break;
    const text = f.text.length > room ? f.text.slice(0, room - 20) + "\n[... cut short]" : f.text;
    files.push({ path: f.path, text });
    total += text.length;
  }
  return files;
}

// Creator Desk can be busy for a moment: try a couple more times before giving up.
async function send(route, body, method = "POST") {
  for (let i = 0; ; i++) {
    try {
      return await api(method, route, body);
    } catch (e) {
      if (i >= 2) throw e;
      await sleep(3000);
    }
  }
}

const scansSeen = new Set();
async function handleStyleScan(scan) {
  if (!scan?.id || scansSeen.has(scan.id)) return;
  scansSeen.add(scan.id);
  log("Reading your editing setup (CLAUDE.md files, editing skills and Claude Code memory) for your edit styles…");
  let body;
  try {
    const files = await collectSetup(Array.isArray(scan.folders) ? scan.folders : [], pickOf(scan.skills));
    body = { requestId: scan.id, files };
    log(`Sending Creator Desk ${files.length} file(s) about how you edit.`);
  } catch (e) {
    body = { requestId: scan.id, error: `The helper couldn't read your editing setup: ${e.message}` };
    log("Couldn't read your editing setup:", e.message);
  }
  await send("/api/hub/helper/styles/scan", body).catch((e) => log("Couldn't send your editing setup to Creator Desk:", e.message));
}

const FRAMES = 6;
// Each still at most ~88KB, so it's under ~120KB once it's sent as text.
const FRAME_BYTES = 88_000;

// Stills spread through the video (skipping the first and last 5%), 540px wide; squeezed harder if one's too big.
async function keyFrames(file, dir) {
  const bin = ffmpeg();
  if (!bin || !ffprobe()) throw new Error("ffmpeg isn't on this Mac. Install it once in Terminal: brew install ffmpeg");
  const len = duration(file);
  if (!len) throw new Error(`Couldn't read ${path.basename(file)} - is it a video?`);
  const frames = [];
  for (let i = 0; i < FRAMES; i++) {
    const at = Math.round(len * (0.05 + (0.9 * i) / (FRAMES - 1)) * 10) / 10;
    const out = path.join(dir, `frame-${i + 1}.jpg`);
    for (const q of [5, 8, 12, 18, 25, 31]) {
      fs.rmSync(out, { force: true });
      await runAsync(bin, ["-v", "error", "-y", "-ss", String(at), "-i", file, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", String(q), out], 60_000);
      const size = fs.existsSync(out) ? fs.statSync(out).size : 0;
      if (!size) break; // no frame there (right at the end of a clip): skip it
      if (size <= FRAME_BYTES) {
        frames.push({ data: "data:image/jpeg;base64," + fs.readFileSync(out).toString("base64"), at, source: tilde(file) });
        break;
      }
    }
  }
  return frames;
}

const grabsSeen = new Set();
let grabQueue = Promise.resolve(); // one picker at a time
function queueFrameGrab(g) {
  if (!g?.id || grabsSeen.has(g.id)) return;
  grabsSeen.add(g.id);
  grabQueue = grabQueue.then(() => handleFrameGrab(g)).catch((e) => log("Couldn't take key frames:", e.message));
}

async function handleFrameGrab(g) {
  const name = String(g.styleName || g.name || "").trim();
  log(`Opening the file picker for key frames${name ? ` for ${name}` : ""}…`);
  const file = await pickVideo(`Pick a finished video for your ${name ? `${name} ` : "edit style's "}key frames`);
  let result;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cdh-frames-"));
  try {
    if (!file) result = { error: "No video picked." };
    else {
      const frames = await keyFrames(file, dir);
      result = frames.length ? { frames } : { error: `Couldn't take any frames from ${path.basename(file)}.` };
    }
  } catch (e) {
    result = { error: e.message };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  log(result.frames ? `Sending ${result.frames.length} key frames from ${path.basename(file)}.` : `No key frames: ${result.error}`);
  await send("/api/hub/helper/styles/frames", { requestId: g.id, styleId: g.styleId, ...result }).catch((e) => log("Couldn't send the key frames to Creator Desk:", e.message));
}

// ------------------------------------------------------------ syncing your editing setup between your Macs

// "Sync my editing setup" copies your editing files word for word from one Mac to the other through Creator Desk:
// ~/.claude/CLAUDE.md, your editing skills (every file in them), and for each edit folder its CLAUDE.md files, its
// own editing skills and Claude Code's memory for it. Paths are sent with your home folder as "~", and memory as
// "memory:<the edit folder>/<file>", so they land in the right place on a Mac with a different user name.
// The Mac that gets them only ever writes those kinds of files, keeps a copy of anything it replaces in
// ~/.creator-desk/backups, and never deletes anything.
const SETUP = { maxBytes: 2_000_000, batchBytes: 3_000_000, depth: 6, files: 5_000, folders: 50 };
const SKIP_SYNC_DIR = /^(\.git|node_modules|__pycache__|\.venv|venv|dist|build)$/;
const SECRET_FILE = /^\.env(\..+)?$/;
const BACKUPS = path.join(HOME, "backups");

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const inside = (p, root) => p === root || p.startsWith(root.endsWith(path.sep) ? root : root + path.sep);
const underHome = (p) => p.startsWith(os.homedir() + path.sep);
const mb = (n) => `${(n / 1_000_000).toFixed(1)} MB`;
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
function isText(buf) {
  if (buf.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}
// A file's contents to send: as text when it's text (and that's no bigger), else base64.
function contentOf(buf) {
  const b64 = buf.toString("base64");
  if (isText(buf)) {
    const text = buf.toString("utf8");
    if (Buffer.byteLength(JSON.stringify(text)) <= b64.length + 2) return { text };
  }
  return { base64: b64 };
}
// The real path of p, following links, even when its last parts don't exist yet.
async function realish(p) {
  const rest = [];
  for (let cur = p; ; cur = path.dirname(cur)) {
    try {
      return path.join(await fs.promises.realpath(cur), ...rest.reverse());
    } catch {
      if (cur === path.dirname(cur)) return p;
      rest.push(path.basename(cur));
    }
  }
}

// Your edit folders on this Mac: the usual one and the ones Creator Desk names, when they're in your home folder.
function editFolders(list, skipped) {
  const out = [];
  [cfg.workdir, ...listOf(list)].slice(0, SETUP.folders).forEach((f, i) => {
    if (typeof f !== "string" || !f.trim()) return;
    const full = path.resolve(expandHome(f.trim()));
    if (!underHome(full)) {
      if (i > 0 && skipped) skipped.push({ path: f, why: "it isn't in your home folder" });
      return;
    }
    if (!out.includes(full)) out.push(full);
  });
  return out;
}

// Where Claude Code keeps a folder's memory on this Mac: the folder's own (or its git repo's) projects/<key>/memory,
// the one that's there already if Claude Code has been used there, else a new one. Null when its path is so long
// that Claude Code shortens it with a hash (then it can only use one that's there already).
async function memoryDirFor(folder) {
  let root = folder;
  for (let d = folder; d !== path.dirname(d); d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, ".git"))) {
      root = d;
      break;
    }
  }
  const projects = path.join(CLAUDE_DIR, "projects");
  const names = (await entries(projects)).filter((e) => e.isDirectory()).map((e) => e.name);
  for (const r of root === folder ? [root] : [root, folder]) {
    const key = r.replace(/[^a-zA-Z0-9]/g, "-");
    const hit = names.find((n) => n.toLowerCase() === key.toLowerCase()) ?? (key.length > 200 ? names.find((n) => n.toLowerCase().startsWith(key.slice(0, 200).toLowerCase() + "-")) : undefined);
    if (hit) return path.join(projects, hit, "memory");
  }
  const key = root.replace(/[^a-zA-Z0-9]/g, "-");
  return key.length > 200 ? null : path.join(projects, key, "memory");
}

// Everything to sync from this Mac, with each file's fingerprint (sha256), size, date and whether it's a script you can run.
async function collectSync(folderList, pick) {
  const home = os.homedir();
  const realHome = await realish(home);
  const realClaude = await realish(CLAUDE_DIR);
  const files = [];
  const skipped = [];
  const skippedSkills = [];
  const seen = new Set(); // real paths: a file reached two ways is sent once
  const logicals = new Set();

  // A file, or a folder and everything in it (down to SETUP.depth). Links are followed when they stay in your home folder.
  const visit = async (p, logical, depth = 0, fileOnly = false) => {
    let st;
    try {
      st = await fs.promises.lstat(p);
    } catch {
      return;
    }
    let real = p;
    if (st.isSymbolicLink()) {
      try {
        real = await fs.promises.realpath(p);
        st = await fs.promises.stat(p);
      } catch {
        return; // a broken link
      }
      if (!inside(real, realHome) && !inside(real, realClaude)) {
        skipped.push({ path: logical, why: "it's a link to somewhere outside your home folder" });
        return;
      }
    } else real = await realish(p);
    const name = path.basename(p);
    if (st.isDirectory()) {
      if (fileOnly || depth >= SETUP.depth || (depth > 0 && SKIP_SYNC_DIR.test(name)) || seen.has(real)) return;
      seen.add(real);
      for (const e of (await entries(p)).sort((a, b) => a.name.localeCompare(b.name))) await visit(path.join(p, e.name), `${logical}/${e.name}`, depth + 1);
      return;
    }
    if (!st.isFile() || name === ".DS_Store" || seen.has(real) || logicals.has(logical)) return;
    seen.add(real);
    if (SECRET_FILE.test(name)) return skipped.push({ path: logical, why: "it might hold passwords or keys" });
    if (st.size > SETUP.maxBytes) return skipped.push({ path: logical, why: `it's ${mb(st.size)} - files over 2 MB aren't synced` });
    if (files.length >= SETUP.files) return skipped.push({ path: logical, why: `more than ${SETUP.files} files` });
    let buf;
    try {
      buf = await fs.promises.readFile(p);
    } catch (e) {
      return skipped.push({ path: logical, why: `couldn't read it (${e.code || e.message})` });
    }
    logicals.add(logical);
    files.push({ path: logical, real: p, sha: sha256(buf), size: buf.length, mtime: st.mtime.toISOString(), exec: Boolean(st.mode & 0o100) });
  };
  // The editing skills in a skills folder; the others are listed so Creator Desk can offer them.
  const skills = async (dir, logical) => {
    for (const s of await skillFolders(dir)) {
      if (picked(s, pick)) await visit(s.dir, `${logical}/${s.name}`);
      else if (!skippedSkills.some((x) => x.name === s.name)) skippedSkills.push({ name: s.name, description: s.description });
    }
  };

  await visit(path.join(CLAUDE_DIR, "CLAUDE.md"), "~/.claude/CLAUDE.md", 0, true);
  await skills(path.join(CLAUDE_DIR, "skills"), "~/.claude/skills");
  for (const dir of editFolders(folderList, skipped)) {
    if (!(await isDir(dir))) continue;
    const t = tilde(dir);
    for (const n of ["CLAUDE.md", "CLAUDE.local.md", ".claude/CLAUDE.md"]) await visit(path.join(dir, n), `${t}/${n}`, 0, true);
    await skills(path.join(dir, ".claude", "skills"), `${t}/.claude/skills`);
    // The git repo's memory first: that's the one Claude Code uses in a repo.
    for (const mem of (await memoryDirs(dir)).reverse()) await visit(mem, `memory:${t}`);
  }
  return { files, skipped, skippedSkills };
}

async function syncUpload(job) {
  log("Syncing your editing setup: reading your CLAUDE.md files, editing skills and Claude Code memory…");
  const { files, skipped, skippedSkills } = await collectSync(job.folders, pickOf(job.skills));
  const { want } = await send("/api/hub/helper/setup/manifest", {
    requestId: job.id,
    files: files.map(({ path, sha, size, mtime, exec }) => ({ path, sha, size, mtime, exec })),
    skippedSkills,
  });
  const wanted = new Set(listOf(want));
  let batch = [];
  let bytes = 0;
  let sent = 0;
  const flush = async () => {
    if (!batch.length) return;
    await send("/api/hub/helper/setup/files", { requestId: job.id, files: batch });
    sent += batch.length;
    batch = [];
    bytes = 0;
  };
  for (const f of files) {
    if (!wanted.has(f.path)) continue;
    let buf;
    try {
      buf = await fs.promises.readFile(f.real);
    } catch {
      skipped.push({ path: f.path, why: "it went missing while syncing" });
      continue;
    }
    if (sha256(buf) !== f.sha) {
      skipped.push({ path: f.path, why: "it changed while syncing - sync again" });
      continue;
    }
    const entry = { path: f.path, sha: f.sha, size: f.size, mtime: f.mtime, exec: f.exec, ...contentOf(buf) };
    const n = Buffer.byteLength(JSON.stringify(entry));
    if (batch.length && bytes + n > SETUP.batchBytes) await flush();
    batch.push(entry);
    bytes += n;
  }
  await flush();
  await send("/api/hub/helper/setup/done", { requestId: job.id, phase: "upload", sent, skipped });
  const same = files.filter((f) => !wanted.has(f.path)).length;
  log(`Syncing your editing setup: sent ${plural(sent, "file")}${same > 0 ? ` (${same} Creator Desk already had)` : ""}${skipped.length ? `, skipped ${skipped.length}` : ""}.`);
}

// Where a synced file goes on this Mac, or why it can't: only ~/.claude/CLAUDE.md, ~/.claude/skills/**, Claude Code's
// memory folders, and in your edit folders CLAUDE.md, CLAUDE.local.md, .claude/CLAUDE.md and .claude/skills/**.
// Checked again after following any links, so a link can't send a file somewhere else.
async function targetFor(logical, folders) {
  const no = (why) => ({ error: why });
  if (typeof logical !== "string" || !logical || logical.length > 1000 || /[\0\\]/.test(logical)) return no("that path isn't allowed");
  const mem = logical.startsWith("memory:");
  const p = mem ? logical.slice("memory:".length) : logical;
  if (!p.startsWith("~/")) return no("only files in your home folder are synced");
  const parts = p.slice(2).split("/");
  if (parts.some((s) => s === "" || s === "." || s === "..")) return no('that path isn\'t allowed (it has ".." or empty parts)');
  const home = os.homedir();
  let root;
  let file;
  if (mem) {
    // The edit folder is the longest of yours the path starts with; else everything before the file name.
    const rel = parts.join("/");
    const known = folders.map((f) => path.relative(home, f).split(path.sep).join("/")).filter((k) => rel.startsWith(k + "/")).sort((a, b) => b.length - a.length)[0];
    const folderRel = known ?? parts.slice(0, -1).join("/");
    if (!folderRel) return no("it isn't Claude Code memory for a folder in your home folder");
    const dir = await memoryDirFor(path.join(home, ...folderRel.split("/")));
    if (!dir) return no("Claude Code hasn't been used in that folder on this Mac yet - open it there once, then sync again");
    root = dir;
    file = path.join(dir, ...rel.slice(folderRel.length + 1).split("/"));
  } else if (parts[0] === ".claude") {
    if (parts.length === 2 && parts[1] === "CLAUDE.md") root = CLAUDE_DIR;
    else if (parts[1] === "skills" && parts.length >= 4) root = path.join(CLAUDE_DIR, "skills");
    else return no("only CLAUDE.md, skills and memory are synced in ~/.claude");
    file = path.join(CLAUDE_DIR, ...parts.slice(1));
  } else {
    const full = path.join(home, ...parts);
    for (const f of [...folders].sort((a, b) => b.length - a.length)) {
      const r = path.relative(f, full).split(path.sep);
      if (r[0] === ".." || path.isAbsolute(r[0])) continue;
      const rel = r.join("/");
      if (rel === "CLAUDE.md" || rel === "CLAUDE.local.md" || rel === ".claude/CLAUDE.md") root = f;
      else if (r[0] === ".claude" && r[1] === "skills" && r.length >= 4) root = path.join(f, ".claude", "skills");
      else continue;
      file = full;
      break;
    }
    if (!file) return no("it isn't a CLAUDE.md file or skill in one of your edit folders on this Mac");
  }
  const t = { file, root, backup: mem ? ["memory", ...parts] : parts };
  return (await stillSafe(t)) ? t : no("a link on this Mac points that path somewhere else");
}
// The file's real path must be exactly where it looks like it is inside its root (no link takes it elsewhere).
async function stillSafe(t) {
  const realRoot = await realish(t.root);
  const realFile = await realish(t.file);
  const want = path.relative(t.root, t.file);
  return Boolean(want) && !want.startsWith("..") && inside(realFile, realRoot) && path.relative(realRoot, realFile) === want;
}

// Replace (or add) one file: the old one is copied to the backup folder first, the new one written next to it and
// renamed into place, so it's never half-written.
async function writeSynced(t, buf, exec, mtime, backupDir) {
  await fs.promises.mkdir(path.dirname(t.file), { recursive: true });
  if (!(await stillSafe(t))) throw new Error("a link on this Mac points that path somewhere else");
  let mode = exec ? 0o755 : 0o644;
  let backedUp = false;
  let st = null;
  try {
    st = await fs.promises.stat(t.file);
  } catch {}
  if (st) {
    if (!st.isFile()) throw new Error("there's a folder with that name here");
    const m = st.mode & 0o777;
    mode = exec ? m | 0o100 | (m & 0o040 ? 0o010 : 0) | (m & 0o004 ? 0o001 : 0) : m & 0o666;
    const dest = path.join(backupDir, ...t.backup);
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.copyFile(t.file, dest);
    backedUp = true;
  }
  const tmp = path.join(path.dirname(t.file), `.${path.basename(t.file)}.cdh-${process.pid}-${Date.now()}`);
  try {
    await fs.promises.writeFile(tmp, buf, { flag: "wx", mode });
    await fs.promises.chmod(tmp, mode);
    const when = new Date(mtime);
    if (!Number.isNaN(when.getTime())) await fs.promises.utimes(tmp, when, when).catch(() => {});
    await fs.promises.rename(tmp, t.file);
  } catch (e) {
    await fs.promises.rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
  return backedUp;
}

async function syncDownload(job) {
  log("Syncing your editing setup: checking what your other Mac sent…");
  const manifest = await send(`/api/hub/helper/setup/manifest?requestId=${encodeURIComponent(job.id)}`, undefined, "GET");
  const folders = editFolders([...listOf(job.folders), ...listOf(manifest.folders)]);
  const skipped = [];
  const written = [];
  const backedUp = [];
  const stamp = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 19).replace("T", "_").replace(/:/g, "-");
  const backupDir = path.join(BACKUPS, stamp);
  const need = [];
  const seenPaths = new Set();
  for (const f of Array.isArray(manifest.files) ? manifest.files : []) {
    if (!f || typeof f.path !== "string" || seenPaths.has(f.path)) continue;
    seenPaths.add(f.path);
    if (!/^[0-9a-f]{64}$/.test(String(f.sha))) {
      skipped.push({ path: f.path, why: "it has no fingerprint (sha256)" });
      continue;
    }
    const t = await targetFor(f.path, folders);
    if (t.error) {
      skipped.push({ path: f.path, why: t.error });
      continue;
    }
    let st = null;
    try {
      st = await fs.promises.stat(t.file);
    } catch {}
    if (st && !st.isFile()) {
      skipped.push({ path: f.path, why: "there's a folder with that name here" });
      continue;
    }
    if (st && (f.size == null || st.size === Number(f.size)) && sha256(await fs.promises.readFile(t.file)) === f.sha) {
      // Already the same: just make sure it can run (or not) like on the other Mac.
      if (Boolean(st.mode & 0o100) !== Boolean(f.exec)) await fs.promises.chmod(t.file, f.exec ? (st.mode & 0o777) | 0o100 : st.mode & 0o666).catch(() => {});
      continue;
    }
    need.push({ f, t });
  }

  // Ask for what's missing or different, ~3 MB at a time; Creator Desk may send fewer, so ask again for the rest.
  const queue = [...need];
  while (queue.length) {
    const batch = [];
    let bytes = 0;
    while (queue.length && batch.length < 200 && (!batch.length || bytes + (Number(queue[0].f.size) || 0) <= SETUP.batchBytes)) {
      bytes += Number(queue[0].f.size) || 0;
      batch.push(queue.shift());
    }
    const res = await send("/api/hub/helper/setup/fetch", { requestId: job.id, paths: batch.map((x) => x.f.path) });
    const left = new Map(batch.map((x) => [x.f.path, x]));
    let got = 0;
    for (const g of Array.isArray(res.files) ? res.files : []) {
      const x = left.get(g?.path);
      if (!x) continue;
      left.delete(g.path);
      got++;
      const buf = typeof g.text === "string" ? Buffer.from(g.text, "utf8") : typeof g.base64 === "string" ? Buffer.from(g.base64, "base64") : null;
      if (!buf) {
        skipped.push({ path: x.f.path, why: "it came back empty" });
        continue;
      }
      if (sha256(buf) !== x.f.sha) {
        skipped.push({ path: x.f.path, why: "it didn't arrive intact (its fingerprint didn't match)" });
        continue;
      }
      try {
        if (await writeSynced(x.t, buf, Boolean(x.f.exec ?? g.exec), x.f.mtime, backupDir)) backedUp.push(x.f.path);
        written.push(x.f.path);
      } catch (e) {
        skipped.push({ path: x.f.path, why: `couldn't write it (${e.code || e.message})` });
      }
    }
    if (!got) for (const x of left.values()) skipped.push({ path: x.f.path, why: "Creator Desk didn't send it" });
    else queue.unshift(...left.values());
  }

  await send("/api/hub/helper/setup/done", { requestId: job.id, phase: "download", written, backedUp, backupDir: tilde(backupDir), skipped });
  log(
    written.length
      ? `Got ${plural(written.length, "file")} from your other Mac${backedUp.length ? ` (${backedUp.length} backed up first, in ${tilde(backupDir)})` : ""}${skipped.length ? `, skipped ${skipped.length}` : ""}.`
      : `Your editing setup already matches your other Mac${skipped.length ? ` (skipped ${skipped.length})` : ""}.`,
  );
}

const syncsSeen = new Set();
let syncQueue = Promise.resolve(); // one sync at a time
let syncing = 0; // syncs waiting or under way (an update or switch to the background waits for them)
function queueSetupSync(s) {
  if (!s?.id || (s.phase !== "upload" && s.phase !== "download")) return;
  const key = `${s.id}:${s.phase}`;
  if (syncsSeen.has(key)) return;
  syncsSeen.add(key);
  syncing++;
  syncQueue = syncQueue.then(async () => {
    try {
      await (s.phase === "upload" ? syncUpload(s) : syncDownload(s));
    } catch (e) {
      log("Couldn't sync your editing setup:", e.message);
      await send("/api/hub/helper/setup/done", { requestId: s.id, phase: s.phase, error: `The helper couldn't sync your editing setup: ${e.message}` }).catch((e2) => log("Couldn't tell Creator Desk:", e2.message));
    } finally {
      syncing--;
    }
  });
}

// ------------------------------------------------------------ editing with Claude Code

/** The files picked for an edit, one a line, saying which are images or audio. */
function fileLines(files) {
  const lines = files.map((f) => {
    const kind = mediaKind(f.name || f.path);
    const about = [kind === "image" || kind === "audio" ? kind : "", f.duration ? mmss(f.duration) : ""].filter(Boolean).join(", ");
    return `- ${f.path}${about ? ` (${about})` : ""}`;
  });
  const extras = new Set(files.map((f) => mediaKind(f.name || f.path)).filter((k) => k === "image" || k === "audio"));
  if (extras.has("image")) lines.push("Images go in as stills or overlays (a logo, product shot, screenshot) where the card says, or where they fit best.");
  if (extras.has("audio")) lines.push("Audio files are a voiceover or music for this edit: use them as the card says (a voiceover under or instead of the talking, music under everything at a level the talking sits clearly over). If it doesn't say, use your judgement and tell me what you did.");
  return lines.join("\n");
}

function promptFor(edit, broll = "") {
  const clips = fileLines(edit.files);
  if (edit.videoCode === "ALL") return wholeSheetPrompt(edit, clips);
  if (TRIAL_LINE.test(edit.brief)) return trialPrompt(edit, clips);
  const name = (edit.personal ? ["Personal", edit.videoCode || edit.title.slice(0, 40)] : [edit.brand, edit.videoCode]).filter(Boolean).join(" ") || edit.title.slice(0, 50) || "Creator Desk edit";
  return [
    `Edit this video in CapCut for me, the same way as when I paste a video card and the clip names into this chat.${whose(edit)}`,
    ...folderLines(edit),
    ...styleLines(edit),
    ...notesLines(edit),
    "",
    ...(broll ? [broll, ""] : []),
    ...(clips ? [broll ? "Clips I picked myself, on this Mac:" : "Clips, on this Mac:", clips, ""] : []),
    "Video card:",
    edit.brief,
    "",
    "For this run:",
    `- Make a new CapCut draft (never overwrite one) named "${name}", adding v2, v3 if that name is taken.`,
    "- If CapCut being open stops the draft saving, say so and stop. I'll close it and reply.",
    ...RESOURCEFUL,
    REMEMBER,
    "- If you need something from me, ask one clear question and stop.",
    "- Finish with a short summary of what you did and, on its own line, DRAFT: <the draft name>.",
  ].join("\n");
}

/** Whose video it is, so Claude uses the right style. */
function whose(edit) {
  const style = styleOf(edit);
  if (edit.personal) {
    return style
      ? " It's for my own personal brand, not a client: follow my edit style below, along with my editing skills and notes."
      : " It's for my own personal brand, not a client: use my editing skills and my personal-brand style and notes.";
  }
  if (!edit.brand) return style ? " Follow my edit style below, along with my editing skills." : "";
  return style
    ? ` It's for ${edit.brand}: follow my edit style below, along with my editing skills and the brand profile for ${edit.brand} if there is one.`
    : ` It's for ${edit.brand}: use my editing skills and the brand profile for ${edit.brand} if there is one.`;
}

/** The edit style Creator Desk says this video follows (personal brand, tech, brand deals…), tidied; null if none. */
function styleOf(edit) {
  const s = edit.style;
  if (!s || typeof s !== "object") return null;
  const name = String(s.name || "").trim();
  const summary = String(s.summary || "").trim();
  const rules = (Array.isArray(s.rules) ? s.rules : []).map((r) => String(r).trim()).filter(Boolean);
  return name || summary || rules.length ? { name: name || "my usual style", summary, rules } : null;
}

/** The edit style, kept in Creator Desk so every Mac edits the same way. Your CLAUDE.md and skills on this Mac still apply. */
function styleLines(edit) {
  const style = styleOf(edit);
  if (!style) return [];
  return [
    "",
    `My edit style for this video - ${style.name}${style.summary ? `: ${style.summary}` : ""}`,
    "(This is the saved copy of how I edit these, so every Mac edits them the same way. My CLAUDE.md files and skills on this Mac still apply alongside it.)",
    ...(style.rules.length ? ["Style rules:", ...style.rules.map((r) => `- ${r}`)] : []),
  ];
}

/** The job's own folder on this Mac, when it has one: Claude Code starts there, so its CLAUDE.md, notes and skills apply. */
function folderLines(edit) {
  return edit.cwdUsed ? [`You're working in ${edit.folder}, my folder for these edits: follow its CLAUDE.md, notes and skills for how I edit them.`] : [];
}

/** Your editing notes (feedback saved from earlier edits and the notes chat in Creator Desk). */
function notesLines(edit) {
  if (!edit.notes?.length) return [];
  const overStyle = styleOf(edit) ? ". They're more specific than my edit style, so where a note and the style clash, the note wins" : "";
  return ["", `My editing notes - follow these on every edit unless the card says otherwise (where two clash, the later one wins)${overStyle}:`, ...edit.notes.map((n) => `- ${n}`)];
}

// Lasting feedback gets saved to the editing notes, the way you'd tell Claude Code to remember something.
const REMEMBER =
  "- When I give you feedback on how you edit in general, not just a change to this one video (how captions should look, pacing, text style), apply it, then add a line `NOTE: <the rule, in one line>` so it's saved to my editing notes for this job, or `NOTE FOR ALL: <the rule>` if it's for all my edits. Only for lasting feedback.";

/** Where Claude Code starts for a job: its own folder if it's on this Mac, else the usual one. */
function whereFor(folder) {
  if (!folder) return { cwd: cfg.workdir, used: false, missing: "" };
  const full = folder.startsWith("~/") ? path.join(os.homedir(), folder.slice(2)) : folder;
  try {
    if (fs.statSync(full).isDirectory()) return { cwd: full, used: true, missing: "" };
  } catch {}
  return { cwd: cfg.workdir, used: false, missing: folder };
}

// Missing extras (B-roll, a screenshot, images): get or make them, as in a normal Claude Code chat, rather than stopping.
const RESOURCEFUL = [
  "- If the card needs something that isn't in the clips (B-roll, an app screenshot, images, a screen recording), get or make it yourself before asking, the way you would in a normal chat with me:",
  "  - look on this Mac: Apple Photos, Downloads, Desktop, Movies and any connected drives;",
  "  - download it from links on the card or in the brief (a Google Drive folder: `uvx gdown --folder <link> -O <folder>`; a direct image or video link: curl);",
  "  - make it: a screenshot or screen recording of a web page, App Store listing or the app's website (open it, then `screencapture`), a text or list graphic in CapCut, or a freeze-frame or cut-down from the main clip;",
  "  - only if none of that works, put a clearly labelled placeholder in the draft where it goes.",
  `- Sounds: if the card names or links a sound or song, get it: run \`node "${path.resolve(process.argv[1] || "creator-desk-helper.mjs")}" sound "<link>"\` with a TikTok sound page, a TikTok or Instagram video that uses it, or an Instagram audio page - it saves the audio and prints the file. Only a name? Search for it (WebSearch) to find a TikTok using it, then grab that. Or add it from my CapCut favourite sounds if it's there. If none of that works, build the rest and tell me exactly which sound to send a link for.`,
  "- Build the draft even if a few extras are missing, then list what you made or swapped in and what I still need to add. Only stop to ask if the main clip can't be found or doesn't match the card.",
];

// Trial versions of one reel: a draft per version, each changing only what its version says.
const TRIAL_LINE = /^TRIAL VERSIONS:/m;
const LIBRARY_LINE = /^LIBRARY SEARCH:[ \t]*(.+)$/m;

function trialPrompt(edit, clips) {
  const name = edit.title.replace(/ - trial versions$/, "").slice(0, 50) || "Trial";
  const fromDraft = /^CapCut draft to start from:[ \t]*(.+)$/m.exec(edit.brief)?.[1]?.trim();
  const out = path.join(TRIALS, slug(name));
  return [
    "Make trial versions of this reel in CapCut for me: one draft per version on the card below, each changing only what that version says, so I can post them as Instagram trial reels and see which one wins.",
    "",
    ...(fromDraft
      ? [`Start from my CapCut draft "${fromDraft}": duplicate it for each version and never change the original.${clips ? " These files are on this Mac too if you need them:" : ""}`, ...(clips ? [clips] : [])]
      : ["The reel, on this Mac:", clips || "(no file - ask me for the finished video or its clips and stop)"]),
    // Matters when it rebuilds from the clips or adds new text or a cover.
    ...styleLines(edit),
    "",
    "Trial card:",
    edit.brief,
    "",
    "For this run:",
    "- If it's a draft or the finished video, build each version on top of it (trim, reorder the opening, swap the text, change the cover). If it's the clips, rebuild the original edit first, then make each version from it.",
    `- Name the drafts "${name} T1", "${name} T2" and so on, adding v2 if a name is taken. Never overwrite a draft.`,
    `- If you can export from CapCut, export each version as an mp4 into ${out}/ (T1.mp4, T2.mp4…). If you can't, say so: the drafts are enough.`,
    "- If CapCut being open stops a draft saving, say so and stop. I'll close it and reply.",
    "- If you need something from me, ask one clear question and stop.",
    "- Finish with a short summary, then one line per draft you made: DRAFT: <the draft name>.",
  ].join("\n");
}

// A whole week in one go: Claude matches the clips to the videos, then makes a draft for each.
function wholeSheetPrompt(edit, clips) {
  const prefix = edit.brand ? `${edit.brand} ` : "";
  return [
    `Edit every video on this shoot sheet in CapCut for me, the same way as when I paste a shoot sheet and a screenshot of my clips into this chat.${whose(edit)}`,
    ...folderLines(edit),
    ...styleLines(edit),
    ...notesLines(edit),
    "",
    `All the clips I filmed for it, on this Mac (${edit.files.length}):`,
    clips,
    "",
    "Shoot sheet:",
    edit.brief,
    "",
    "For this run:",
    "- First work out which clips belong to which video and shot code. Use the filming order on the sheet, the file names and times, and look at a frame or two when you need to. Skip any video with no clips (say which).",
    "- Before editing, list the match as one line per video (e.g. V1: IMG_2001.MOV, IMG_2002.MOV). If you're unsure about a match, ask me and stop.",
    `- Make a new CapCut draft for each video (never overwrite one), named "${prefix}V1", "${prefix}V2" and so on, adding v2, v3 if a name is taken.`,
    "- If CapCut being open stops a draft saving, say so and stop. I'll close it and reply.",
    ...RESOURCEFUL,
    REMEMBER,
    "- Finish with a short summary, then one line per draft you made: DRAFT: <the draft name>.",
  ].join("\n");
}

// Short, readable lines for what Claude is doing.
function describeTool(name, input = {}) {
  const n = String(name);
  if (n.startsWith("mcp__capcut__")) {
    const t = n.replace("mcp__capcut__capcut_", "").replace(/_/g, " ");
    return `CapCut: ${t}${input.name ? ` (${input.name})` : ""}`;
  }
  if (n === "Bash") return `Running: ${String(input.description || input.command || "").split("\n")[0].slice(0, 140)}`;
  if (n === "Read" || n === "Write" || n === "Edit") return `${n === "Read" ? "Reading" : "Writing"} ${path.basename(String(input.file_path || ""))}`;
  if (n === "Skill") return `Using the ${input.skill || input.name || ""} skill`;
  return `Using ${n}`;
}

const running = new Map(); // edit id -> child process
const waitingReplies = new Map(); // edit id -> [{ eventId, text, sessionId }]
const cancelled = new Set(); // edit ids stopped from Creator Desk

const cwdFor = new Map(); // edit id -> the folder its Claude Code session lives in

// fresh: the edit's full instructions, to start over with if this Mac can't carry on the session (it began on another Mac).
function startClaude(editId, prompt, sessionId, cwd = cwdFor.get(editId) || cfg.workdir, fresh = null) {
  cwdFor.set(editId, cwd);
  const args = ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits", "--allowedTools", ...cfg.allowedTools];
  if (sessionId) args.push("--resume", sessionId);
  log(`${sessionId ? "Carrying on" : "Starting"} the edit with Claude Code…`);
  try {
    fs.mkdirSync(cwd, { recursive: true });
  } catch {}
  const child = spawn(cfg.claude, args, { cwd, env: process.env, stdio: ["pipe", "pipe", "pipe"] });
  running.set(editId, child);
  // If Claude Code can't start at all, say so on the card instead of the helper falling over.
  child.on("error", (e) => {
    stderr = `Couldn't start Claude Code (${cfg.claude}): ${e.code === "ENOENT" ? "it isn't installed, or isn't where the helper looks. In Terminal, run: claude --version" : e.message}`;
    finish(-1, null);
  });
  child.stdin.on("error", () => {});
  child.stdin.end(prompt);

  let buffer = "";
  let pending = [];
  let session = sessionId || null;
  let finalText = "";
  let errored = false;
  let stderr = "";
  const flush = async (extra = {}) => {
    const events = pending;
    pending = [];
    if (!events.length && !Object.keys(extra).length) return;
    try {
      await update(editId, { events, ...(session ? { sessionId: session } : {}), ...extra });
    } catch (e) {
      log("Couldn't reach Creator Desk:", e.message);
      pending = [...events, ...pending];
    }
  };
  const timer = setInterval(flush, 1200);

  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (!line) continue;
      let m;
      try {
        m = JSON.parse(line);
      } catch {
        continue;
      }
      if (m.session_id) session = m.session_id;
      if (m.type === "assistant") {
        for (const c of m.message?.content ?? []) {
          if (c.type === "text" && c.text.trim()) pending.push({ kind: "assistant", text: c.text.trim() });
          if (c.type === "tool_use") pending.push({ kind: "tool", text: describeTool(c.name, c.input) });
        }
      } else if (m.type === "result") {
        finalText = String(m.result ?? "");
        errored = Boolean(m.is_error);
      }
    }
  });
  child.stderr.on("data", (c) => {
    stderr = (stderr + c).slice(-4000);
  });

  child.on("close", (code, signal) => finish(code, signal));
  let finished = false;
  async function finish(code, signal) {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    // One draft, or one per video for a whole shoot sheet.
    // "DRAFT: none (not created yet)" isn't a draft.
    const drafts = [...finalText.matchAll(/^\s*DRAFT:\s*(.+?)\s*$/gm)].map((m) => m[1]).filter((d) => !/^(none|n\/a|no draft|not (yet )?created|-)\b/i.test(d.replace(/[*_`"']/g, "")));
    const draft = drafts.join(", ");
    // Feedback Claude was asked to remember, for this job or all edits.
    const notes = [...finalText.matchAll(/^\s*NOTE( FOR ALL)?:\s*(.+?)\s*$/gm)].map((m) => ({ text: m[2].replace(/^[`"']|[`"']$/g, "").slice(0, 500), all: Boolean(m[1]) })).slice(0, 10);
    let status;
    if (cancelled.has(editId)) {
      cancelled.delete(editId);
      pending.push({ kind: "status", text: "Stopped." });
      status = "failed";
    } else if (sessionId && fresh && (errored || code !== 0) && /no conversation found|(conversation|session)[^\n]*not found/i.test(`${finalText}\n${stderr}`)) {
      // The session lives on another Mac: start the edit again here from the card.
      pending.push({ kind: "status", text: `This Mac (${macName()}) doesn't have where the edit left off - it was started on another Mac - so it's starting the edit again from the card.` });
      await flush({ status: "editing" });
      startClaude(editId, fresh, null, cwd);
      return;
    } else if (errored || (code !== 0 && !finalText)) {
      pending.push({ kind: "error", text: (finalText || stderr.trim().split("\n").slice(-3).join("\n") || `Claude Code stopped (${signal || code}).`).slice(0, 2000) });
      status = "failed";
    } else if (draft) {
      pending.push({ kind: "done", text: drafts.length > 1 ? `${drafts.length} drafts ready in CapCut: ${draft}` : `Draft ready in CapCut: ${draft}` });
      status = "ready";
    } else {
      // No draft: Claude stopped to ask something (or CapCut was open).
      status = "needs_you";
    }
    await flush({ status, ...(draft ? { draftName: draft } : {}), ...(notes.length ? { notes } : {}) });
    // Only once its status is saved, so Creator Desk never sees it editing with nothing running.
    running.delete(editId);
    log(status === "ready" ? `Done: ${draft}` : status === "needs_you" ? "Claude has a question - reply in the card." : "The edit stopped.");
    // Any replies that came in while it was busy go next, in the same session.
    const queued = waitingReplies.get(editId);
    if (queued?.length && session && status !== "failed") {
      waitingReplies.delete(editId);
      await update(editId, { status: "editing", delivered: queued.map((r) => r.eventId) });
      startClaude(editId, queued.map((r) => r.text).join("\n\n"), session);
    }
  }
}

async function handleWork(work) {
  // Creator Desk says which helper is newest, and whether you've asked for this one to run in the background (or not).
  if (work.latest) latestHelper = work.latest;
  if (work.background === true || work.background === false) switchBackground(work.background);
  // Edit styles: reading your setup and taking key frames go on alongside everything else.
  if (work.styleScan) handleStyleScan(work.styleScan).catch((e) => log("Couldn't read your editing setup:", e.message));
  for (const g of work.frameGrabs ?? []) queueFrameGrab(g);
  // Syncing your editing setup with your other Mac goes on alongside too.
  if (work.setupSync) queueSetupSync(work.setupSync);
  // A shoot sheet is waiting on these, so they go first.
  await handleReads(work.reads);
  for (const p of work.picks ?? []) await handlePick(p);
  for (const id of work.cancels ?? []) {
    const child = running.get(id);
    if (child) {
      cancelled.add(id);
      child.kill("SIGTERM");
    } else {
      await update(id, { status: "failed", events: [{ kind: "status", text: "Stopped." }] });
    }
  }
  for (const r of work.replies ?? []) {
    if (running.has(r.editId)) {
      const list = waitingReplies.get(r.editId) ?? [];
      if (!list.some((x) => x.eventId === r.eventId)) list.push(r);
      waitingReplies.set(r.editId, list);
    } else if (r.sessionId) {
      await update(r.editId, { status: "editing", delivered: [r.eventId] });
      // Back in the folder its session started in (Claude Code keeps sessions per folder).
      startClaude(r.editId, r.text, r.sessionId, cwdFor.get(r.editId) || whereFor(r.folder).cwd);
    }
  }
  // A few edits side by side (you choose how many on the Mac helper page); the rest wait their turn.
  const max = Math.max(1, Math.min(4, Number(work.maxEdits) || 1));
  for (const e of work.edits ?? []) {
    if (running.size >= max) break;
    const { ok } = await update(e.id, { claim: true });
    if (!ok) continue;
    log(`Editing ${[e.brand, e.videoCode, e.title].filter(Boolean).join(" · ")}`);
    const where = whereFor(e.folder);
    e.cwdUsed = where.used;
    await update(e.id, {
      events: [
        { kind: "status", text: `Your Mac (${macName()}) has started the edit${where.used ? ` in ${e.folder}` : ""}.` },
        ...(where.missing ? [{ kind: "status", text: `Couldn't find ${where.missing} on this Mac, so it's working in ${where.cwd.replace(os.homedir(), "~")} instead.` }] : []),
      ],
    });
    const terms = !e.sessionId && LIBRARY_LINE.exec(e.brief)?.[1].split(",").map((t) => t.trim()).filter(Boolean).slice(0, 6);
    let broll = "";
    if (terms?.length) {
      try {
        broll = await gatherBroll(e, terms);
      } catch (err) {
        log("Couldn't look for B-roll:", err.message);
      }
    }
    const prompt = promptFor(e, broll);
    startClaude(e.id, prompt, e.sessionId, where.cwd, e.sessionId ? prompt : null);
  }
}

// ------------------------------------------------------------ keeping itself up to date

const newer = (a, b) => {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};

let lastUpdateCheck = 0;
// The newest helper Creator Desk says there is (it says on every check-in), and the last one we tried to get.
let latestHelper = "";
let triedHelper = "";
// When Creator Desk has a newer helper: save it over this one and run it in this one's place, as soon as no
// edit is running. It's told the moment there's one; otherwise it looks every 6 hours. A failed try waits 10 minutes.
async function selfUpdate() {
  if (process.env.CDH_NO_UPDATE || running.size || syncing) return false;
  const told = latestHelper && newer(latestHelper, VERSION) && (latestHelper !== triedHelper || Date.now() - lastUpdateCheck > 10 * 60_000);
  if (!told && Date.now() - lastUpdateCheck < 6 * 3_600_000) return false;
  lastUpdateCheck = Date.now();
  triedHelper = latestHelper;
  try {
    const res = await fetch(cfg.server.replace(/\/$/, "") + "/helper/creator-desk-helper.mjs", { headers: { "user-agent": `creator-desk-helper/${VERSION}` } });
    if (!res.ok) return false;
    const code = await res.text();
    const latest = /const VERSION = "(\d+\.\d+\.\d+)"/.exec(code)?.[1];
    if (!latest || !newer(latest, VERSION) || !code.startsWith("#!/usr/bin/env node")) return false;
    const self = path.resolve(process.argv[1]);
    fs.writeFileSync(self + ".new", code);
    fs.renameSync(self + ".new", self);
    log(`Updated the helper to ${latest}. Restarting…`);
    restart();
    return true;
  } catch (e) {
    log("Couldn't check for a newer helper:", e.message);
    return false;
  }
}

// Start the helper afresh in this one's place. In the background the Mac starts it again by itself;
// in a Terminal window the new one carries on there (just the helper - never the connect code it may have started with).
function restart() {
  if (BACKGROUND) process.exit(0);
  const child = spawn(process.execPath, [path.resolve(process.argv[1])], { stdio: "inherit", env: process.env });
  child.on("exit", (c) => process.exit(c ?? 0));
}

async function loop() {
  log(`Creator Desk Helper ${VERSION} is running for ${cfg.server}. Leave this window open.`);
  await report(true).catch((e) => log("Couldn't reach Creator Desk:", e.message));
  let failures = 0;
  for (;;) {
    // The new helper carries on in this window; this one just waits for it.
    if (await selfUpdate()) return new Promise(() => {});
    try {
      // Say which edits are running here, so ones a restart dropped don't stay stuck on "Editing".
      await handleWork(await api("GET", `/api/hub/helper/poll?running=${[...running.keys()].join(",")}`));
      await report();
      failures = 0;
    } catch (e) {
      failures++;
      if (failures === 1 || failures % 30 === 0) log("Couldn't reach Creator Desk, will keep trying:", e.message);
    }
    await sleep(failures ? Math.min(30_000, POLL_MS * 2 ** Math.min(failures, 4)) : POLL_MS);
  }
}

// ------------------------------------------------------------ commands

async function connect(code, server) {
  const name = macName();
  const res = await fetch(server.replace(/\/$/, "") + "/api/hub/helper/pair", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, name, info: { helper: VERSION, macos: run("sw_vers", ["-productVersion"]) || os.release() } }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.token) {
    // Started again with a code that's already been used (an older helper restarting after an update does
    // this): this Mac is still connected, so carry on rather than stop.
    const saved = load();
    if (saved?.token && saved.server === server) {
      console.log("This Mac is already connected to Creator Desk - carrying on.");
      return;
    }
    console.error(json.error || `Creator Desk said ${res.status}`);
    process.exit(1);
  }
  save(defaults({ ...(load() ?? {}), server, token: json.token, name }));
  console.log(`\nConnected "${name}" to Creator Desk.\n`);
}

// Running in the background: macOS starts the helper when you log in and again if it stops, with no Terminal window.
const PLIST = path.join(os.homedir(), "Library", "LaunchAgents", "com.creatordesk.helper.plist");
const LAUNCHCTL = process.env.CDH_LAUNCHCTL || "launchctl";
const BACKGROUND = process.env.CDH_BACKGROUND === "1";

// You switched running in the background on or off in Creator Desk. Done once no edit is running: switching on
// hands over to the background helper and closes this one; switching off stops the background one (start it in
// Terminal again when you want it).
let switchingTo = null;
let leavingBackground = false;
function switchBackground(on) {
  if (switchingTo === on) return;
  switchingTo = on;
  const go = async () => {
    while (running.size || syncing) await sleep(2000);
    if (on) {
      if (process.platform !== "darwin" && !process.env.CDH_LAUNCHCTL) {
        log("Running in the background only works on a Mac.");
        switchingTo = null;
        return;
      }
      autostart(true);
      await report(true).catch(() => {});
      log("The helper now runs in the background, and starts by itself when you log in. You can close this window.");
      if (!BACKGROUND) process.exit(0);
    } else {
      log("Stopping the background helper. To start it again, open Terminal and run: node ~/.creator-desk/creator-desk-helper.mjs");
      // Say so first: stopping the background helper can stop this one too.
      leavingBackground = true;
      await report(true).catch(() => {});
      autostart(false);
      if (BACKGROUND) process.exit(0);
    }
    switchingTo = null;
  };
  go().catch((e) => {
    log("Couldn't switch running in the background:", e.message);
    switchingTo = null;
  });
}

function autostart(on) {
  const plist = PLIST;
  if (!on) {
    run(LAUNCHCTL, ["unload", plist]);
    fs.rmSync(plist, { force: true });
    console.log("The helper won't start by itself any more.");
    return;
  }
  const script = path.resolve(process.argv[1]);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.creatordesk.helper</string>
  <key>ProgramArguments</key><array><string>${process.execPath}</string><string>${script}</string></array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${process.env.PATH}</string><key>CDH_BACKGROUND</key><string>1</string>${process.env.CDH_HOME ? `<key>CDH_HOME</key><string>${process.env.CDH_HOME}</string>` : ""}</dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${path.join(HOME, "helper.log")}</string>
  <key>StandardErrorPath</key><string>${path.join(HOME, "helper.log")}</string>
</dict></plist>
`;
  fs.mkdirSync(path.dirname(plist), { recursive: true });
  fs.writeFileSync(plist, xml);
  run(LAUNCHCTL, ["unload", plist]);
  run(LAUNCHCTL, ["load", plist]);
  console.log(`The helper now starts by itself when you log in. Its log: ${path.join(HOME, "helper.log")}`);
}

const [cmd, ...rest] = process.argv.slice(2);
const flag = (n) => {
  const i = rest.indexOf(n);
  return i >= 0 ? rest[i + 1] : undefined;
};

if (cmd === "connect") {
  const code = rest.find((a) => !a.startsWith("--") && a !== flag("--server"));
  if (!code) {
    console.error("Add the code from Creator Desk: node creator-desk-helper.mjs connect ABCD-EFGH");
    process.exit(1);
  }
  await connect(code, flag("--server") || process.env.CDH_SERVER || "https://www.dannightingxle.com");
  cfg = defaults(load());
  if (!rest.includes("--no-run")) await loop();
} else {
  cfg = load();
  if (!cfg?.token) {
    console.error("This Mac isn't connected yet. On Creator Desk, open Studio → Mac helper and follow the steps.");
    process.exit(1);
  }
  cfg = defaults(cfg);
  if (cmd === "autostart") autostart(rest[0] !== "off");
  else if (cmd === "status") console.log(JSON.stringify({ ...info(), clips: recentClips().length }, null, 2));
  else if (cmd === "sound") {
    // node creator-desk-helper.mjs sound <link> [file]: saves the sound and prints where (used by edits).
    const [url, file] = rest;
    if (!url) {
      console.error("Add a link: node creator-desk-helper.mjs sound https://www.tiktok.com/music/...");
      process.exit(1);
    }
    const out = file ? path.resolve(file) : path.join(SOUNDS, `${slug(url.replace(/^https?:\/\/(www\.)?/, "")).slice(0, 60)}.m4a`);
    const got = await grabSound(url, out);
    console.log(JSON.stringify(got, null, 2));
    process.exit(got.file ? 0 : 1);
  } else if (cmd === "find") {
    // Try the B-roll search without an edit: node creator-desk-helper.mjs find "laptop"
    const term = rest.join(" ") || "laptop";
    const dir = path.join(BROLL, "_test", slug(term));
    const photos = await searchPhotos(term, dir);
    console.log(
      JSON.stringify({ photos: photos.files, photosProblem: photos.error || undefined, osxphotos: osxphotos() || "not installed", drives: searchDrives(await libraryIndex(), term), libraries: libraries() }, null, 2),
    );
  }
  else await loop();
}
