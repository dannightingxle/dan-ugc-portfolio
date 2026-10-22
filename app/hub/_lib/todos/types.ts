/* Your to-dos: things to do, chase and check in on. One-offs, repeating ones
   ("fussy videos, 3 a week"), and work you've sent off: press "Work is
   submitted" and it waits under Awaiting approval, coming back to your to-dos
   if it's still not approved after CHECK_IN_AFTER_DAYS. Safe to import anywhere. */

/** How long submitted work waits before it's back in your to-dos to check in on. Fixed on purpose - change it here. */
export const CHECK_IN_AFTER_DAYS = 3;

export const REPEATS = ["", "daily", "weekly", "fortnightly", "monthly"] as const;
export type Repeat = (typeof REPEATS)[number];
export const REPEAT_LABEL: Record<Repeat, string> = { "": "Doesn't repeat", daily: "Every day", weekly: "Every week", fortnightly: "Every 2 weeks", monthly: "Every month" };

export type Todo = {
  id: string;
  text: string;
  /** The job it's for, if any. */
  projectId: string;
  repeat: Repeat;
  /** Do it by (YYYY-MM-DD). A repeating one is hidden until this date once it's done for this time round. */
  due: string;
  /** "3 fussy videos": how many in all, and how many are left this time round. */
  count: number | null;
  left: number | null;
  /** Sent off and waiting for approval since this time. */
  submittedAt: string;
  /** Ticked off (one-offs stay a while so they can be undone). */
  doneAt: string;
  /** A repeating one's date before it was last ticked, for undo. */
  prevDue: string;
  createdAt: string;
};

export const TODOS_ID = "todo:list";
export const MAX_TODOS = 300;

/** Today on this device, as YYYY-MM-DD. */
export function localDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addRepeat(day: string, repeat: Repeat) {
  const d = new Date(`${day}T12:00:00`);
  if (repeat === "daily") d.setDate(d.getDate() + 1);
  else if (repeat === "weekly") d.setDate(d.getDate() + 7);
  else if (repeat === "fortnightly") d.setDate(d.getDate() + 14);
  else if (repeat === "monthly") d.setMonth(d.getMonth() + 1);
  return localDay(d);
}

/** When a repeating to-do is next due once this time round is done: the next date after today. */
export function nextDue(t: Pick<Todo, "due" | "repeat">, today = localDay()) {
  let next = addRepeat(t.due || today, t.repeat);
  while (next <= today) next = addRepeat(next, t.repeat);
  return next;
}

/** Submitted work that's waited long enough to check in on. */
export function needsCheckIn(t: Pick<Todo, "submittedAt">, now = Date.now()) {
  return Boolean(t.submittedAt) && now - Date.parse(t.submittedAt) >= CHECK_IN_AFTER_DAYS * 86_400_000;
}

/** When submitted work comes back to your to-dos. */
export function checkInOn(t: Pick<Todo, "submittedAt">) {
  return new Date(Date.parse(t.submittedAt) + CHECK_IN_AFTER_DAYS * 86_400_000);
}

/** Where each to-do belongs right now. */
export function placeOf(t: Todo, today = localDay(), now = Date.now()): "todo" | "checkin" | "waiting" | "later" | "done" {
  if (t.doneAt && !t.repeat) return "done";
  if (t.submittedAt) return needsCheckIn(t, now) ? "checkin" : "waiting";
  if (t.repeat && t.doneAt && t.due > today) return "later";
  return "todo";
}

/** This time round finished (ticked, or the last of its count done, or approved). */
export function finish(t: Todo, today = localDay()): Partial<Todo> {
  const doneAt = new Date().toISOString();
  if (!t.repeat) return { doneAt, submittedAt: "", left: t.count };
  return { doneAt, submittedAt: "", prevDue: t.due, due: nextDue(t, today), left: t.count };
}

/** Undo a tick. */
export function unfinish(t: Todo): Partial<Todo> {
  return t.repeat ? { doneAt: "", due: t.prevDue, prevDue: "" } : { doneAt: "" };
}
