import { adminClient, adminEnabled } from "../../../../hub/_lib/supabase/admin";
import { canUse } from "../../../../hub/_lib/features";
import { billingFor } from "../../../../hub/_lib/billing/stripe";
import { apifyEnabled } from "../../../../hub/_lib/studio/apify";
import { dailyUsers, refreshAccounts } from "../../../../hub/_lib/accounts/data";

/* Every morning (vercel.json): refresh the Accounts stats for everyone who
   switched on "Refresh every morning". Vercel calls this with CRON_SECRET. */
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Not found." }, { status: 404 });
  if (!adminEnabled || !apifyEnabled) return Response.json({ skipped: "not set up" });
  const done: string[] = [];
  for (const id of await dailyUsers()) {
    try {
      const { data } = await adminClient().auth.admin.getUserById(id);
      const u = data.user;
      if (!u?.email) continue;
      const user = { id: u.id, email: u.email, name: (u.user_metadata?.name as string) || u.email.split("@")[0], currency: "GBP" as const };
      if (!(await canUse(user, "accounts")) || !(await billingFor(user)).hasAccess) continue;
      await refreshAccounts(user.id);
      done.push(user.id);
    } catch (e) {
      console.error("Creator Desk: daily accounts refresh failed for", id, e);
    }
  }
  return Response.json({ done: done.length });
}
