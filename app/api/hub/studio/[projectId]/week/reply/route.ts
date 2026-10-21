import { z } from "zod";
import { StudioError } from "../../../../../../hub/_lib/studio/claude";
import { addMessage, claudeTurn, getChat } from "../../../../../../hub/_lib/studio/chats";
import { makeShootSheet, reviseShootSheet } from "../../../../../../hub/_lib/studio/jobs";
import { studioAction } from "../../../../../../hub/_lib/studio/request";
import { startTask } from "../../../../../../hub/_lib/studio/tasks";

/* A reply in a shoot sheet's chat. Once there's a sheet, Claude changes it as
   asked; if the first try didn't work, it tries again with what you've added. */
export const maxDuration = 800; // = JOB_SECONDS in studio/tasks.ts

const Body = z.object({ chatId: z.string().regex(/^[0-9a-f-]{36}$/i), message: z.string().trim().min(1, "Write a reply first.").max(20_000) });

export async function POST(request: Request, ctx: RouteContext<"/api/hub/studio/[projectId]/week/reply">) {
  const { projectId } = await ctx.params;
  return studioAction(request, projectId, Body, async ({ user, body }) => {
    const chat = await getChat(user.id, projectId, body.chatId);
    if (!chat) throw new StudioError("That chat's gone - start a new shoot sheet.");
    return startTask(
      user,
      projectId,
      "week",
      async (progress) => {
        const asked = await addMessage(user.id, chat, { role: "you", text: body.message });
        // Everything you've added since the first request, for a fresh try.
        const followUps = asked.messages.slice(1).filter((m) => m.role === "you").map((m) => m.text);
        return claudeTurn(user.id, asked, () =>
          chat.sheetId ? reviseShootSheet(user, projectId, chat, body.message, progress) : makeShootSheet(user, projectId, { ...chat.input, followUps }, progress),
        );
      },
      chat.id,
    );
  });
}
