import "server-only";
import type { HubUser } from "./supabase/server";
import { adminClient, adminEnabled } from "./supabase/admin";
import type { TrendTrack } from "./trendtrack-access";

/* Usage metering: every live TrendTrack call is recorded against the creator,
   with the rows it returned (TrendTrack charges per row) and whose key paid -
   the basis for billing usage if the shared key is ever switched on. Without
   accounts it's logged to the server console instead. */

export async function meter(user: HubUser | null, ctx: TrendTrack, endpoint: string, rows: number) {
  if (ctx.mode !== "live") return;
  if (!user || !adminEnabled) {
    console.log(JSON.stringify({ at: new Date().toISOString(), user: user?.id ?? "single-user", endpoint, rows, via: ctx.via }));
    return;
  }
  // Written by the server, not the creator's session, so usage can't be faked.
  const { error } = await adminClient().from("hub_usage").insert({ user_id: user.id, endpoint, rows, via: ctx.via });
  if (error) console.error("Creator Desk: usage not recorded", error);
}
