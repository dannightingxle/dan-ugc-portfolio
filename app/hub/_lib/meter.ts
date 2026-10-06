import { accountsEnabled } from "./supabase/config";
import { currentUser, serverClient } from "./supabase/server";

/* Usage metering - the basis for billing each creator for their own TrendTrack
   usage. Every live call is recorded against the signed-in user with the rows
   it returned (TrendTrack charges per row), in the hub_usage table. Without
   accounts it's logged to the server console instead. */

export async function meter(endpoint: string, rows: number) {
  const user = accountsEnabled ? await currentUser() : null;
  if (!user) {
    console.log(JSON.stringify({ at: new Date().toISOString(), user: "single-user", endpoint, rows }));
    return;
  }
  const db = await serverClient();
  const { error } = await db.from("hub_usage").insert({ endpoint, rows });
  if (error) console.error("Creator Hub: usage not recorded", error);
}
