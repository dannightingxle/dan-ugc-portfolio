import "server-only";
import type { HubUser } from "../supabase/server";
import { claudeTurn, getChat } from "./chats";
import { finishShootSheet, type SheetLeg } from "./jobs";
import type { Progress } from "./tasks";

/* Work a background job can hand to a fresh run (see Relay in tasks.ts), by
   name. Each takes what the first run saved and carries the job on. */

type Stage = (user: HubUser, projectId: string, payload: Record<string, unknown>, progress: Progress) => Promise<unknown>;

export const RELAY_STAGES: Record<string, Stage> = {
  // A shoot sheet: the brief has been read; write the sheet, save it, and answer in its chat.
  "sheet-write": async (user, projectId, payload, progress) => {
    const leg = payload.leg as SheetLeg;
    const finish = () => finishShootSheet(user, projectId, leg, progress);
    const chatId = typeof payload.chatId === "string" ? payload.chatId : "";
    const chat = chatId ? await getChat(user.id, projectId, chatId) : null;
    return chat ? claudeTurn(user.id, chat, finish) : finish();
  },
};
