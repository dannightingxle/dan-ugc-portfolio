import { EXPERIENCE, HELP_FIRST, HOURS, PAID_JOBS, STAGE, type OnboardingEntry } from "../../mentorship/onboarding";

/* A new member's intro (the form on /start and the "You're in" pages). Sent to
   the same Google Apps Script as the waitlist with kind "onboarding", which the
   script files on its own "Onboarding" tab - see scripts/waitlist-sheet.gs. */

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

  const entry: OnboardingEntry = {
    name: text(body.name, 120),
    email: text(body.email, 200).toLowerCase(),
    tiktok: text(body.tiktok, 200),
    instagram: text(body.instagram, 200),
    otherSocials: text(body.otherSocials, 500),
    portfolio: text(body.portfolio, 500),
    experience: oneOf(body.experience, EXPERIENCE),
    stage: oneOf(body.stage, STAGE),
    paidJobs: oneOf(body.paidJobs, PAID_JOBS),
    hours: oneOf(body.hours, HOURS),
    helpFirst: someOf(body.helpFirst, HELP_FIRST),
    goal: text(body.goal),
    notes: text(body.notes),
  };

  if (!entry.name || !EMAIL.test(entry.email)) {
    return Response.json({ error: "Please add your name and a valid email." }, { status: 400 });
  }

  const webhook = process.env.WAITLIST_SHEET_URL;
  if (!webhook) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[onboarding] WAITLIST_SHEET_URL not set - submission not stored:", entry);
      return Response.json({ ok: true });
    }
    console.error("[onboarding] WAITLIST_SHEET_URL is not configured");
    return Response.json({ error: "This form isn't open just yet. Please try again soon." }, { status: 500 });
  }

  try {
    // Apps Script answers POSTs with a redirect to the result; fetch follows it.
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: process.env.WAITLIST_SHEET_SECRET ?? "",
        kind: "onboarding",
        submittedAt: new Date().toISOString(),
        ...entry,
      }),
    });
    const json = await res.json().catch(() => null);
    // The script names the tab it wrote to; anything else means an older script that filed it as a waitlist row.
    if (!res.ok || !json?.ok || json.kind !== "onboarding") {
      console.error("[onboarding] sheet did not accept it", res.status, json);
      return Response.json({ error: "Something went wrong saving that. Please try again." }, { status: 502 });
    }
  } catch (err) {
    console.error("[onboarding] could not reach the sheet", err);
    return Response.json({ error: "Something went wrong saving that. Please try again." }, { status: 502 });
  }
  return Response.json({ ok: true });
}
