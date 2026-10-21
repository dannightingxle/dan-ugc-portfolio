import "server-only";
import { adminClient } from "../supabase/admin";
import { studioErrorMessage } from "./claude";
import type { Upload } from "./jobs";

/* Each shoot sheet is a conversation, like a chat in a Claude Project: what you
   asked for, what Claude made (or why it couldn't), and your replies - more
   context, changes to the sheet, or "try again". One row per chat in
   hub_workspaces under "chat:<project>:<id>". */

export type WeekInput = { videos: number; filmingOn: string; lastWeek: string; trending: string; weekBrief: string; uploads: Upload[] };
export type ChatMessage = {
  role: "you" | "claude";
  text: string;
  at: string;
  /** Claude's turn: the sheet it made or changed. */
  sheetId?: string;
  couldntOpen?: string[];
  /** Claude's turn: it didn't finish, and why (in text). */
  failed?: boolean;
};
export type SheetChat = {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** What the first run was given, so a "try again" starts from the same place. */
  input: WeekInput;
  /** The sheet this chat is about, once one's been made. */
  sheetId: string | null;
  /** Its hooks as added to the script bank, so a revision can swap them. */
  bankEntry?: string;
  messages: ChatMessage[];
};
export type ChatSummary = Pick<SheetChat, "id" | "title" | "updatedAt" | "sheetId"> & { last: ChatMessage | null };

export const validChatId = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id);
const rowId = (projectId: string, id: string) => `chat:${projectId}:${id}`;

export async function getChat(userId: string, projectId: string, id: string): Promise<SheetChat | null> {
  if (!validChatId(id)) return null;
  const { data, error } = await adminClient().from("hub_workspaces").select("data").eq("user_id", userId).eq("project_id", rowId(projectId, id)).maybeSingle<{ data: SheetChat }>();
  if (error) throw error;
  return data?.data ?? null;
}

export async function saveChat(userId: string, chat: SheetChat) {
  const next = { ...chat, updatedAt: new Date().toISOString() };
  const { error } = await adminClient().from("hub_workspaces").upsert({ user_id: userId, project_id: rowId(chat.projectId, chat.id), data: next, updated_at: next.updatedAt });
  if (error) throw error;
  return next;
}

/** Add a message and save. */
export async function addMessage(userId: string, chat: SheetChat, message: Omit<ChatMessage, "at">, patch: Partial<SheetChat> = {}) {
  return saveChat(userId, { ...chat, ...patch, messages: [...chat.messages, { ...message, at: new Date().toISOString() }] });
}

/** The job's chats, newest first (without what each was given - that can hold uploads). */
export async function listChats(userId: string, projectId: string): Promise<ChatSummary[]> {
  const { data, error } = await adminClient()
    .from("hub_workspaces")
    .select("title:data->>title, updatedAt:data->>updatedAt, sheetId:data->>sheetId, id:data->>id, messages:data->messages")
    .eq("user_id", userId)
    .like("project_id", `chat:${projectId}:%`)
    .order("updated_at", { ascending: false })
    .limit(30)
    .returns<{ id: string; title: string; updatedAt: string; sheetId: string | null; messages: ChatMessage[] | null }[]>();
  if (error) throw error;
  return (data ?? []).map(({ messages, ...c }) => ({ ...c, last: messages?.at(-1) ?? null }));
}

export async function deleteChat(userId: string, projectId: string, id: string) {
  if (!validChatId(id)) return;
  const { error } = await adminClient().from("hub_workspaces").delete().eq("user_id", userId).eq("project_id", rowId(projectId, id));
  if (error) throw error;
}

/** What you asked for, as the chat's first message. */
export function requestText(input: WeekInput) {
  const brief = input.weekBrief.trim();
  return [
    `${input.videos} video${input.videos === 1 ? "" : "s"} this week${input.filmingOn ? `, filming ${input.filmingOn}` : ""}.`,
    brief ? `Brief: ${brief.length > 1500 ? `${brief.slice(0, 1500)}…` : brief}` : "No brief from the brand this week.",
    input.lastWeek && `Last week: ${input.lastWeek}`,
    input.trending && `Trending: ${input.trending}`,
    input.uploads.length > 0 && `Attached: ${input.uploads.map((u) => u.name).join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Claude's turn in the chat: the sheet it made or changed, or why it couldn't. */
export async function claudeTurn(userId: string, chat: SheetChat, work: () => Promise<{ id: string; title: string; oneLine: string; couldntOpen: string[]; bankEntry: string }>) {
  try {
    const made = await work();
    await addMessage(userId, chat, { role: "claude", text: made.oneLine, sheetId: made.id, couldntOpen: made.couldntOpen }, { sheetId: made.id, title: made.title, bankEntry: made.bankEntry });
    return { id: made.id, oneLine: made.oneLine, couldntOpen: made.couldntOpen, chatId: chat.id };
  } catch (e) {
    await addMessage(userId, chat, { role: "claude", text: studioErrorMessage(e), failed: true }).catch(() => {});
    throw e;
  }
}
