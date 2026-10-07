import "server-only";

/** Owners (HUB_OWNER_EMAILS, comma-separated) never pay, can use the server's
    TrendTrack key and can open /hub/admin. */
export function isOwner(email: string | null | undefined) {
  if (!email) return false;
  return (process.env.HUB_OWNER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}
