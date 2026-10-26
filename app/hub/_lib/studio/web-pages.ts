import "server-only";
import { type LookupAddress, lookup as dnsLookup } from "node:dns";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import type { Readable } from "node:stream";
import type { LinkedPage } from "./linked-pages";

/* Ordinary public web pages (an app's site, a case study, a pricing page) are
   read here and sent to Claude as text. Claude's own web fetch only opens
   links that are in the request itself, so links in a job's notes failed
   there. Only public web addresses are ever called: every hop of a redirect
   is checked, and the address is checked again as the connection is made
   (so a site can't switch to a private one in between). */

const TIMEOUT = 15_000;
const MAX_BYTES = 3_000_000;
const MAX_REDIRECTS = 4;
const MAX_PAGES = 6;
const HEADERS = {
  "user-agent": "Mozilla/5.0 (compatible; CreatorDesk/1.0; +https://www.dannightingxle.com)",
  accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
  "accept-encoding": "gzip, deflate, br",
};
// Tests serve their pages locally (host:port, comma-separated).
const TEST_HOSTS = (process.env.STUDIO_TEST_PAGE_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

/** A link that couldn't be read here, and why (in a few plain words). */
export type Unread = { url: string; why: string };
export type WebPages = { pages: LinkedPage[]; unread: Unread[] };

/** Local, private and reserved addresses: never called. */
export function privateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b < 128) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6)?.[1];
  if (mapped) return privateAddress(mapped);
  return v6 === "::" || v6 === "::1" || v6.startsWith("::ffff:") || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
}

/** The link if it's a public web address, else why not. */
async function publicUrl(raw: string): Promise<URL | string> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "it isn't a complete link";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "it isn't a web page link";
  if (TEST_HOSTS.includes(url.host)) return url;
  if (url.username || url.password || (url.port && url.port !== "80" && url.port !== "443")) return "it isn't an ordinary web address";
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  if (isIP(host)) addresses = [host];
  else {
    try {
      addresses = (await lookup(host, { all: true })).map((a) => a.address);
    } catch {
      return "the site couldn't be found";
    }
  }
  if (!addresses.length || addresses.some(privateAddress)) return "it isn't a public web address";
  return url;
}

/** The address lookup used for the connection itself: a private address is refused there too. */
const publicLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, found) => {
    const list = (found ?? []) as LookupAddress[];
    if (!err && (!list.length || list.some((a) => privateAddress(a.address)))) err = Object.assign(new Error(`${hostname} isn't a public address`), { code: "EPRIVATE" });
    if (err) return callback(err, "", 0);
    if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

/** One GET, not following redirects. */
function get(url: URL): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = (url.protocol === "https:" ? https : http).get(url, {
      headers: HEADERS,
      lookup: TEST_HOSTS.includes(url.host) ? undefined : publicLookup,
      signal: AbortSignal.timeout(TIMEOUT),
    });
    req.on("response", resolve);
    req.on("error", reject);
  });
}

/** The start of a response's body, as text (pages can be huge). */
async function readCapped(res: http.IncomingMessage) {
  const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
  const body: Readable = encoding === "gzip" ? res.pipe(createGunzip()) : encoding === "br" ? res.pipe(createBrotliDecompress()) : encoding === "deflate" ? res.pipe(createInflate()) : res;
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of body) {
      chunks.push(chunk as Buffer);
      size += (chunk as Buffer).length;
      if (size >= MAX_BYTES) break;
    }
  } finally {
    res.destroy();
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function fetchPage(raw: string): Promise<{ ok: true; url: URL; html: string; plain: boolean } | { ok: false; why: string }> {
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await publicUrl(current);
    if (typeof url === "string") return { ok: false, why: url };
    const res = await get(url);
    const status = res.statusCode ?? 0;
    const location = res.headers.location;
    const type = String(res.headers["content-type"] ?? "").toLowerCase();
    const plain = type.startsWith("text/plain");
    const done = (why: string) => {
      res.destroy();
      return { ok: false as const, why };
    };
    if (status >= 300 && status < 400 && location) {
      res.destroy();
      current = new URL(location, url).href;
      continue;
    }
    if (status === 401 || status === 403 || status === 429) return done(`the site turned the request away (${status})`);
    if (status < 200 || status >= 300) return done(`the site said ${status}`);
    if (!plain && !type.includes("html")) return done("it's a file, not a web page");
    return { ok: true, url, html: await readCapped(res), plain };
  }
  return { ok: false, why: "it redirected too many times" };
}

const NAMED: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…", pound: "£", euro: "€", copy: "©", trade: "™", middot: "·", bull: "•" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
const tidy = (s: string) =>
  s
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** A web page as plain text: headings, lists, tables, and every link kept as [text](link). */
export function htmlToText(html: string, base: URL) {
  const title = tidy(decode((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").replace(/<[^>]+>/g, ""))).replace(/\n/g, " ");
  const description = decode(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1] ?? "").trim();
  const body = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(head|script|style|noscript|svg|template|iframe|nav)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, inner: string) => {
      const text = tidy(decode(inner.replace(/<[^>]+>/g, " "))).replace(/\n/g, " ");
      let link: string;
      try {
        link = new URL(decode(href), base).href;
      } catch {
        return text;
      }
      if (!/^https?:/.test(link)) return text;
      return !text || text === link ? ` ${link} ` : ` [${text}](${link}) `;
    })
    .replace(/<h([1-6])\b[^>]*>/gi, (_m, n: string) => `\n\n${"#".repeat(Math.min(Number(n) + 1, 4))} `)
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|section|article|header|footer|main|aside|h[1-6]|tr|li|ul|ol|table|blockquote|figure|dd|dt)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<[^>]+>/g, " ");
  return { title, description, text: tidy(decode(body)) };
}

async function readOne(raw: string, maxChars: number): Promise<{ page: LinkedPage } | { unread: Unread }> {
  try {
    const got = await fetchPage(raw);
    if (!got.ok) return { unread: { url: raw, why: got.why } };
    const read = got.plain ? { title: "", description: "", text: tidy(got.html) } : htmlToText(got.html, got.url);
    // A sign-in box with little else, or an empty shell its scripts fill in later.
    if (!got.plain && /<input\b[^>]*type\s*=\s*["']?password/i.test(got.html) && read.text.length < 3000) return { unread: { url: raw, why: "it needs you to log in" } };
    if (read.text.length < 200) return { unread: { url: raw, why: "its content only loads in a browser" } };
    const text = [read.description && read.description !== read.title ? read.description : "", read.text].filter(Boolean).join("\n\n");
    return { page: { url: raw, title: read.title || got.url.hostname, text: text.slice(0, maxChars), files: [] } };
  } catch (e) {
    console.warn("Creator Desk: couldn't read a web page", raw, e);
    const why = (e as { code?: string }).code === "EPRIVATE" ? "it isn't a public web address" : e instanceof Error && /timeout|aborted/i.test(e.name + e.message) ? "it took too long to load" : "it didn't load";
    return { unread: { url: raw, why } };
  }
}

/** A link as found in text, without the full stop or comma after it. */
export const cleanLink = (url: string) => url.replace(/[.,;:!?*]+$/, "");

/** Read these public web pages (a few at most, side by side). Pages and unread links carry the cleaned link. */
export async function readWebPages(urls: string[], maxChars = 60_000): Promise<WebPages> {
  const want = [...new Set(urls.map(cleanLink))].slice(0, MAX_PAGES);
  const results = await Promise.all(want.map((u) => readOne(u, maxChars)));
  return { pages: results.flatMap((r) => ("page" in r ? [r.page] : [])), unread: results.flatMap((r) => ("unread" in r ? [r.unread] : [])) };
}
