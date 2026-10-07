import "server-only";
import { serverClient, type HubUser } from "./supabase/server";
import type { TrendTrack } from "./trendtrack-access";

/* Usage metering: every live TrendTrack call is recorded against the creator,
   with the rows it returned (TrendTrack charges per row) and whose key paid -
   the basis for billing usage if the shared key is ever switched on. Without
   accounts it's logged to the server console instead. */

export async function meter(user: HubUser | null, ctx: TrendTrack, endpoint: string, rows: number) {
  if (ctx.mode !== "live") return;
  if (!user) {
    console.log(JSON.stringify({ at: new Date().toISOString(), user: "single-user", endpoint, rows, via: ctx.via }));
    return;
  }
  const db = await serverClient();
  const { error } = await db.from("hub_usage").insert({ endpoint, rows, via: ctx.via });
  if (error) console.error("Creator Desk: usage not recorded", error);
}
