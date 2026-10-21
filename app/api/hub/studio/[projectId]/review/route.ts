import { fridayReview } from "../../../../../hub/_lib/studio/jobs";
import { ReviewBody, studioAction } from "../../../../../hub/_lib/studio/request";
import { startTask } from "../../../../../hub/_lib/studio/tasks";

/* The Friday review: what to do more and less of, and a rewritten winners file.
   It runs in the background: this answers at once, and the page checks on it. */
export const maxDuration = 800; // = JOB_SECONDS in studio/tasks.ts

export async function POST(request: Request, ctx: RouteContext<"/api/hub/studio/[projectId]/review">) {
  const { projectId } = await ctx.params;
  return studioAction(request, projectId, ReviewBody, ({ user, body }) =>
    startTask(user, projectId, "review", async (progress) => {
      await fridayReview(user, projectId, body, progress);
      return null;
    }),
  );
}
