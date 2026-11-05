import "server-only";
import { randomUUID } from "node:crypto";
import { adminClient } from "./supabase/admin";
import type { HubUser } from "./supabase/server";
import { canUse } from "./features";
import { getTodos, saveTodos } from "./todos/data";
import type { Todo } from "./todos/types";

/* Retainers: a job that comes round every month (Canva, Fussy). The newest
   job in the series carries the repeat; on its date the next month's job is
   added by itself - same brand, contact, fee, terms and brief basics, in the
   stage you chose, with nothing of last month's dates, invoice or script -
   and the series' repeating to-dos move on to it, along with any to-dos you
   set for each month. */

type Retainer = { next: string; stage: string; todos: string };
type Data = Record<string, unknown> & { id: string; brand?: string; title?: string; repeat?: Retainer | null; seriesId?: string; period?: string; deliverables?: Record<string, unknown>[] };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_WORD = new RegExp(`\\b(${MONTHS.map((m) => `${m}|${m.slice(0, 3)}`).join("|")}|Sept)\\b\\.?(\\s+\\d{4})?`, "gi");

/** "2026-12" → "December 2026". */
export const monthLabel = (period: string) => `${MONTHS[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;

/** The same day a month on (the 31st becomes the month's last day). */
export function addMonth(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const next = new Date(Date.UTC(y, m, Math.min(d, last)));
  return next.toISOString().slice(0, 10);
}

/** Last month's title with its month(s) swapped for this one: "Retainer - September and October" → "Retainer - December". */
export function titleFor(title: string, period: string) {
  const month = MONTHS[Number(period.slice(5, 7)) - 1];
  const base = title
    .replace(MONTH_WORD, "")
    // What joined the months up ("and", "&", "/") and any separators left hanging.
    .replace(/\s*(\b(and)\b|&|\/|,)\s*(?=[-–(]|$)/gi, " ")
    .replace(/\(\s*\)/g, "")
    .replace(/\s*[-–:,]\s*(?=[-–(]|$)/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[-–:,]+$/, "")
    .trim();
  return `${base ? base[0].toUpperCase() + base.slice(1) : "Retainer"} - ${month}`;
}

/** Add the next month's job for a retainer (once - a second call for the same month gives the one already made). */
export async function nextInSeries(user: HubUser, projectId: string): Promise<{ id: string; title: string; brand: string; created: boolean }> {
  const db = adminClient();
  const { data: row } = await db.from("hub_projects").select("data").eq("user_id", user.id).eq("id", projectId).maybeSingle<{ data: Data }>();
  const old = row?.data;
  if (!old?.repeat?.next) throw new Error("That job doesn't repeat.");
  const repeat = old.repeat;
  const period = repeat.next.slice(0, 7);
  const seriesId = old.seriesId || old.id;
  const now = new Date().toISOString();
  const after = { ...repeat, next: addMonth(repeat.next) };

  // Already there (added by hand from the job page): the repeat moves on to it.
  const { data: same } = await db.from("hub_projects").select("id, data").eq("user_id", user.id).eq("data->>seriesId", seriesId).eq("data->>period", period).limit(1);
  const existing = (same ?? [])[0] as { id: string; data: Data } | undefined;
  if (existing && existing.id !== old.id) {
    await db.from("hub_projects").update({ data: { ...old, seriesId, repeat: null }, updated_at: now }).eq("user_id", user.id).eq("id", old.id);
    if (!existing.data.repeat) await db.from("hub_projects").update({ data: { ...existing.data, repeat: after }, updated_at: now }).eq("user_id", user.id).eq("id", existing.id);
    return { id: existing.id, title: String(existing.data.title ?? ""), brand: String(existing.data.brand ?? ""), created: false };
  }

  const fresh: Data = {
    ...old,
    id: randomUUID(),
    createdAt: now,
    title: titleFor(String(old.title ?? ""), period),
    stage: repeat.stage || "Briefed",
    seriesId,
    period,
    repeat: after,
    // This month's own: none of last month's dates, invoice, script, notes or follow-ups.
    adIds: [],
    filmBy: "",
    due: "",
    goLive: "",
    paymentStatus: "Not invoiced",
    invoiceNumber: "",
    invoicedOn: "",
    paidOn: "",
    paymentNotes: "",
    script: "",
    notes: "",
    waitingOn: "",
    chaseOn: "",
    lastContact: "",
    // The same videos each month, none done yet.
    deliverables: (old.deliverables ?? []).map((d) => ({ ...d, id: randomUUID(), done: false })),
  };
  const { error } = await db.from("hub_projects").insert({ user_id: user.id, id: fresh.id, data: fresh, updated_at: now });
  if (error) throw error;
  await db.from("hub_projects").update({ data: { ...old, seriesId, repeat: null }, updated_at: now }).eq("user_id", user.id).eq("id", old.id);

  if (await canUse(user, "todos")) {
    const todos = await getTodos(user.id);
    // Repeating to-dos for the retainer follow it to the new month's job; this month's own to-dos are added.
    const moved = todos.map((t) => (t.projectId === old.id && t.repeat ? { ...t, projectId: fresh.id } : t));
    const added: Todo[] = repeat.todos
      .split("\n")
      .map((l) => l.replace(/^[-*•]\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 10)
      .map((text, i) => ({ id: randomUUID(), text: text.slice(0, 300), projectId: fresh.id, repeat: "", due: "", count: null, left: null, submittedAt: "", doneAt: "", prevDue: "", createdAt: new Date(Date.now() + i).toISOString() }));
    if (added.length || moved.some((t, i) => t !== todos[i])) await saveTodos(user.id, [...moved, ...added]);
  }
  return { id: fresh.id, title: String(fresh.title), brand: String(fresh.brand ?? ""), created: true };
}

/** Retainers whose next month is due by today, for the morning run. */
export async function dueRetainers(today: string) {
  const { data } = await adminClient().from("hub_projects").select("user_id, id, next:data->repeat->>next").not("data->repeat->>next", "is", null);
  return ((data ?? []) as { user_id: string; id: string; next: string | null }[]).filter((r) => r.next && r.next <= today);
}
