import { setUpJob } from "../../../../../hub/_lib/studio/jobs";
import { IntakeBody, studioAction } from "../../../../../hub/_lib/studio/request";

/* Set up a job's workspace from the brief, emails, PDFs and links. */
export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/hub/studio/[projectId]/intake">) {
  const { projectId } = await ctx.params;
  return studioAction(request, projectId, IntakeBody, ({ user, body }) => setUpJob(user, projectId, body));
}
