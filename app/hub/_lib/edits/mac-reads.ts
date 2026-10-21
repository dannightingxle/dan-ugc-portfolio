import "server-only";
import { randomUUID } from "node:crypto";
import { adminClient } from "../supabase/admin";
import type { LinkedPage } from "../studio/linked-pages";
import type { DeviceAuth } from "./data";

/* Pages that need you logged in (a brand's portal, a Google-login brief):
   Creator Desk can't use your logins, so when your Mac's helper is running,
   it opens them in your own browser and sends back their text. Each request
   is a row in hub_workspaces under "read:<id>" while it's waiting. */

const ONLINE_MS = 45_000;
const WAIT_MS = 75_000;
const MAX_READS = 6;

type Read = { url: string; status: "pending" | "reading" | "done" | "failed"; createdAt: string; title?: string; text?: string; links?: [string, string][]; error?: string };

/** A connected Mac whose helper can read pages, seen in the last 45 seconds. */
export async function macCanRead(userId: string) {
  const { data } = await adminClient().from("hub_devices").select("last_seen, info").eq("user_id", userId).not("token_hash", "is", null);
  return (data ?? []).some((d) => d.last_seen && Date.now() - Date.parse(d.last_seen) < ONLINE_MS && (d.info as { reads?: unknown })?.reads === true);
}

/** Ask the Mac to read these links in your browser; waits up to 75 seconds. Null when no Mac is there to ask. */
export async function readOnMac(userId: string, urls: string[]): Promise<{ pages: LinkedPage[]; read: Set<string>; failed: string[] } | null> {
  const want = [...new Set(urls)].slice(0, MAX_READS);
  if (!want.length || !(await macCanRead(userId))) return null;
  const db = adminClient();
  const ids = want.map(() => `read:${randomUUID()}`);
  const now = new Date().toISOString();
  await db.from("hub_workspaces").insert(ids.map((id, i) => ({ user_id: userId, project_id: id, data: { url: want[i], status: "pending", createdAt: now } satisfies Read })));
  const started = Date.now();
  let rows: { project_id: string; data: Read }[] = [];
  while (Date.now() - started < WAIT_MS) {
    await new Promise((r) => setTimeout(r, 1500));
    const { data } = await db.from("hub_workspaces").select("project_id, data").eq("user_id", userId).in("project_id", ids);
    rows = (data ?? []) as typeof rows;
    if (rows.length && rows.every((r) => r.data.status === "done" || r.data.status === "failed")) break;
  }
  await db.from("hub_workspaces").delete().eq("user_id", userId).in("project_id", ids);

  const pages: LinkedPage[] = [];
  const read = new Set<string>();
  const failed: string[] = [];
  for (const r of rows) {
    const d = r.data;
    if (d.status === "done" && d.text?.trim()) {
      read.add(d.url);
      const links = (d.links ?? []).filter(([, href]) => /^https?:\/\//.test(href)).map(([label, href]) => (label && label !== href ? `[${label}](${href})` : href));
      const text = [d.text.trim(), links.length ? `Links on the page:\n${[...new Set(links)].join("\n")}` : ""].filter(Boolean).join("\n\n");
      pages.push({ url: d.url, title: `${d.title || d.url} (read in your browser)`, text: text.slice(0, 60_000), files: [] });
    } else if (d.status === "failed" && d.error) {
      failed.push(`${d.url} - your Mac couldn't read it: ${d.error}.`);
    } else if (d.status !== "done") {
      failed.push(`${d.url} - your Mac didn't get to it in time (is the Creator Desk Helper still running?).`);
    }
  }
  return { pages, read, failed };
}

/** For the helper: pages waiting to be read (asked for in the last two minutes). */
export async function readsFor(auth: DeviceAuth) {
  const { data } = await adminClient().from("hub_workspaces").select("project_id, data").eq("user_id", auth.userId).like("project_id", "read:%");
  const recent = Date.now() - 120_000;
  return ((data ?? []) as { project_id: string; data: Read }[])
    .filter((r) => r.data.status === "pending" && Date.parse(r.data.createdAt) > recent)
    .map((r) => ({ id: r.project_id, url: r.data.url }));
}

/** The helper claims a read (so a second Mac doesn't open it too), then sends what it found. */
export async function reportRead(auth: DeviceAuth, id: string, body: { claim?: boolean; title?: string; url?: string; text?: string; links?: [string, string][]; error?: string }) {
  if (!id.startsWith("read:")) return { ok: false };
  const db = adminClient();
  const { data: row } = await db.from("hub_workspaces").select("data").eq("user_id", auth.userId).eq("project_id", id).maybeSingle<{ data: Read }>();
  if (!row) return { ok: false };
  if (body.claim) {
    if (row.data.status !== "pending") return { ok: false };
    const { data } = await db
      .from("hub_workspaces")
      .update({ data: { ...row.data, status: "reading" }, updated_at: new Date().toISOString() })
      .eq("user_id", auth.userId)
      .eq("project_id", id)
      .eq("data->>status", "pending")
      .select("project_id");
    return { ok: Boolean(data?.length) };
  }
  if (row.data.status !== "reading") return { ok: false };
  const next: Read = body.error
    ? { ...row.data, status: "failed", error: body.error.slice(0, 500) }
    : { ...row.data, status: "done", title: (body.title ?? "").slice(0, 300), text: (body.text ?? "").slice(0, 60_000), links: (body.links ?? []).slice(0, 300) };
  await db.from("hub_workspaces").update({ data: next, updated_at: new Date().toISOString() }).eq("user_id", auth.userId).eq("project_id", id);
  return { ok: true };
}
