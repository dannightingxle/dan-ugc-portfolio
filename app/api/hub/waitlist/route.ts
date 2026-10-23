import { adminClient, adminEnabled } from "../../../hub/_lib/supabase/admin";

/* The Creator Desk waitlist (while BRAND.waitlist is on): first name, last name and
   email. Entries are stored in hub_feedback with page "waitlist" - an existing table,
   so there's no SQL to run - and listed on /hub/admin under "Waitlist" (with a CSV
   download). The message is JSON so the admin page can show each part separately
   (the table's own email column is filled from the signed-in user, and these people
   aren't signed in). Signing up again with the same email doesn't add a second entry. */

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

  // (An older page sent one "name" field: its first word is the first name.)
  const [oldFirst = "", ...oldRest] = text(body.name, 160).split(/\s+/);
  const firstName = text(body.firstName, 80) || oldFirst;
  const lastName = text(body.lastName, 80) || oldRest.join(" ");
  const email = text(body.email, 200).toLowerCase();
  if (!firstName || !lastName || !EMAIL.test(email)) {
    return Response.json({ error: "Please add your first name, last name and a valid email." }, { status: 400 });
  }
  const entry = { firstName, lastName, name: `${firstName} ${lastName}`, email };

  if (!adminEnabled) {
    console.error("[hub waitlist] Supabase isn't set up - entry not stored:", entry.email);
    return Response.json({ error: "The waitlist isn't open just yet. Please try again soon." }, { status: 503 });
  }

  // Already on the list: say yes again rather than adding them twice.
  const { data: already } = await adminClient().from("hub_feedback").select("id").eq("page", "waitlist").ilike("message", `%"email":"${email}"%`).limit(1);
  if (already?.length) return Response.json({ ok: true });

  const { error } = await adminClient()
    .from("hub_feedback")
    .insert({ message: JSON.stringify(entry), page: "waitlist" });
  if (error) {
    console.error("[hub waitlist] insert failed", error.message);
    return Response.json({ error: "Something went wrong saving that. Please try again." }, { status: 500 });
  }
  return Response.json({ ok: true });
}
