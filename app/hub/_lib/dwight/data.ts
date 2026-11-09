import "server-only";
import { adminClient } from "../supabase/admin";
import { type Conversation, type ConversationSummary, DEFAULT_NAME } from "./types";

/* Where Dwight keeps things: server-only rows in hub_workspaces for the
   signed-in person. Each conversation is a row; the name you gave it is
   another; the latest change it made (so it can be undone) is a third. */

const chatRow = (id: string) => `dwight:chat:${id}`;
const SETTINGS = "dwight:settings";
const UNDO = "dwight:undo";
const MAX_MESSAGES = 120;
const MAX_CHATS = 40;

/** What the latest change was: each job as it was before (null: Dwight made it), and each to-do as it was (null: Dwight added it). */
export type UndoRecord = {
  conversationId: string;
  messageId: string;
  jobs: { id: string; before: Record<string, unknown> | null }[];
  todos: { id: string; before: Record<string, unknown> | null }[];
};

const db = () => adminClient().from("hub_workspaces");

async function getRow<T>(userId: string, id: string): Promise<T | null> {
  const { data, error } = await db().select("data").eq("user_id", userId).eq("project_id", id).maybeSingle<{ data: T }>();
  if (error) throw error;
  return data?.data ?? null;
}
async function setRow(userId: string, id: string, data: unknown) {
  const { error } = await db().upsert({ user_id: userId, project_id: id, data, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function dwightName(userId: string) {
  return (await getRow<{ name?: string }>(userId, SETTINGS))?.name?.trim() || DEFAULT_NAME;
}
export async function setDwightName(userId: string, name: string) {
  await setRow(userId, SETTINGS, { name: name.trim().slice(0, 40) || DEFAULT_NAME });
}

export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  const { data, error } = await db()
    .select("id:data->>id, title:data->>title, updatedAt:data->>updatedAt")
    .eq("user_id", userId)
    .like("project_id", "dwight:chat:%");
  if (error) throw error;
  return ((data ?? []) as unknown as ConversationSummary[]).filter((c) => c.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export const getConversation = (userId: string, id: string) => getRow<Conversation>(userId, chatRow(id));

export async function saveConversation(userId: string, c: Conversation) {
  await setRow(userId, chatRow(c.id), { ...c, messages: c.messages.slice(-MAX_MESSAGES) });
}

/** Only so many conversations are kept: the oldest go (checked when a new one starts). */
export async function pruneConversations(userId: string) {
  const all = await listConversations(userId);
  for (const old of all.slice(MAX_CHATS)) await deleteConversation(userId, old.id);
}

export async function deleteConversation(userId: string, id: string) {
  const { error } = await db().delete().eq("user_id", userId).eq("project_id", chatRow(id));
  if (error) throw error;
}

export const getUndo = (userId: string) => getRow<UndoRecord>(userId, UNDO);
export const setUndo = (userId: string, u: UndoRecord) => setRow(userId, UNDO, u);
export async function clearUndo(userId: string) {
  await db().delete().eq("user_id", userId).eq("project_id", UNDO);
}
