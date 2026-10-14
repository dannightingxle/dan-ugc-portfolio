import { adminClient, adminEnabled } from "../../../hub/_lib/supabase/admin";

/* The Creator Desk waitlist (while BRAND.waitlist is on). Entries are stored in
   hub_feedback with page "waitlist" - an existing table, so there's no SQL to run -
   and listed on /hub/admin under "Waitlist". The message is JSON so the admin
   page can show name, email and handle separately (the table's own email column
   is filled from the signed-in user, and these people aren't signed in). */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(v: unknown, max: number) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  // Honeypot: a hidden field real people never fill in. Pretend it worked.
  if (text(body.company, 200)) return Response.json({ ok: true });

  const entry = {
    name: text(body.name, 120),
    email: text(body.email, 200).toLowerCase(),
    handle: text(body.handle, 120),
  };
  if (!entry.name || !EMAIL.test(entry.email)) {
    return Response.json({ error: "Please add your name and a valid email." }, { status: 400 });
  }

  if (!adminEnabled) {
    console.error("[hub waitlist] Supabase isn't set up - entry not stored:", entry.email);
    return Response.json({ error: "The waitlist isn't open just yet. Please try again soon." }, { status: 503 });
  }

  const { error } = await adminClient()
    .from("hub_feedback")
    .insert({ message: JSON.stringify(entry), page: "waitlist" });
  if (error) {
    console.error("[hub waitlist] insert failed", error.message);
    return Response.json({ error: "Something went wrong saving that. Please try again." }, { status: 500 });
  }
  return Response.json({ ok: true });
}
