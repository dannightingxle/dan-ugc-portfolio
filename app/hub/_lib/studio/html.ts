import "server-only";
import { SHOOT_SHEET_TEMPLATE } from "./shoot-sheet-template";
import type { SheetData } from "./types";

/* Fills Dan's shoot-sheet template with one week's data: the template's
   WEEK DATA block becomes this sheet's prep, sessions and videos, in the
   exact shapes the template's own code reads. */

/** JSON that's safe inside a <script> tag. */
function scriptJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Only links that go somewhere real (no javascript: and the like). */
function safeUrl(url: string) {
  return /^https?:\/\//i.test(url.trim()) ? url.trim() : "";
}

export function templateData(sheet: SheetData) {
  const prep = sheet.prep.map((p) => ({
    id: p.id,
    text: p.text,
    ...(safeUrl(p.linkUrl) && { link: { label: p.linkLabel || "Open", url: safeUrl(p.linkUrl) } }),
  }));
  const sessions = sheet.sessions.map((s) => ({
    key: s.key,
    name: s.name,
    light: s.light,
    videos: s.videos,
    setup: s.setup,
    props: s.props,
    ...(s.note && { note: s.note }),
    clips: s.clips.map((c) => [c.code, c.video, c.text]),
  }));
  const videos = sheet.videos.map((v) => ({
    code: v.code,
    day: v.day,
    format: v.format,
    type: v.type,
    title: v.title,
    length: v.length,
    session: v.session,
    ref: safeUrl(v.ref) || `https://www.tiktok.com/search?q=${encodeURIComponent(v.title)}`,
    sound: { label: v.sound.label || "Your voice", ...(safeUrl(v.sound.url) && { url: safeUrl(v.sound.url) }), ...(v.sound.sub && { sub: v.sound.sub }) },
    headline: v.headline,
    headSub: v.headSub,
    captions: v.captions,
    script: v.script,
    hooks: v.hooks,
    ...(v.delivery && { delivery: v.delivery }),
    ...(v.scriptNote && { scriptNote: v.scriptNote }),
    beats: v.beats,
    ...(v.alts.length > 0 && { alts: v.alts }),
    where: v.where,
    props: v.props,
    over: v.over.map((o) => [o.code, o.text]),
    overNote: v.overNote || "Nothing over the top.",
    captionsOpts: v.captionsOpts.length ? v.captionsOpts.map((c) => [c.label, c.caption]) : [["Caption", ""]],
    hashtags: v.hashtags,
    edit: v.edit,
  }));
  return { prep, sessions, videos };
}

export function buildShootSheetHtml(id: string, sheet: SheetData) {
  const { prep, sessions, videos } = templateData(sheet);
  const block = `const prep = ${scriptJson(prep)};\n\nconst sessions = ${scriptJson(sessions)};\n\nconst videos = ${scriptJson(videos)};\n`;
  const title = `${sheet.kicker.split("·")[0].trim()} ${sheet.h1}`.trim();
  // The template has no <head>/<body> tags; the browser puts its title and
  // styles in the head and the rest in the body, as it did as an artifact.
  return [
    '<!doctype html><html lang="en-GB"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">',
    SHOOT_SHEET_TEMPLATE.replace("/*__WEEK_DATA__*/", () => block)
      .replace("__TITLE__", () => escapeHtml(title))
      .replace("__KICKER__", () => escapeHtml(sheet.kicker))
      .replace("__H1__", () => escapeHtml(sheet.h1))
      .replace("__SUMMARY__", () => escapeHtml(sheet.summary))
      .replace("__SHEET_ID__", () => scriptJson(id)),
    "</html>",
  ].join("\n");
}
