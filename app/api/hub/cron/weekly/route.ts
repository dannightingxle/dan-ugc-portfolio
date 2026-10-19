import { adminClient, adminEnabled } from "../../../../hub/_lib/supabase/admin";
import { canUse } from "../../../../hub/_lib/features";
import { billingFor } from "../../../../hub/_lib/billing/stripe";
import { BRAND_ID } from "../../../../hub/_lib/studio/data";
import { apifyEnabled } from "../../../../hub/_lib/studio/apify";
import { getBrand, makeBrandPlan, refreshStats, scanIdeas } from "../../../../hub/_lib/studio/brand";

/* Monday and Thursday mornings (vercel.json): pull stats, a quarter of an hour
   later look for new ideas, and on Mondays a quarter of an hour after that
   make the week's personal brand plan. Stats are pulled for anyone who gets
   either; ideas for those who switched on "Find ideas twice a week", the plan
   for those who switched on "Plan my week automatically". Vercel calls this
   with CRON_SECRET. */
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Not found." }, { status: 404 });
  if (!adminEnabled || !process.env.ANTHROPIC_API_KEY) return Response.json({ skipped: "not set up" });
  const asked = new URL(request.url).searchParams.get("step");
  const step = asked === "plan" || asked === "ideas" ? asked : "stats";
  const monday = new Date().getUTCDay() === 1;

  const admin = adminClient();
  const { data: rows } = await admin
    .from("hub_workspaces")
    .select("user_id, autoPlan:data->autoPlan, autoIdeas:data->autoIdeas")
    .eq("project_id", BRAND_ID)
    .returns<{ user_id: string; autoPlan: unknown; autoIdeas: unknown }[]>();
  const wanted = (r: { autoPlan: unknown; autoIdeas: unknown }) =>
    step === "plan" ? r.autoPlan === true : step === "ideas" ? r.autoIdeas === true : r.autoIdeas === true || (r.autoPlan === true && monday);
  const done: string[] = [];
  for (const { user_id } of (rows ?? []).filter(wanted)) {
    try {
      const { data } = await admin.auth.admin.getUserById(user_id);
      const u = data.user;
      if (!u?.email) continue;
      const user = { id: u.id, email: u.email, name: (u.user_metadata?.name as string) || u.email.split("@")[0], currency: "GBP" as const };
      if (!(await canUse(user, "brand")) || !(await billingFor(user)).hasAccess) continue;
      if (step === "stats") {
        if (apifyEnabled) await refreshStats(user.id);
      } else if (step === "ideas") {
        await scanIdeas(user);
      } else {
        await makeBrandPlan(user, { videos: 5, filmingOn: "", notes: (await getBrand(user.id)).notes, uploads: [] });
      }
      done.push(user.id);
    } catch (e) {
      console.error("Creator Desk: weekly", step, "failed for", user_id, e);
    }
  }
  return Response.json({ step, done: done.length });
}
