import {
  COMMUNITY,
  FORMATS,
  GOAL,
  GUARANTEE,
  HOURS,
  PRICE,
  STAGE,
  STRUGGLES,
  type WaitlistEntry,
} from "../../waitlist/questions";

/* Receives a waitlist submission, validates it and forwards it to a Google
   Apps Script web app that appends a row to the waitlist Google Sheet.
   Setup lives in WAITLIST.md; the script itself is scripts/waitlist-sheet.gs. */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(v: unknown, max = 2000) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function oneOf(v: unknown, options: readonly string[]) {
  return typeof v === "string" && options.includes(v) ? v : "";
}

function someOf(v: unknown, options: readonly string[]) {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && options.includes(x)) : [];
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  // Honeypot: a hidden field real people never fill in. Pretend it worked.
  if (text(body.company)) return Response.json({ ok: true });

  const entry: WaitlistEntry = {
    name: text(body.name, 120),
    email: text(body.email, 200).toLowerCase(),
    handle: text(body.handle, 120),
    stage: oneOf(body.stage, STAGE),
    goal: oneOf(body.goal, GOAL),
    hours: oneOf(body.hours, HOURS),
    struggles: someOf(body.struggles, STRUGGLES),
    wishlist: text(body.wishlist),
    formats: someOf(body.formats, FORMATS),
    price: oneOf(body.price, PRICE),
    guarantee: oneOf(body.guarantee, GUARANTEE),
    community: oneOf(body.community, COMMUNITY),
    notes: text(body.notes),
  };

  if (!entry.name || !EMAIL.test(entry.email)) {
    return Response.json({ error: "Please add your name and a valid email." }, { status: 400 });
  }

  const webhook = process.env.WAITLIST_SHEET_URL;
  if (!webhook) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[waitlist] WAITLIST_SHEET_URL not set - submission not stored:", entry);
      return Response.json({ ok: true });
    }
    console.error("[waitlist] WAITLIST_SHEET_URL is not configured");
    return Response.json({ error: "The waitlist isn't open just yet. Please try again soon." }, { status: 500 });
  }

  try {
    // Apps Script answers POSTs with a redirect to the result; fetch follows it.
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: process.env.WAITLIST_SHEET_SECRET ?? "",
        submittedAt: new Date().toISOString(),
        ...entry,
      }),
    });
    const result = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !result?.ok) throw new Error(result?.error ?? `HTTP ${res.status}`);
  } catch (err) {
    console.error("[waitlist] Failed to store submission:", err, entry);
    return Response.json({ error: "Something went wrong saving your answers. Please try again." }, { status: 502 });
  }

  return Response.json({ ok: true });
}
