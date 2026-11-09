import "server-only";
import { adminClient } from "../supabase/admin";
import { getTodos, saveTodos } from "../todos/data";
import type { Todo } from "../todos/types";
import { clearUndo, getConversation, getUndo, saveConversation } from "./data";

/* Undo Dwight's latest change: each job back as it was (one it added is
   taken away again) and each to-do back as it was (one it added goes). */

export class UndoError extends Error {}

export async function undoLatest(userId: string, conversationId: string, messageId: string) {
  const u = await getUndo(userId);
  if (!u || u.conversationId !== conversationId || u.messageId !== messageId) throw new UndoError("Only the latest change can be undone.");
  const db = adminClient();
  const now = new Date().toISOString();
  for (const j of u.jobs) {
    if (j.before) await db.from("hub_projects").update({ data: j.before, updated_at: now }).eq("user_id", userId).eq("id", j.id);
    else await db.from("hub_projects").delete().eq("user_id", userId).eq("id", j.id);
  }
  if (u.todos.length) {
    let todos = await getTodos(userId);
    for (const t of u.todos) {
      if (!t.before) todos = todos.filter((x) => x.id !== t.id);
      else todos = todos.some((x) => x.id === t.id) ? todos.map((x) => (x.id === t.id ? (t.before as Todo) : x)) : [...todos, t.before as Todo];
    }
    await saveTodos(userId, todos);
  }
  await clearUndo(userId);
  const convo = await getConversation(userId, conversationId);
  if (convo) {
    convo.messages = convo.messages.map((m) => (m.id === messageId ? { ...m, undone: true } : m));
    await saveConversation(userId, convo);
  }
  return { jobs: u.jobs.filter((j) => j.before).map((j) => j.id), removed: u.jobs.filter((j) => !j.before).map((j) => j.id), todos: u.todos.length > 0 };
}
