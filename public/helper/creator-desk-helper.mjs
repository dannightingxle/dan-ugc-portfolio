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

  It keeps itself up to date: when Creator Desk has a newer helper, it downloads it and restarts
  between edits (set CDH_NO_UPDATE=1 to stop that).

  Usage:
    node creator-desk-helper.mjs connect ABCD-EFGH     connect this Mac (code from Creator Desk)
    node creator-desk-helper.mjs                       run (keep the window open)
    node creator-desk-helper.mjs autostart on|off      start by itself when you log in
    node creator-desk-helper.mjs status                show what it can see
    node creator-desk-helper.mjs find "laptop"         try the B-roll search (Apple Photos and drives)

  Needs: macOS, Node 18+, Claude Code (`claude`) signed in, CapCut desktop. ffmpeg/ffprobe for
  clip lengths and thumbnails (optional). Settings: ~/.creator-desk/helper.json ("libraries":
  the folders to look through for B-roll; by default every external drive under /Volumes).
*/

import { spawn, execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const VERSION = "0.3.5";
const HOME = process.env.CDH_HOME || path.join(os.homedir(), ".creator-desk");
const CONFIG = path.join(HOME, "helper.json");
const THUMBS = path.join(HOME, "thumbs.json");
const LIBRARY = path.join(HOME, "library.json");
const LIBRARY_LIST = path.join(HOME, "library.txt");
const BROLL = path.join(os.homedir(), "Movies", "Creator Desk", "B-roll");
const TRIALS = path.join(os.homedir(), "Movies", "Creator Desk", "Trial reels");
const POLL_MS = Number(process.env.CDH_POLL_MS) || 2000;
const VIDEO = /\.(mov|mp4|m4v)$/i;

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
function defaults(cfg) {
  const home = os.homedir();
  const shortform = path.join(home, "Movies", "shortform");
  return {
    folders: [path.join(home, "Downloads"), path.join(home, "Desktop"), path.join(home, "Movies")],
    workdir: fs.existsSync(shortform) ? shortform : home,
    claude: "claude",
    // What Claude Code may do without asking (it runs without a window to approve things in).
    allowedTools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "Skill", "mcp__capcut"],
    ...cfg,
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
  const bin = ffmpeg();
  let data = null;
  if (bin) {
    const out = path.join(os.tmpdir(), `cdh-${process.pid}.jpg`);
    run(bin, ["-v", "error", "-y", "-ss", "1", "-i", file, "-frames:v", "1", "-vf", "scale=160:-2", "-q:v", "6", out], { timeout: 20_000 });
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
  };
}

// The newest videos in your folders (two levels deep, last 3 weeks), skipping CapCut's own files.
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
      } else if (VIDEO.test(e.name)) {
        try {
          const st = fs.statSync(p);
          if (st.mtimeMs >= since) found.push({ path: p, name: e.name, folder: dir.replace(os.homedir(), "~"), mtime: st.mtimeMs });
        } catch {}
      }
    }
  };
  for (const f of cfg.folders) walk(f, 0);
  return found
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 40)
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

const runAsync = (cmd, args, timeout) =>
  new Promise((resolve) => execFile(cmd, args, { timeout, maxBuffer: 10_000_000 }, (err, stdout, stderr) => resolve({ err, stdout: String(stdout), stderr: String(stderr) })));
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
const readScript = () => [
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
  `set js to ${JSON.stringify(READ_JS)}`,
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

// The videos in a folder (and the folders inside it), by name - the order you filmed them in.
function videosIn(dir) {
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
      else if (VIDEO.test(e.name)) out.push(p);
    }
  };
  walk(dir, 0);
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function pickFiles(label, mode) {
  const folder = mode === "folder";
  if (process.env.CDH_PICK_CMD) {
    const lines = run("/bin/sh", ["-c", process.env.CDH_PICK_CMD], { timeout: 600_000, env: { ...process.env, CDH_PICK_MODE: folder ? "folder" : "files" } }).split("\n").filter(Boolean);
    return folder ? lines.flatMap(videosIn) : lines;
  }
  const prompt = `${folder ? "Pick the folder with the clips" : "Pick the clips"} for ${label || "this video"}`.replace(/"/g, "'");
  const script = folder
    ? ['tell application "Finder"', "activate", `set picked to choose folder with prompt "${prompt}"`, "end tell", "return POSIX path of picked"]
    : [
        'tell application "Finder"',
        "activate",
        `set picked to choose file with prompt "${prompt}" of type {"public.movie"} with multiple selections allowed`,
        "end tell",
        'set out to ""',
        "repeat with f in picked",
        "set out to out & POSIX path of f & linefeed",
        "end repeat",
        "return out",
      ];
  const lines = run("osascript", script.flatMap((l) => ["-e", l]), { timeout: 600_000 }).split("\n").filter(Boolean);
  return folder ? lines.flatMap(videosIn) : lines;
}

async function handlePick(p) {
  log(`Opening the ${p.mode === "folder" ? "folder" : "file"} picker for ${p.label || "a video"}…`);
  const paths = pickFiles(p.label, p.mode);
  const picked = paths.map((f) => ({ path: f, name: path.basename(f), duration: duration(f) }));
  await update(p.id, { pickDone: true, picked });
  log(picked.length ? `Picked ${picked.length} clip(s).` : "Nothing picked.");
}

// ------------------------------------------------------------ editing with Claude Code

function promptFor(edit, broll = "") {
  const clips = edit.files.map((f) => `- ${f.path}${f.duration ? ` (${mmss(f.duration)})` : ""}`).join("\n");
  if (edit.videoCode === "ALL") return wholeSheetPrompt(edit, clips);
  if (TRIAL_LINE.test(edit.brief)) return trialPrompt(edit, clips);
  const name = (edit.personal ? ["Personal", edit.videoCode || edit.title.slice(0, 40)] : [edit.brand, edit.videoCode]).filter(Boolean).join(" ") || edit.title.slice(0, 50) || "Creator Desk edit";
  return [
    `Edit this video in CapCut for me, the same way as when I paste a video card and the clip names into this chat.${whose(edit)}`,
    ...folderLines(edit),
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
  if (edit.personal) return " It's for my own personal brand, not a client: use my editing skills and my personal-brand style and notes.";
  return edit.brand ? ` It's for ${edit.brand}: use my editing skills and the brand profile for ${edit.brand} if there is one.` : "";
}

/** The job's own folder on this Mac, when it has one: Claude Code starts there, so its CLAUDE.md, notes and skills apply. */
function folderLines(edit) {
  return edit.cwdUsed ? [`You're working in ${edit.folder}, my folder for these edits: follow its CLAUDE.md, notes and skills for how I edit them.`] : [];
}

/** Your editing notes (feedback saved from earlier edits and the notes chat in Creator Desk). */
function notesLines(edit) {
  if (!edit.notes?.length) return [];
  return ["", "My editing notes - follow these on every edit unless the card says otherwise (where two clash, the later one wins):", ...edit.notes.map((n) => `- ${n}`)];
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
  "- Sounds: if the card names or links a sound or song, add it from my CapCut favourite sounds (the CapCut tool can pull in TikTok and Instagram sounds I've favourited in my linked accounts). If it isn't in my favourites, build the rest and tell me exactly which sound to favourite (name, and the link if there is one) so you can add it next time.",
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

function startClaude(editId, prompt, sessionId, cwd = cwdFor.get(editId) || cfg.workdir) {
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
    startClaude(e.id, promptFor(e, broll), e.sessionId, where.cwd);
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
// When Creator Desk has a newer helper: save it over this one and run it in this one's place.
async function selfUpdate() {
  if (process.env.CDH_NO_UPDATE || running.size || Date.now() - lastUpdateCheck < 6 * 3_600_000) return false;
  lastUpdateCheck = Date.now();
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
    const child = spawn(process.execPath, process.argv.slice(1), { stdio: "inherit", env: process.env });
    child.on("exit", (c) => process.exit(c ?? 0));
    return true;
  } catch (e) {
    log("Couldn't check for a newer helper:", e.message);
    return false;
  }
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
    console.error(json.error || `Creator Desk said ${res.status}`);
    process.exit(1);
  }
  save(defaults({ ...(load() ?? {}), server, token: json.token, name }));
  console.log(`\nConnected "${name}" to Creator Desk.\n`);
}

function autostart(on) {
  const plist = path.join(os.homedir(), "Library", "LaunchAgents", "com.creatordesk.helper.plist");
  if (!on) {
    run("launchctl", ["unload", plist]);
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
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${process.env.PATH}</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${path.join(HOME, "helper.log")}</string>
  <key>StandardErrorPath</key><string>${path.join(HOME, "helper.log")}</string>
</dict></plist>
`;
  fs.mkdirSync(path.dirname(plist), { recursive: true });
  fs.writeFileSync(plist, xml);
  run("launchctl", ["unload", plist]);
  run("launchctl", ["load", plist]);
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
  else if (cmd === "find") {
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
