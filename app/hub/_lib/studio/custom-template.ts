/* A job's own shoot sheet template (the one from its Claude Project). Every
   template keeps one week's content in a WEEK DATA block of plain constants
   (prep, sessions, videos and whatever else that job's template uses) and
   reads them with its own code. To make a new sheet, Claude returns new
   values for exactly those constants, as data; we write them back in as JSON
   (never as code) and fill the bracketed header text. The rest of the
   template - its design, buttons and code - is used exactly as it is.
   Safe to import anywhere. */

export type TemplateBlock = { start: number; end: number; source: string; names: string[] };

const HELPERS = /\/\*\s*-{3,}\s*helpers\s*-{3,}\s*\*\//i;
const END_DATA = /\/\*\s*=+\s*END WEEK DATA\s*=+\s*\*\//i;

/** Where the template's week data lives, and which constants it defines. Null if it isn't a shoot sheet template. */
export function weekDataBlock(html: string): TemplateBlock | null {
  // The block ends at END WEEK DATA, or at the helpers line, inside the template's script.
  const endMark = END_DATA.exec(html);
  const helpers = HELPERS.exec(html);
  let end: number;
  if (endMark && (!helpers || endMark.index < helpers.index)) end = endMark.index + endMark[0].length;
  else if (helpers) end = helpers.index;
  else return null;
  // It starts at the comment naming WEEK DATA in that same script (the CSS notes above can mention it too).
  const script = html.lastIndexOf("<script", end);
  if (script < 0) return null;
  const label = html.indexOf("WEEK DATA", script);
  if (label < 0 || label >= end) return null;
  const start = html.lastIndexOf("/*", label);
  if (start < script) return null;
  const source = html.slice(start, end);
  const names = [...source.matchAll(/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm)].map((m) => m[1]);
  if (!names.includes("videos")) return null;
  return { start, end, source, names: [...new Set(names)] };
}

export const isShootSheetTemplate = (html: string) => Boolean(html && weekDataBlock(html));

/** JSON that's safe inside a <script> tag. */
function scriptJson(value: unknown) {
  return JSON.stringify(value ?? null)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Links only ever go somewhere real: any url/ref/href that isn't http(s) is dropped. */
export function safeData(value: unknown, key = ""): unknown {
  if (typeof value === "string") return /(^|_)(url|ref|href|link)$/i.test(key) && value && !/^https?:\/\//i.test(value.trim()) ? "" : value;
  if (Array.isArray(value)) return value.map((v) => safeData(v, key));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, safeData(v, k)]));
  return value;
}

export type SheetHeader = { title: string; kicker: string; h1: string; summary: string };

/** The template with this week's data and header in it. */
export function fillTemplate(html: string, header: SheetHeader, data: Record<string, unknown>) {
  const block = weekDataBlock(html);
  if (!block) throw new Error("That template has no WEEK DATA block.");
  const clean = safeData(data) as Record<string, unknown>;
  const consts = block.names.map((n) => `const ${n} = ${scriptJson(clean[n] ?? (n === "videos" || n === "prep" || n === "sessions" ? [] : null))};`).join("\n\n");
  let out = html.slice(0, block.start) + `/* WEEK DATA, filled in by Creator Desk. */\n${consts}\n\n` + html.slice(block.end);
  out = out.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${escapeHtml(header.title)}</title>`);
  // The header: kicker, heading and the summary line under it.
  out = out.replace(/(<header class="page">[\s\S]*?<\/header>)/i, (h) =>
    h
      .replace(/(<div class="kicker">)[\s\S]*?(<\/div>)/i, (_m, a, b) => `${a}${escapeHtml(header.kicker)}${b}`)
      .replace(/(<h1>)[\s\S]*?(<\/h1>)/i, (_m, a, b) => `${a}${escapeHtml(header.h1)}${b}`)
      .replace(/(<\/h1>\s*<p>)[\s\S]*?(<\/p>)/i, (_m, a, b) => `${a}${escapeHtml(header.summary)}${b}`),
  );
  return out;
}

type Video = Record<string, unknown> & { code?: string; title?: string };

const LABELS: [string, string][] = [
  ["ref", "Reference"],
  ["refLabel", "Reference"],
  ["sound", "Sound"],
  ["headline", "Headline"],
  ["headSub", "Headline note"],
  ["captions", "Captions"],
  ["delivery", "Delivery"],
  ["script", "Script"],
  ["hooks", "Other hooks (swap for the first line)"],
  ["scriptNote", "Note"],
  ["beats", "What to do"],
  ["alts", "Other headlines"],
  ["where", "Where"],
  ["props", "Props"],
  ["over", "B-roll and app shots"],
  ["overNote", "B-roll and app shots"],
  ["edit", "Edit notes"],
  ["captionsOpts", "Post caption"],
  ["hashtags", "Hashtags"],
];
const SKIP = new Set(["code", "title", "day", "dow", "date", "format", "type", "length", "session"]);

function asText(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map((x) => (Array.isArray(x) ? `- ${x.map(asText).join(": ")}` : `- ${asText(x)}`)).join("\n");
  return Object.entries(v as Record<string, unknown>)
    .filter(([, x]) => x !== "" && x != null)
    .map(([k, x]) => `${k}: ${asText(x)}`)
    .join(", ");
}

/** One video from a filled template, as "Copy everything" text: every field it has, labelled. */
export function videoText(v: Video, data: Record<string, unknown>) {
  const sessions = (Array.isArray(data.sessions) ? data.sessions : []) as { key?: string; name?: string; clips?: unknown[] }[];
  const where = sessions.find((s) => s.key === v.session);
  const clips = sessions.flatMap((s) => (Array.isArray(s.clips) ? s.clips : []).filter((c) => Array.isArray(c) && c[1] === v.code).map((c) => `- ${(c as string[])[0]}: ${(c as string[])[2]}`));
  const out = [
    `${v.code ?? ""} · ${v.title ?? ""}`,
    [v.dow || v.date || (v.day != null ? `Day ${v.day}` : ""), v.format != null && `format ${v.format}`, v.type, v.length, v.session && `film in ${v.session}${where?.name ? ` (${where.name})` : ""}`]
      .filter(Boolean)
      .join(" · "),
    "",
  ];
  const seen = new Set<string>();
  for (const [key, label] of LABELS) {
    const text = asText(v[key]);
    if (!text) continue;
    seen.add(key);
    out.push(text.includes("\n") ? `${label}:\n${text}\n` : `${label}: ${text}`);
    if (key === "where" && clips.length) out.push(`Clips filmed for this video:\n${clips.join("\n")}\n`);
  }
  // Anything else this template has (e.g. a Pingo Custom Mode prompt).
  for (const [key, value] of Object.entries(v)) {
    if (SKIP.has(key) || seen.has(key)) continue;
    const text = asText(value);
    if (text) out.push(text.includes("\n") ? `${key}:\n${text}\n` : `${key}: ${text}`);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** The whole filled sheet as text, for a whole-week edit card. */
export function sheetText(header: SheetHeader, data: Record<string, unknown>) {
  const sessions = (Array.isArray(data.sessions) ? data.sessions : []) as { key?: string; name?: string; light?: string; setup?: string; clips?: unknown[] }[];
  const videos = (Array.isArray(data.videos) ? data.videos : []) as Video[];
  const where = sessions
    .map((s) =>
      [
        `${s.key} · ${s.name ?? ""}${s.light ? ` (${s.light})` : ""}`,
        s.setup,
        "Film in this order:",
        ...(Array.isArray(s.clips) ? s.clips : []).map((c) => (Array.isArray(c) ? `- ${c[0]} · ${c[1]}: ${c[2]}` : `- ${asText(c)}`)),
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
  return [[header.kicker, header.h1, header.summary].filter(Boolean).join("\n"), "WHERE TO FILM", where, "VIDEOS", videos.map((v) => videoText(v, data)).join("\n\n-----\n\n")].join("\n\n");
}

/** A shoot sheet made in a job's own template: the filled page, plus its data (for edit cards). */
export type CustomSheet = { custom: { html: string; header: SheetHeader }; videos: Video[] } & Record<string, unknown>;

export function isCustomSheet(d: unknown): d is CustomSheet {
  return Boolean(d && typeof d === "object" && "custom" in d && typeof (d as CustomSheet).custom?.html === "string");
}

/** Claude's WEEK DATA, checked: a JSON object with every constant the template uses and a list of videos. */
export function readTemplateData(json: string, names: string[]): { data: Record<string, unknown> } | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(json.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return { error: "Claude's sheet came back incomplete. Please try again." };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return { error: "Claude's sheet came back in the wrong shape. Please try again." };
  const d = data as Record<string, unknown>;
  const missing = names.filter((n) => !(n in d));
  if (missing.length) return { error: `Claude's sheet left out ${missing.join(", ")}. Please try again.` };
  const videos = d.videos;
  if (!Array.isArray(videos) || !videos.length || !videos.every((v) => v && typeof v === "object" && typeof (v as Video).code === "string")) {
    return { error: "Claude's sheet had no videos. Please try again." };
  }
  // Only the template's own constants go in.
  return { data: Object.fromEntries(names.map((n) => [n, d[n]])) };
}

/* A job's own template is a whole web page that came from outside the app, so it
   never runs as part of the app: the sheet page loads it into a sandboxed frame
   with no access to the account (no cookies, no API calls, no navigating the
   app). The template's tick boxes keep working through a small stand-in for
   browser storage that hands each tick to the page around it to save. */
const STORAGE_SHIM = `function (init) {
  var data = init || {};
  var send = function (k, v) { try { parent.postMessage({ cdStore: 1, k: k, v: v }, "*"); } catch (e) {} };
  var api = {
    getItem: function (k) { k = String(k); return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { k = String(k); v = String(v); data[k] = v; send(k, v); },
    removeItem: function (k) { k = String(k); delete data[k]; send(k, null); },
    clear: function () { Object.keys(data).forEach(function (k) { api.removeItem(k); }); },
    key: function (i) { var ks = Object.keys(data); return i < ks.length ? ks[i] : null; },
    get length() { return Object.keys(data).length; }
  };
  try { Object.defineProperty(window, "localStorage", { value: api, configurable: true }); } catch (e) {}
}`;

/** The page for a sheet made in a job's own template. */
export function customSheetPage(sheetId: string, title: string, html: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>html, body { margin: 0; height: 100%; background: #F1F4F1; } iframe { border: 0; width: 100%; height: 100%; display: block; }</style>
</head>
<body>
<iframe id="sheet" title="${escapeHtml(title)}" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads" allow="clipboard-write"></iframe>
<script id="sheet-html" type="application/json">${scriptJson(html)}</script>
<script>
(function () {
  var PREFIX = ${scriptJson(`cd-sheet:${sheetId}:`)};
  var store = {};
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(PREFIX) === 0) store[k.slice(PREFIX.length)] = localStorage.getItem(k);
    }
  } catch (e) {}
  var shim = "<scr" + "ipt>(" + ${scriptJson(STORAGE_SHIM)} + ")(" + JSON.stringify(store).replace(/</g, "\\\\u003c") + ");</scr" + "ipt>";
  var html = JSON.parse(document.getElementById("sheet-html").textContent);
  html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, function (m) { return m + shim; }) : shim + html;
  var frame = document.getElementById("sheet");
  window.addEventListener("message", function (e) {
    var d = e.data;
    if (e.source !== frame.contentWindow || !d || d.cdStore !== 1 || typeof d.k !== "string" || d.k.length > 200) return;
    try {
      if (d.v === null) localStorage.removeItem(PREFIX + d.k);
      else if (String(d.v).length < 100000) localStorage.setItem(PREFIX + d.k, String(d.v));
    } catch (x) {}
  });
  frame.srcdoc = html;
})();
</script>
</body>
</html>`;
}
