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

  Usage:
    node creator-desk-helper.mjs connect ABCD-EFGH     connect this Mac (code from Creator Desk)
    node creator-desk-helper.mjs                       run (keep the window open)
    node creator-desk-helper.mjs autostart on|off      start by itself when you log in
    node creator-desk-helper.mjs status                show what it can see

  Needs: macOS, Node 18+, Claude Code (`claude`) signed in, CapCut desktop. ffmpeg/ffprobe for
  clip lengths and thumbnails (optional). Settings: ~/.creator-desk/helper.json
*/

import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const VERSION = "0.1.0";
const HOME = process.env.CDH_HOME || path.join(os.homedir(), ".creator-desk");
const CONFIG = path.join(HOME, "helper.json");
const THUMBS = path.join(HOME, "thumbs.json");
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
  };
}

// ------------------------------------------------------------ small helpers

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
    workdir: cfg.workdir,
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

// ------------------------------------------------------------ picking clips with the Mac file picker

function pickFiles(label) {
  if (process.env.CDH_PICK_CMD) {
    return run("/bin/sh", ["-c", process.env.CDH_PICK_CMD], { timeout: 600_000 }).split("\n").filter(Boolean);
  }
  const prompt = `Pick the clips for ${label || "this video"}`.replace(/"/g, "'");
  const script = [
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
  return run("osascript", script.flatMap((l) => ["-e", l]), { timeout: 600_000 }).split("\n").filter(Boolean);
}

async function handlePick(p) {
  log(`Opening the file picker for ${p.label || "a video"}…`);
  const paths = pickFiles(p.label);
  const picked = paths.map((f) => ({ path: f, name: path.basename(f), duration: duration(f) }));
  await update(p.id, { pickDone: true, picked });
  log(picked.length ? `Picked ${picked.length} clip(s).` : "Nothing picked.");
}

// ------------------------------------------------------------ editing with Claude Code

function promptFor(edit) {
  const clips = edit.files.map((f) => `- ${f.path}${f.duration ? ` (${mmss(f.duration)})` : ""}`).join("\n");
  const name = [edit.brand, edit.videoCode].filter(Boolean).join(" ") || "Creator Desk edit";
  return [
    `Edit this video in CapCut for me, the same way as when I paste a video card and the clip names into this chat.${edit.brand ? ` It's for ${edit.brand}: use my editing skills and the brand profile for ${edit.brand} if there is one.` : ""}`,
    "",
    "Clips, on this Mac:",
    clips,
    "",
    "Video card:",
    edit.brief,
    "",
    "For this run:",
    `- Make a new CapCut draft (never overwrite one) named "${name}", adding v2, v3 if that name is taken.`,
    "- If CapCut being open stops the draft saving, say so and stop. I'll close it and reply.",
    "- If you need something from me, ask one clear question and stop.",
    "- Finish with a short summary of what you did and, on its own line, DRAFT: <the draft name>.",
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

function startClaude(editId, prompt, sessionId) {
  const args = ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits", "--allowedTools", ...cfg.allowedTools];
  if (sessionId) args.push("--resume", sessionId);
  log(`${sessionId ? "Carrying on" : "Starting"} the edit with Claude Code…`);
  const child = spawn(cfg.claude, args, { cwd: cfg.workdir, env: process.env, stdio: ["pipe", "pipe", "pipe"] });
  running.set(editId, child);
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

  child.on("close", async (code, signal) => {
    clearInterval(timer);
    running.delete(editId);
    const draft = /DRAFT:\s*(.+)\s*$/m.exec(finalText)?.[1]?.trim();
    let status;
    if (cancelled.has(editId)) {
      cancelled.delete(editId);
      pending.push({ kind: "status", text: "Stopped." });
      status = "failed";
    } else if (errored || (code !== 0 && !finalText)) {
      pending.push({ kind: "error", text: (finalText || stderr.trim().split("\n").slice(-3).join("\n") || `Claude Code stopped (${signal || code}).`).slice(0, 2000) });
      status = "failed";
    } else if (draft) {
      pending.push({ kind: "done", text: `Draft ready in CapCut: ${draft}` });
      status = "ready";
    } else {
      // No draft: Claude stopped to ask something (or CapCut was open).
      status = "needs_you";
    }
    await flush({ status, ...(draft ? { draftName: draft } : {}) });
    log(status === "ready" ? `Done: ${draft}` : status === "needs_you" ? "Claude has a question - reply in the card." : "The edit stopped.");
    // Any replies that came in while it was busy go next, in the same session.
    const queued = waitingReplies.get(editId);
    if (queued?.length && session && status !== "failed") {
      waitingReplies.delete(editId);
      await update(editId, { status: "editing", delivered: queued.map((r) => r.eventId) });
      startClaude(editId, queued.map((r) => r.text).join("\n\n"), session);
    }
  });
}

async function handleWork(work) {
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
      startClaude(r.editId, r.text, r.sessionId);
    }
  }
  // One edit at a time: CapCut drafts and your Mac's CPU don't like two at once.
  if (running.size) return;
  for (const e of work.edits ?? []) {
    const { ok } = await update(e.id, { claim: true });
    if (!ok) continue;
    log(`Editing ${[e.brand, e.videoCode, e.title].filter(Boolean).join(" · ")}`);
    await update(e.id, { events: [{ kind: "status", text: `Your Mac (${os.hostname().replace(/\.local$/, "")}) has started the edit.` }] });
    startClaude(e.id, promptFor(e), e.sessionId);
    break;
  }
}

async function loop() {
  log(`Creator Desk Helper ${VERSION} is running for ${cfg.server}. Leave this window open.`);
  await report(true).catch((e) => log("Couldn't reach Creator Desk:", e.message));
  let failures = 0;
  for (;;) {
    try {
      await handleWork(await api("GET", "/api/hub/helper/poll"));
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
  const name = run("scutil", ["--get", "ComputerName"]) || os.hostname().replace(/\.local$/, "");
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
  else await loop();
}
