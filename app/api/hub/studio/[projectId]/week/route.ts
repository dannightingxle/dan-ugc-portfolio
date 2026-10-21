import { makeShootSheet } from "../../../../../hub/_lib/studio/jobs";
import { WeekBody, studioAction } from "../../../../../hub/_lib/studio/request";
import { startTask } from "../../../../../hub/_lib/studio/tasks";

/* Make this week's shoot sheet (and add its hooks to the script bank). It runs
   in the background: this answers at once, and the page checks on it. */
export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/hub/studio/[projectId]/week">) {
  const { projectId } = await ctx.params;
  return studioAction(request, projectId, WeekBody, ({ user, body }) =>
    startTask(user, projectId, "week", async () => {
      const made = await makeShootSheet(user, projectId, body);
      return { id: made.id, oneLine: made.oneLine, couldntOpen: made.couldntOpen };
    }),
  );
}
