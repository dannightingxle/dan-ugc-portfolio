import { randomUUID } from "node:crypto";
import { z } from "zod";
import { claudeTurn, requestText, saveChat } from "../../../../../hub/_lib/studio/chats";
import { makeShootSheet } from "../../../../../hub/_lib/studio/jobs";
import { WeekBody, studioAction } from "../../../../../hub/_lib/studio/request";
import { startTask } from "../../../../../hub/_lib/studio/tasks";

/* Make this week's shoot sheet (and add its hooks to the script bank). Each one
   starts a chat you can reply to. It runs in the background: this answers at
   once, and the page checks on it. */
export const maxDuration = 800; // = JOB_SECONDS in studio/tasks.ts

const Body = WeekBody.extend({ chatId: z.string().regex(/^[0-9a-f-]{36}$/i).optional() });

export async function POST(request: Request, ctx: RouteContext<"/api/hub/studio/[projectId]/week">) {
  const { projectId } = await ctx.params;
  return studioAction(request, projectId, Body, ({ user, body: { chatId = randomUUID(), ...input } }) =>
    startTask(
      user,
      projectId,
      "week",
      async (progress) => {
        const now = new Date().toISOString();
        const chat = await saveChat(user.id, { id: chatId, projectId, title: "New shoot sheet", createdAt: now, updatedAt: now, input, sheetId: null, messages: [{ role: "you", text: requestText(input), at: now }] });
        return claudeTurn(user.id, chat, () => makeShootSheet(user, projectId, input, progress));
      },
      chatId,
    ),
  );
}
