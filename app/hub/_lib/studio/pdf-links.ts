import "server-only";
import { inflateSync } from "node:zlib";

/* The links in an uploaded PDF - a Notion page saved as a PDF keeps a link to
   every sub-page, the app's site and its store pages. Claude can see a PDF's
   text but can't open Notion pages, so these are read the same way as links
   pasted in. Link annotations are usually stored as plain text in the file;
   compressed parts are opened too, in case they're in there. */

const URI = /\/URI\s*(?:\(((?:\\.|[^\\)])*)\)|<([0-9a-fA-F\s]*)>)/g;
const MAX_LINKS = 60;
// Big PDFs: only this much of each compressed part is looked at.
const MAX_STREAM = 2_000_000;

function fromLiteral(s: string) {
  return s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_m, e: string) => (/^[0-7]/.test(e) ? String.fromCharCode(parseInt(e, 8)) : ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" } as Record<string, string>)[e] ?? e));
}

function urisIn(text: string, into: Set<string>) {
  for (const m of text.matchAll(URI)) {
    const raw = m[1] != null ? fromLiteral(m[1]) : Buffer.from((m[2] ?? "").replace(/\s/g, ""), "hex").toString("latin1");
    const url = raw.trim();
    if (/^https?:\/\/\S+$/i.test(url)) into.add(url);
    if (into.size >= MAX_LINKS) return;
  }
}

/** Every web link in a PDF (given as base64), in the order found. */
export function pdfLinks(base64: string): string[] {
  const found = new Set<string>();
  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, "base64");
  } catch {
    return [];
  }
  const text = bytes.toString("latin1");
  urisIn(text, found);
  for (const m of text.matchAll(/stream\r?\n/g)) {
    if (found.size >= MAX_LINKS) break;
    const start = (m.index ?? 0) + m[0].length;
    const end = text.indexOf("endstream", start);
    if (end < 0) continue;
    try {
      urisIn(inflateSync(bytes.subarray(start, Math.min(end, start + MAX_STREAM))).toString("latin1"), found);
    } catch {
      // Not compressed this way (an image, a font): nothing to read.
    }
  }
  return [...found];
}

/** The links in every uploaded PDF, one per line, to read alongside what was pasted. */
export function uploadedLinks(uploads: { type: string; data: string }[]) {
  return uploads
    .filter((u) => u.type === "application/pdf")
    .flatMap((u) => pdfLinks(u.data))
    .join("\n");
}
