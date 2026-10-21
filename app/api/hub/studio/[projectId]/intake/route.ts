import { setUpJob } from "../../../../../hub/_lib/studio/jobs";
import { IntakeBody, studioAction } from "../../../../../hub/_lib/studio/request";
import { startTask } from "../../../../../hub/_lib/studio/tasks";

/* Set up a job's workspace from the brief, emails, PDFs and links. It runs in
   the background: this answers at once, and the page checks on it. */
export const maxDuration = 800; // = JOB_SECONDS in studio/tasks.ts

export async function POST(request: Request, ctx: RouteContext<"/api/hub/studio/[projectId]/intake">) {
  const { projectId } = await ctx.params;
  return studioAction(request, projectId, IntakeBody, ({ user, body }) =>
    startTask(user, projectId, "intake", async (progress) => {
      await setUpJob(user, projectId, body, progress);
      return null;
    }),
  );
}
