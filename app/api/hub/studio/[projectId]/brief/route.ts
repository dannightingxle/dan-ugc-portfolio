import { z } from "zod";
import { fillJobFromBrief } from "../../../../../hub/_lib/studio/jobs";
import { Uploads, studioAction } from "../../../../../hub/_lib/studio/request";
import { startTask } from "../../../../../hub/_lib/studio/tasks";

/* Fill a job in from what the client sent (a brand deal, a retainer's new month, any job). Runs in the background. */
export const maxDuration = 800; // = JOB_SECONDS in studio/tasks.ts

const Body = z.object({ material: z.string().max(200_000).default(""), uploads: Uploads }).refine((b) => b.material.trim() || b.uploads.length, "Paste the brief or attach it first.");

export async function POST(request: Request, ctx: RouteContext<"/api/hub/studio/[projectId]/brief">) {
  const { projectId } = await ctx.params;
  return studioAction(request, projectId, Body, ({ user, body }) => startTask(user, projectId, "brief", (progress) => fillJobFromBrief(user, projectId, body, progress)));
}
