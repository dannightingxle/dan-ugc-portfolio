import { trendTrackFor } from "../../../hub/_lib/trendtrack-access";
import { apiUser } from "../../../hub/_lib/api-auth";

/** Where ad data comes from for this creator: live (and whose key), demo, or not connected. */
export async function GET() {
  const auth = await apiUser({ needsAccess: false });
  if (!auth.ok) return auth.response;
  const tt = await trendTrackFor(auth.user);
  return Response.json(tt.mode === "live" ? { source: "live", via: tt.via } : { source: tt.mode });
}
