/* Password gate for /hub. When HUB_PASSWORD is set, the hub and its API need a
   cookie holding a hash of it (set by /api/hub/login). Without HUB_PASSWORD the
   hub is open but only ever serves demo data - see source() in trendtrack.ts. */

export const COOKIE = "hub_auth";

export async function tokenFor(password: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("hub:" + password));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}
