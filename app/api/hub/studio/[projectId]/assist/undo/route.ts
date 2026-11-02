import { z } from "zod";
import { assistChat, undoAssist } from "../../../../../../hub/_lib/studio/assistant";
import { studioAction } from "../../../../../../hub/_lib/studio/request";

/* Undo the job assistant's latest changes. */
const Body = z.object({ messageId: z.string().uuid() });

export async function POST(request: Request, ctx: RouteContext<"/api/hub/studio/[projectId]/assist/undo">) {
  const { projectId } = await ctx.params;
  return studioAction(
    request,
    projectId,
    Body,
    async ({ user, body }) => {
      const ok = await undoAssist(user.id, projectId, body.messageId);
      return { ok, messages: await assistChat(user.id, projectId) };
    },
    { needsClaude: false },
  );
}
