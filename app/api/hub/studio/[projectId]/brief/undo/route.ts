import { z } from "zod";
import { undoBriefFill } from "../../../../../../hub/_lib/studio/jobs";
import { studioAction } from "../../../../../../hub/_lib/studio/request";

/* Put a job back as it was before it was filled in from its brief. */
export async function POST(request: Request, ctx: RouteContext<"/api/hub/studio/[projectId]/brief/undo">) {
  const { projectId } = await ctx.params;
  return studioAction(
    request,
    projectId,
    z.object({}).passthrough(),
    async ({ user }) => {
      await undoBriefFill(user, projectId);
      return { ok: true };
    },
    { needsClaude: false },
  );
}
