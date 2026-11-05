import { apiUser } from "../../../../../hub/_lib/api-auth";
import { crossSite } from "../../../../../hub/_lib/same-origin";
import { nextInSeries } from "../../../../../hub/_lib/retainers";

/* A retainer's next month, now: the job is added straight away rather than on its date. */
export async function POST(request: Request, ctx: RouteContext<"/api/hub/projects/[id]/next-month">) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  if (!auth.user) return Response.json({ error: "Accounts aren't switched on." }, { status: 400 });
  const { id } = await ctx.params;
  try {
    return Response.json(await nextInSeries(auth.user, id));
  } catch (e) {
    const message = e instanceof Error && e.message === "That job doesn't repeat." ? e.message : "Couldn't add next month's job - try again.";
    if (message !== "That job doesn't repeat.") console.error("Creator Desk retainer:", e);
    return Response.json({ error: message }, { status: message === "That job doesn't repeat." ? 400 : 500 });
  }
}
