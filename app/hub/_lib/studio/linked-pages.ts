/* Briefs often arrive as a link to a public Notion page or Google Doc. Both
   load their content with JavaScript, so a plain fetch (and Claude's web
   fetch) only sees an empty app shell. This reads them the way their own
   apps do: Notion's public page data, and Google Docs' HTML export, then
   turns them into plain text with every link kept. Only these two fixed
   hosts are ever called; the link just supplies the page or document id. */

/** A file uploaded into a linked page, at a lasting public link. */
export type PageFile = { kind: "image" | "video" | "file"; name: string; url: string };
export type LinkedPage = { url: string; title: string; text: string; files: PageFile[] };
/** An image from a linked page, downloaded so Claude can look at it. */
export type PageImage = { name: string; mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp"; data: string };
export type LinkedPages = { pages: LinkedPage[]; images: PageImage[]; failed: string[] };

const MAX_LINKS = 5;
const MAX_CHARS = 60_000;
// Images Claude looks at: enough for a brief's photos, well inside a request's size limit.
const MAX_IMAGES = 12;
const MAX_IMAGE_BYTES = 3_500_000;
const MAX_IMAGES_BYTES = 15_000_000;
const TIMEOUT = 20_000;
// Both sites turn away requests that don't say who they are.
const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; CreatorDesk/1.0; +https://www.dannightingxle.com)" };

const NOTION_HOST = /(^|\.)notion\.(so|site|com)$/i;
// Tests point these at a local stand-in.
const NOTION_API = process.env.NOTION_API_BASE || "https://www.notion.so";
const GDOCS = process.env.GDOCS_BASE || "https://docs.google.com";

/** The 32-character page id at the end of a Notion link ("…-3faffc8b9a20810a8fc1ecd088d72f16"), as a UUID. */
export function notionPageId(url: URL) {
  const hex = url.pathname.replace(/-/g, "").match(/[0-9a-f]{32}$/i)?.[0] ?? url.searchParams.get("p")?.replace(/-/g, "").match(/^[0-9a-f]{32}$/i)?.[0];
  return hex ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`.toLowerCase() : null;
}

export function googleDocId(url: URL) {
  return url.hostname === "docs.google.com" ? (url.pathname.match(/^\/document\/d\/([\w-]{20,})/)?.[1] ?? null) : null;
}

/** Notion and Google Docs links in some text, at most a few. */
export function readableLinks(text: string) {
  const out: { url: string; kind: "notion" | "gdoc"; id: string }[] = [];
  for (const raw of text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? []) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    const notion = NOTION_HOST.test(url.hostname) ? notionPageId(url) : null;
    const gdoc = googleDocId(url);
    const item = notion ? { url: raw, kind: "notion" as const, id: notion } : gdoc ? { url: raw, kind: "gdoc" as const, id: gdoc } : null;
    if (item && !out.some((o) => o.id === item.id)) out.push(item);
  }
  return out.slice(0, MAX_LINKS);
}

// ---------------------------------------------------------------- Notion

type Rich = [string, ([string, unknown?] | string[])[]?][];
type Block = {
  id: string;
  type: string;
  properties?: Record<string, Rich>;
  content?: string[];
  format?: Record<string, unknown>;
  collection_id?: string;
  view_ids?: string[];
  space_id?: string;
  last_edited_time?: number;
  created_time?: number;
};
type Collection = { name?: Rich; schema?: Record<string, { name: string; type: string }> };
type Entry<T> = { spaceId?: string; value: { value?: T } & Partial<T> };
type RecordMap = { block?: Record<string, Entry<Block>>; collection?: Record<string, Entry<Collection>> };
const unwrap = <T>(e: Entry<T> | undefined): T | undefined => (e ? ((e.value?.value ?? e.value) as T) : undefined);

/** A lasting public link to a file uploaded into a public Notion page (Notion swaps it for a fresh download link each time). */
export function notionFileUrl(kind: "image" | "file", source: string, blockId: string, spaceId: string) {
  const base = `${NOTION_API}/${kind === "image" ? "image" : "signed"}/${encodeURIComponent(source)}?table=block&id=${blockId}`;
  return `${base}${spaceId ? `&spaceId=${spaceId}` : ""}${kind === "image" ? "&cache=v2" : ""}`;
}

/** Rich text with its links kept as [text](url). */
function richText(rich: Rich | undefined): string {
  return (rich ?? [])
    .map(([text, marks]) => {
      const link = (marks ?? []).find((m) => m[0] === "a")?.[1];
      if (text === "‣") return ""; // a mention of a person, page or date
      return typeof link === "string" && /^https?:\/\//.test(link) && link !== text ? `[${text}](${link})` : text;
    })
    .join("");
}

/** A Notion page's blocks as plain text (headings, lists, tables, toggles, columns, media). */
/** A database's rows as text, keyed by the database block's id (filled in by readNotion). */
type Databases = Record<string, string>;

export function renderNotion(recordMap: RecordMap, pageId: string, databases: Databases = {}) {
  const blocks = recordMap.block ?? {};
  const get = (id: string): Block | undefined => {
    const b = blocks[id]?.value;
    return (b?.value ?? (b as Block | undefined)) || undefined;
  };
  const page = get(pageId);
  if (!page) return null;
  const lines: string[] = [];
  const files: PageFile[] = [];
  const seen = new Set<string>();
  const spaceOf = (id: string, b: Block) => blocks[id]?.spaceId ?? (b as { space_id?: string }).space_id ?? "";

  const walk = (id: string, depth: number) => {
    const b = get(id);
    if (!b || seen.has(id) || depth > 8) return;
    seen.add(id);
    const text = richText(b.properties?.title);
    const indent = "  ".repeat(Math.max(0, depth - 1));
    const source = b.properties?.source?.[0]?.[0] ?? (typeof b.format?.display_source === "string" ? b.format.display_source : "");
    switch (b.type) {
      case "header":
        lines.push("", `## ${text}`);
        break;
      case "sub_header":
        lines.push("", `### ${text}`);
        break;
      case "sub_sub_header":
        lines.push("", `#### ${text}`);
        break;
      case "bulleted_list":
      case "toggle":
        lines.push(`${indent}- ${text}`);
        break;
      case "numbered_list":
        lines.push(`${indent}1. ${text}`);
        break;
      case "to_do":
        lines.push(`${indent}- [ ] ${text}`);
        break;
      case "quote":
      case "callout":
        if (text) lines.push(`> ${text}`);
        break;
      case "divider":
        lines.push("---");
        break;
      case "table": {
        const order = (b.format?.table_block_column_order as string[] | undefined) ?? [];
        for (const rowId of b.content ?? []) {
          const row = get(rowId);
          if (!row) continue;
          seen.add(rowId);
          const cols = order.length ? order : Object.keys(row.properties ?? {});
          lines.push(`| ${cols.map((c) => richText(row.properties?.[c]).replace(/\|/g, "/")).join(" | ")} |`);
        }
        return; // rows done
      }
      case "video":
      case "image":
      case "file":
      case "pdf":
      case "audio":
      case "embed":
      case "bookmark": {
        const name = text || b.type;
        if (/^https?:\/\//.test(source)) lines.push(`[${b.type}: ${name}](${source})`);
        else if (/^attachment:/.test(source)) {
          const kind = b.type === "image" ? "image" : b.type === "video" ? "video" : "file";
          const url = notionFileUrl(kind === "image" ? "image" : "file", source, id, spaceOf(id, b));
          files.push({ kind, name, url });
          lines.push(kind === "image" ? `[image: ${name}](${url}) (attached for you to look at)` : kind === "video" ? `[video: ${name}](${url}) (uploaded to the page)` : `[file: ${name}](${url}) (uploaded to the page)`);
        } else lines.push(`(${b.type} in the Notion page: ${name})`);
        break;
      }
      case "page":
        if (depth > 0) {
          lines.push(`(sub-page: ${text})`);
          return;
        }
        lines.push(`# ${text}`);
        break;
      case "collection_view":
      case "collection_view_page":
        lines.push(databases[id] ?? "(a database that couldn't be read - open the page to see it)");
        return;
      default:
        if (text) lines.push(`${indent}${text}`);
    }
    for (const child of b.content ?? []) walk(child, depth + 1);
  };

  walk(pageId, 0);
  return {
    title: richText(page.properties?.title) || "Notion page",
    text: lines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    files,
  };
}

async function loadNotion(id: string): Promise<RecordMap> {
  const recordMap: RecordMap = { block: {}, collection: {} };
  let cursor: unknown = { stack: [] };
  for (let chunk = 0; chunk < 10; chunk++) {
    const res = await fetch(`${NOTION_API}/api/v3/loadPageChunk`, {
      method: "POST",
      headers: { ...HEADERS, "content-type": "application/json" },
      body: JSON.stringify({ pageId: id, limit: 100, cursor, chunkNumber: chunk, verticalColumns: false }),
      signal: AbortSignal.timeout(TIMEOUT),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Notion said ${res.status}`);
    const data = (await res.json()) as { recordMap?: RecordMap; cursor?: { stack?: unknown[] } };
    Object.assign(recordMap.block!, data.recordMap?.block ?? {});
    Object.assign(recordMap.collection!, data.recordMap?.collection ?? {});
    if (!data.cursor?.stack?.length) break;
    cursor = data.cursor;
  }
  return recordMap;
}

async function readNotion(id: string): Promise<{ title: string; text: string; files: PageFile[] }> {
  const recordMap = await loadNotion(id);
  // Databases in the page (a formats table, a content calendar…): their rows, and the pages of the live ones.
  const databases: Databases = {};
  const files: PageFile[] = [];
  const dbBlocks = Object.entries(recordMap.block ?? {})
    .map(([blockId, e]) => ({ blockId, b: unwrap(e), spaceId: e.spaceId }))
    .filter((x) => (x.b?.type === "collection_view" || x.b?.type === "collection_view_page") && x.b.collection_id && x.b.view_ids?.length)
    .slice(0, MAX_DATABASES);
  await Promise.all(
    dbBlocks.map(async ({ blockId, b, spaceId }) => {
      try {
        const db = await readDatabase(recordMap, b!, spaceId ?? b!.space_id ?? "");
        databases[blockId] = db.text;
        files.push(...db.files);
      } catch (e) {
        console.warn("Creator Desk: couldn't read a Notion database", e);
      }
    }),
  );
  const page = renderNotion(recordMap, id, databases);
  if (page) page.files.push(...files);
  if (!page || !page.text.replace(/^# .*$/m, "").trim()) throw new Error("the page isn't public, or it's empty");
  return page;
}

// Databases: how many per page, and how many of their rows are opened for their own page's text.
const MAX_DATABASES = 3;
const MAX_ROW_PAGES = 12;
// Rows whose status says they're done with come after the live ones (and aren't opened).
const RETIRED = /inactive|archived?|retired|done|complete|old|paused|cancel|rejected/i;

/** One property's value as text. */
function propText(value: Rich | undefined, type: string): string {
  if (!value) return "";
  if (type === "date") {
    const d = (value[0]?.[1] ?? []).find((m) => m[0] === "d")?.[1] as { start_date?: string } | undefined;
    return d?.start_date ?? "";
  }
  return richText(value).replace(/\|/g, "/").replace(/\s+/g, " ").trim();
}

async function readDatabase(page: RecordMap, block: Block, spaceId: string): Promise<{ text: string; files: PageFile[] }> {
  const collection = unwrap(page.collection?.[block.collection_id!]);
  const res = await fetch(`${NOTION_API}/api/v3/queryCollection`, {
    method: "POST",
    headers: { ...HEADERS, "content-type": "application/json" },
    body: JSON.stringify({
      collection: { id: block.collection_id, spaceId },
      collectionView: { id: block.view_ids![0], spaceId },
      loader: { type: "reducer", reducers: { collection_group_results: { type: "results", limit: 100 } }, searchQuery: "", userTimeZone: "Europe/London" },
    }),
    signal: AbortSignal.timeout(TIMEOUT),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Notion said ${res.status}`);
  const data = (await res.json()) as { result?: { reducerResults?: { collection_group_results?: { blockIds?: string[] } } }; recordMap?: RecordMap };
  const ids = data.result?.reducerResults?.collection_group_results?.blockIds ?? [];
  const schema = Object.entries(collection?.schema ?? {});
  const title = schema.find(([, p]) => p.type === "title")?.[0] ?? "title";
  const columns = schema.filter(([k, p]) => k !== title && !["person", "created_by", "last_edited_by", "file", "relation", "rollup", "formula", "button"].includes(p.type));
  const status = columns.find(([, p]) => /status/i.test(p.name) || p.type === "status")?.[0];
  const rows = ids
    .map((rid) => ({ id: rid, b: unwrap(data.recordMap?.block?.[rid]) }))
    .filter((r): r is { id: string; b: Block } => Boolean(r.b))
    .map((r) => ({ ...r, retired: Boolean(status && RETIRED.test(propText(r.b.properties?.[status], "select"))) }))
    // Live rows first, the most recently changed at the top.
    .sort((a, b) => Number(a.retired) - Number(b.retired) || (b.b.last_edited_time ?? 0) - (a.b.last_edited_time ?? 0));
  const day = (t?: number) => (t ? new Date(t).toISOString().slice(0, 10) : "");
  const name = richText(collection?.name) || "Database";
  const lines = [
    `### Database: ${name} (${rows.length} rows${status ? ", live ones first" : ""})`,
    `| ${[schema.find(([k]) => k === title)?.[1].name ?? "Name", ...columns.map(([, p]) => p.name), "Added", "Last changed"].join(" | ")} |`,
    ...rows.map((r) => `| ${[propText(r.b.properties?.[title], "title") || "(untitled)", ...columns.map(([k, p]) => propText(r.b.properties?.[k], p.type)), day(r.b.created_time), day(r.b.last_edited_time)].join(" | ")} |`),
  ];
  // Each live row's own page: the full format, script, notes.
  const files: PageFile[] = [];
  const opened = rows.filter((r) => !r.retired && r.b.content?.length).slice(0, MAX_ROW_PAGES);
  const pages = await Promise.all(
    opened.map(async (r) => {
      try {
        const rendered = renderNotion(await loadNotion(r.id), r.id);
        if (!rendered) return "";
        files.push(...rendered.files);
        return `#### ${name} row: ${propText(r.b.properties?.[title], "title") || "(untitled)"}\n${rendered.text.replace(/^# .*\n?/, "").trim()}`;
      } catch {
        return "";
      }
    }),
  );
  return { text: [...lines, ...pages.filter(Boolean)].join("\n\n").replace(/\n\n(?=\|)/g, "\n"), files };
}

// ---------------------------------------------------------------- Google Docs

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));

/** Google wraps every link as google.com/url?q=<the real link>. */
function unwrapGoogle(href: string) {
  try {
    const u = new URL(decode(href));
    return u.hostname.endsWith("google.com") && u.pathname === "/url" ? (u.searchParams.get("q") ?? u.href) : u.href;
  } catch {
    return href;
  }
}

export function gdocHtmlToText(html: string) {
  const body = html.replace(/[\s\S]*?<body[^>]*>/i, "").replace(/<\/body>[\s\S]*/i, "");
  return decode(
    body
      .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
      .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, inner) => {
        const text = inner.replace(/<[^>]+>/g, "");
        const link = unwrapGoogle(href);
        return link === text ? link : `[${text}](${link})`;
      })
      .replace(/<h[1-6][^>]*>/gi, "\n\n## ")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<\/(p|div|h[1-6]|tr|li|table)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/t[dh]>/gi, " | ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function readGoogleDoc(id: string): Promise<{ title: string; text: string; files: PageFile[] }> {
  const res = await fetch(`${GDOCS}/document/d/${id}/export?format=html`, { headers: HEADERS, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.includes("text/html")) throw new Error(`Google Docs said ${res.status}`);
  const html = await res.text();
  // A doc that isn't shared comes back as Google's sign-in page.
  if (/accounts\.google\.com|ServiceLogin/i.test(res.url) || /accounts\.google\.com\/(ServiceLogin|v3\/signin|signin)/i.test(html)) {
    throw new Error("the doc isn't shared with 'anyone with the link'");
  }
  const title = decode(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "Google Doc").trim();
  const text = gdocHtmlToText(html);
  if (!text) throw new Error("the doc is empty");
  return { title, text, files: [] };
}

/** Open every Notion page and Google Doc linked in the text. Others are left for Claude's web fetch. */
export async function readLinkedPages(text: string): Promise<LinkedPages> {
  const links = readableLinks(text);
  const results = await Promise.all(
    links.map(async (l) => {
      try {
        const page = l.kind === "notion" ? await readNotion(l.id) : await readGoogleDoc(l.id);
        return { ok: true as const, page: { url: l.url, title: page.title, text: page.text.slice(0, MAX_CHARS), files: page.files } };
      } catch (e) {
        const why = e instanceof Error && !/fetch failed|aborted|timeout/i.test(e.message) ? e.message : "it didn't load";
        return { ok: false as const, failed: `${l.url} - ${why}. Paste the page's text instead.` };
      }
    }),
  );
  const pages = results.flatMap((r) => (r.ok ? [r.page] : []));
  return { pages, images: await downloadImages(pages.flatMap((p) => p.files.filter((f) => f.kind === "image"))), failed: results.flatMap((r) => (r.ok ? [] : [r.failed])) };
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

/** The pages' images, so Claude can look at them (screenshots, market cards, photos). One that won't load is just left as a link. */
async function downloadImages(files: PageFile[]): Promise<PageImage[]> {
  const got = await Promise.all(
    files.slice(0, MAX_IMAGES).map(async (f): Promise<PageImage | null> => {
      try {
        const res = await fetch(f.url, { headers: HEADERS, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
        const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().replace("image/jpg", "image/jpeg");
        const mediaType = IMAGE_TYPES.find((t) => t === type);
        if (!res.ok || !mediaType) return null;
        const bytes = Buffer.from(await res.arrayBuffer());
        return bytes.length && bytes.length <= MAX_IMAGE_BYTES ? { name: f.name, mediaType, data: bytes.toString("base64") } : null;
      } catch {
        return null;
      }
    }),
  );
  let total = 0;
  return got.filter((i): i is PageImage => {
    if (!i || total + i.data.length > MAX_IMAGES_BYTES) return false;
    total += i.data.length;
    return true;
  });
}

/** The images as content for Claude, each named so it can be matched to the page text. */
export function imageBlocks(images: PageImage[]) {
  return images.flatMap((i) => [
    { type: "text" as const, text: `Image from the linked page: ${i.name}` },
    { type: "image" as const, source: { type: "base64" as const, media_type: i.mediaType, data: i.data } },
  ]);
}

/** Links in the text that weren't opened here (left for Claude's web fetch). */
export function otherLinks(text: string, pages: LinkedPage[]) {
  const done = new Set(readableLinks(text).map((l) => l.url));
  return (text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? []).filter((u) => !done.has(u) && !pages.some((p) => p.url === u));
}

/** Linked pages as text for Claude and the brief file. */
export function linkedPagesText(pages: LinkedPage[]) {
  return pages.map((p) => `### Linked page: ${p.title}\n(${p.url})\n\n${p.text}`).join("\n\n");
}
