import "server-only";
import { randomUUID } from "node:crypto";
import { adminClient } from "../supabase/admin";
import type { HubUser } from "../supabase/server";
import type { Upload } from "../studio/jobs";
import type { CreatorProfile, Rule, Script } from "./types";

/* Where scripts are kept: server-only rows in hub_workspaces, scoped to the
   signed-in person. The creator profile (and its rules) is one row; each
   script is its own row - its request, attached files and every version -
   under the job it's for (or "scripts" for the standalone ones). */

const PROFILE_ROW = "creator:profile";
const scriptRow = (scope: string, id: string) => `script:${scope}:${id}`;
const MAX_RULES = 50;

type Stored = Script & { uploads: Upload[] };

export function blankProfile(user: HubUser): CreatorProfile {
  return {
    name: user.name,
    handle: "",
    spelling: user.currency === "USD" || user.currency === "CAD" ? "US" : "UK",
    currency: user.currency,
    niches: "",
    facts: "",
    voiceSample: "",
    wordsUsed: "",
    wordsNever: "",
    products: "",
    rules: [],
  };
}

export async function getProfile(user: HubUser): Promise<CreatorProfile> {
  const { data, error } = await adminClient()
    .from("hub_workspaces")
    .select("data")
    .eq("user_id", user.id)
    .eq("project_id", PROFILE_ROW)
    .maybeSingle<{ data: Partial<CreatorProfile> }>();
  if (error) throw error;
  return { ...blankProfile(user), ...(data?.data ?? {}) };
}

export async function saveProfile(user: HubUser, profile: CreatorProfile) {
  const now = new Date().toISOString();
  const { error } = await adminClient()
    .from("hub_workspaces")
    .upsert({
      user_id: user.id,
      project_id: PROFILE_ROW,
      data: { ...profile, rules: profile.rules.slice(0, MAX_RULES) },
      updated_at: now,
    });
  if (error) throw error;
  return profile;
}

/** Add a rule (from "Save this rule"); the same rule twice is kept once. */
export async function addRule(user: HubUser, text: string): Promise<CreatorProfile> {
  const profile = await getProfile(user);
  const clean = text.trim();
  if (!clean || profile.rules.some((r) => r.text.trim().toLowerCase() === clean.toLowerCase())) return profile;
  const rule: Rule = {
    id: randomUUID(),
    text: clean,
    createdAt: new Date().toISOString(),
  };
  return saveProfile(user, { ...profile, rules: [...profile.rules, rule] });
}

/** A job's scripts (or the standalone ones), the latest worked on first, without the attached files themselves. */
export async function listScripts(userId: string, scope: string): Promise<Script[]> {
  const { data, error } = await adminClient()
    .from("hub_workspaces")
    .select(
      "id:data->>id, title:data->>title, createdAt:data->>createdAt, updatedAt:data->>updatedAt, request:data->request, files:data->files, versions:data->versions",
    )
    .eq("user_id", userId)
    .like("project_id", `script:${scope}:%`);
  if (error) throw error;
  return ((data ?? []) as unknown as Script[]).filter((s) => s.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getScript(userId: string, scope: string, id: string): Promise<Stored | null> {
  const { data, error } = await adminClient()
    .from("hub_workspaces")
    .select("data")
    .eq("user_id", userId)
    .eq("project_id", scriptRow(scope, id))
    .maybeSingle<{ data: Stored }>();
  if (error) throw error;
  return data?.data ?? null;
}

export async function saveScript(userId: string, scope: string, script: Stored) {
  const { error } = await adminClient()
    .from("hub_workspaces")
    .upsert({
      user_id: userId,
      project_id: scriptRow(scope, script.id),
      data: { ...script, versions: script.versions.slice(0, 40) },
      updated_at: script.updatedAt,
    });
  if (error) throw error;
}

export async function deleteScript(userId: string, scope: string, id: string) {
  const { error } = await adminClient().from("hub_workspaces").delete().eq("user_id", userId).eq("project_id", scriptRow(scope, id));
  if (error) throw error;
}
