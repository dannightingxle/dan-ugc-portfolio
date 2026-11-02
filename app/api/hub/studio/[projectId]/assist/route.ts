import { z } from "zod";
import { addYourMessage, assistChat, assistFailed, runAssist } from "../../../../../hub/_lib/studio/assistant";
import { studioErrorMessage } from "../../../../../hub/_lib/studio/claude";
import { studioApiUser, validProjectId } from "../../../../../hub/_lib/studio/data";
import { studioAction } from "../../../../../hub/_lib/studio/request";
import { startTask } from "../../../../../hub/_lib/studio/tasks";

/* The job assistant: GET the conversation; POST a message and Claude answers
   in the background (and makes the changes it calls for). */
export const maxDuration = 800; // = JOB_SECONDS in studio/tasks.ts

export async function GET(_request: Request, ctx: RouteContext<"/api/hub/studio/[projectId]/assist">) {
  const { projectId } = await ctx.params;
  const auth = await studioApiUser();
  if (!auth.ok) return auth.response;
  if (!validProjectId(projectId)) return Response.json({ error: "Unknown job." }, { status: 400 });
  return Response.json({ messages: await assistChat(auth.user.id, projectId) });
}

const Body = z.object({ text: z.string().trim().min(1, "Write something first.").max(100_000), tab: z.string().max(20).default("") });

export async function POST(request: Request, ctx: RouteContext<"/api/hub/studio/[projectId]/assist">) {
  const { projectId } = await ctx.params;
  return studioAction(request, projectId, Body, async ({ user, body }) => {
    await addYourMessage(user.id, projectId, body.text);
    return startTask(user, projectId, "assist", async (progress) => {
      try {
        await runAssist(user, projectId, body.tab, progress);
      } catch (e) {
        await assistFailed(user.id, projectId, `Sorry - I couldn't answer that: ${studioErrorMessage(e)}`);
        throw e;
      }
      return null;
    });
  });
}
