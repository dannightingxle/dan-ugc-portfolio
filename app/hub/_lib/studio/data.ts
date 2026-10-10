import "server-only";
import { adminClient, adminEnabled } from "../supabase/admin";
import { accountsEnabled } from "../supabase/config";
import { currentUser, type HubUser } from "../supabase/server";
import { isOwner } from "../owners";
import { readWorkspace, type SheetData, type SheetSummary, type Workspace } from "./types";

/* Studio storage. Owners only for now, so the tables are server-only and
   every read and write is scoped to the signed-in owner's own rows here. */

export const claudeEnabled = Boolean(process.env.ANTHROPIC_API_KEY);

/** The signed-in owner, or null (Studio stays hidden from everyone else). */
export async function studioUser(): Promise<HubUser | null> {
  if (!accountsEnabled || !adminEnabled) return null;
  const user = await currentUser();
  return user && (await isOwner(user.email)) ? user : null;
}

/** For API routes: the owner, or a 404 so Studio's existence isn't revealed. */
export async function studioApiUser(): Promise<{ ok: true; user: HubUser } | { ok: false; response: Response }> {
  const user = await studioUser();
  return user ? { ok: true, user } : { ok: false, response: Response.json({ error: "Not found." }, { status: 404 }) };
}

export async function getWorkspace(userId: string, projectId: string): Promise<Workspace> {
  const { data, error } = await adminClient()
    .from("hub_workspaces")
    .select("data")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .maybeSingle<{ data: unknown }>();
  if (error) throw error;
  return readWorkspace(data?.data);
}

export async function saveWorkspace(userId: string, projectId: string, ws: Workspace): Promise<Workspace> {
  const next = { ...ws, updatedAt: new Date().toISOString() };
  const { error } = await adminClient()
    .from("hub_workspaces")
    .upsert({ user_id: userId, project_id: projectId, data: next, updated_at: next.updatedAt });
  if (error) throw error;
  return next;
}

export async function listSheets(userId: string, projectId: string): Promise<SheetSummary[]> {
  const { data, error } = await adminClient()
    .from("hub_shoot_sheets")
    .select("id, title, created_at, data")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, title: r.title, createdAt: r.created_at, videos: (r.data as SheetData)?.videos?.length ?? 0 }));
}

export async function getSheet(userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await adminClient()
    .from("hub_shoot_sheets")
    .select("id, project_id, title, data, created_at")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle<{ id: string; project_id: string; title: string; data: SheetData; created_at: string }>();
  if (error) throw error;
  return data;
}

export async function saveSheet(userId: string, projectId: string, title: string, sheet: SheetData): Promise<string> {
  const { data, error } = await adminClient()
    .from("hub_shoot_sheets")
    .insert({ user_id: userId, project_id: projectId, title, data: sheet })
    .select("id")
    .single<{ id: string }>();
  if (error) throw error;
  return data.id;
}

export async function deleteSheet(userId: string, id: string) {
  const { error } = await adminClient().from("hub_shoot_sheets").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
}

/** Project ids come from the browser: keep them to the shape the app makes. */
export function validProjectId(id: unknown): id is string {
  return typeof id === "string" && /^[\w-]{1,80}$/.test(id);
}
