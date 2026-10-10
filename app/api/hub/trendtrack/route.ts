import { apiUser } from "../../../hub/_lib/api-auth";
import { adminClient, adminEnabled } from "../../../hub/_lib/supabase/admin";
import { checkKey, ownKey, trendTrackFor } from "../../../hub/_lib/trendtrack-access";
import { crossSite } from "../../../hub/_lib/same-origin";

/* A creator connecting their own TrendTrack account. The key is checked with
   TrendTrack, then stored where only the server can read it - this route never
   sends it back, just whether it's connected and to which workspace. */

async function status(user: Parameters<typeof trendTrackFor>[0]) {
  const [tt, own] = await Promise.all([trendTrackFor(user), user ? ownKey(user.id) : null]);
  return {
    connected: Boolean(own),
    workspace: own?.workspace ?? null,
    // "own" | "owner" | "shared" when ads are live, else null.
    via: tt.mode === "live" ? tt.via : null,
    canConnect: adminEnabled,
  };
}

export async function GET() {
  const auth = await apiUser({ needsAccess: false });
  if (!auth.ok) return auth.response;
  return Response.json(await status(auth.user));
}

export async function POST(request: Request) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  if (!auth.user || !adminEnabled) return Response.json({ error: "Connecting TrendTrack isn't available yet." }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  if (apiKey.length < 10 || apiKey.length > 500 || /\s/.test(apiKey)) {
    return Response.json({ error: "That doesn't look like a TrendTrack API key." }, { status: 400 });
  }
  const check = await checkKey(apiKey);
  if (!check.ok) return Response.json({ error: check.error }, { status: 400 });
  const { error } = await adminClient()
    .from("hub_trendtrack_keys")
    .upsert({ user_id: auth.user.id, api_key: apiKey, workspace: check.workspace, created_at: new Date().toISOString() });
  if (error) {
    console.error("Creator Desk: couldn't save TrendTrack key", error);
    return Response.json({ error: "Couldn't save that - please try again." }, { status: 500 });
  }
  return Response.json(await status(auth.user));
}

export async function DELETE(request: Request) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const auth = await apiUser({ needsAccess: false });
  if (!auth.ok) return auth.response;
  if (auth.user && adminEnabled) await adminClient().from("hub_trendtrack_keys").delete().eq("user_id", auth.user.id);
  return Response.json(await status(auth.user));
}
