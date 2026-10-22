import "server-only";
import { adminClient } from "../supabase/admin";
import { MAX_TODOS, TODOS_ID, type Todo } from "./types";

/* Your to-dos, as one row in hub_workspaces (server-only, scoped to you). */

/** Ticked-off one-offs are kept this long, so a mis-tick can be undone. */
const KEEP_DONE_DAYS = 14;

export async function getTodos(userId: string): Promise<Todo[]> {
  const { data, error } = await adminClient().from("hub_workspaces").select("data").eq("user_id", userId).eq("project_id", TODOS_ID).maybeSingle<{ data: { todos?: Todo[] } }>();
  if (error) throw error;
  return data?.data?.todos ?? [];
}

export async function saveTodos(userId: string, todos: Todo[]): Promise<Todo[]> {
  const cutoff = Date.now() - KEEP_DONE_DAYS * 86_400_000;
  const kept = todos.filter((t) => t.repeat || !t.doneAt || Date.parse(t.doneAt) > cutoff).slice(0, MAX_TODOS);
  const now = new Date().toISOString();
  const { error } = await adminClient().from("hub_workspaces").upsert({ user_id: userId, project_id: TODOS_ID, data: { todos: kept, updatedAt: now }, updated_at: now });
  if (error) throw error;
  return kept;
}
