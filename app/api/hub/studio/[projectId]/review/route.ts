import { fridayReview } from "../../../../../hub/_lib/studio/jobs";
import { ReviewBody, studioAction } from "../../../../../hub/_lib/studio/request";

/* The Friday review: what to do more and less of, and a rewritten winners file. */
export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/hub/studio/[projectId]/review">) {
  const { projectId } = await ctx.params;
  return studioAction(request, projectId, ReviewBody, ({ user, body }) => fridayReview(user, projectId, body));
}
