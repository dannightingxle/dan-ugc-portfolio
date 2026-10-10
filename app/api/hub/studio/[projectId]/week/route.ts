import { makeShootSheet } from "../../../../../hub/_lib/studio/jobs";
import { WeekBody, studioAction } from "../../../../../hub/_lib/studio/request";

/* Make this week's shoot sheet (and add its hooks to the script bank). */
export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/hub/studio/[projectId]/week">) {
  const { projectId } = await ctx.params;
  return studioAction(request, projectId, WeekBody, ({ user, body }) => makeShootSheet(user, projectId, body));
}
