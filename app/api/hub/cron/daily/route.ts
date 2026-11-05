import { adminClient, adminEnabled } from "../../../../hub/_lib/supabase/admin";
import { canUse } from "../../../../hub/_lib/features";
import { billingFor } from "../../../../hub/_lib/billing/stripe";
import { apifyEnabled } from "../../../../hub/_lib/studio/apify";
import { dailyUsers, refreshAccounts } from "../../../../hub/_lib/accounts/data";
import { dueRetainers, nextInSeries } from "../../../../hub/_lib/retainers";

/* Every morning (vercel.json): add the next month's job for every retainer
   that's due, then refresh the Accounts stats for everyone who switched on
   "Refresh every morning". Vercel calls this with CRON_SECRET. */
export const maxDuration = 300;

async function hubUser(id: string) {
  const { data } = await adminClient().auth.admin.getUserById(id);
  const u = data.user;
  if (!u?.email) return null;
  return { id: u.id, email: u.email, name: (u.user_metadata?.name as string) || u.email.split("@")[0], currency: "GBP" as const };
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Not found." }, { status: 404 });
  if (!adminEnabled) return Response.json({ skipped: "not set up" });

  // Retainers: next month's job, for anyone who still has access.
  const retainers: string[] = [];
  for (const r of await dueRetainers(new Date().toISOString().slice(0, 10))) {
    try {
      const user = await hubUser(r.user_id);
      if (!user || !(await billingFor(user)).hasAccess) continue;
      const made = await nextInSeries(user, r.id);
      retainers.push(made.id);
    } catch (e) {
      console.error("Creator Desk: retainer's next month failed for", r.id, e);
    }
  }

  const done: string[] = [];
  if (apifyEnabled) {
    for (const id of await dailyUsers()) {
      try {
        const user = await hubUser(id);
        if (!user) continue;
        if (!(await canUse(user, "accounts")) || !(await billingFor(user)).hasAccess) continue;
        await refreshAccounts(user.id);
        done.push(user.id);
      } catch (e) {
        console.error("Creator Desk: daily accounts refresh failed for", id, e);
      }
    }
  }
  return Response.json({ retainers: retainers.length, done: done.length });
}
