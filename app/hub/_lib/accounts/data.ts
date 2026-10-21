import "server-only";
import { adminClient } from "../supabase/admin";
import { apifyEnabled, pullAccounts } from "../studio/apify";
import { getBrand } from "../studio/brand";
import { cleanHandle, type Platform, type Post } from "../studio/brand-types";
import { ACCOUNTS_ID, BRAND_ID } from "../studio/data";
import { readWorkspace } from "../studio/types";
import { StudioError } from "../studio/claude";
import { accountKey, type AccountGroup, type AccountView, type AccountsData } from "./types";

/* Accounts storage: the list of accounts comes from the brand plan (personal)
   and each job's workspace (account.profiles); the daily snapshots live in
   hub_account_stats; the settings (daily refresh, last refresh, problems) in
   a workspace row under ACCOUNTS_ID. Every query is scoped to one user. */

const HISTORY_DAYS = 90;

/** A database error, or a plain explanation when the Accounts table hasn't been added to the database yet. */
function statsError(error: { code?: string; message?: string }) {
  if (error.code === "PGRST205" || error.code === "42P01" || /hub_account_stats/.test(error.message ?? "")) {
    return new StudioError(
      "Accounts isn't switched on in your database yet. In Supabase, open SQL Editor and run supabase/migrations/20261017090000_creator_accounts.sql (part-7-accounts.sql), then reload this page.",
    );
  }
  return error;
}

type Settings = { autoDaily: boolean; lastRefresh: string | null; problems: string[] };
type Tracked = { platform: Platform; handle: string; group: AccountGroup };

async function getSettings(userId: string): Promise<Settings> {
  const { data } = await adminClient().from("hub_workspaces").select("data").eq("user_id", userId).eq("project_id", ACCOUNTS_ID).maybeSingle<{ data: Partial<Settings> }>();
  return { autoDaily: data?.data?.autoDaily === true, lastRefresh: data?.data?.lastRefresh ?? null, problems: data?.data?.problems ?? [] };
}

export async function saveSettings(userId: string, patch: Partial<Settings>) {
  const next = { ...(await getSettings(userId)), ...patch };
  const { error } = await adminClient().from("hub_workspaces").upsert({ user_id: userId, project_id: ACCOUNTS_ID, data: next, updated_at: new Date().toISOString() });
  if (error) throw error;
  return next;
}

/** Every account to show: personal ones first, then each job's (an account listed twice shows once). */
async function trackedAccounts(userId: string): Promise<Tracked[]> {
  const db = adminClient();
  const [brand, workspaces, projects] = await Promise.all([
    getBrand(userId),
    db.from("hub_workspaces").select("project_id, data").eq("user_id", userId).not("project_id", "in", `(${BRAND_ID},${ACCOUNTS_ID})`).not("project_id", "like", "%:%"),
    db.from("hub_projects").select("id, data").eq("user_id", userId),
  ]);
  // Ended and lost jobs drop off (no point paying to refresh them); their history stays in the database.
  type Job = { brand?: string; stage?: string; techStage?: string };
  const live = (projects.data ?? []).filter((p) => {
    const d = (p.data ?? {}) as Job;
    return d.stage !== "Lost" && d.techStage !== "Lost" && d.techStage !== "Ended";
  });
  const names = new Map(live.map((p) => [p.id as string, String((p.data as Job)?.brand ?? "")]));
  const out: Tracked[] = [];
  const seen = new Set<string>();
  const add = (platform: Platform, raw: string, group: AccountGroup) => {
    const handle = cleanHandle(raw);
    const key = accountKey(platform, handle);
    if (!handle || seen.has(key)) return;
    seen.add(key);
    out.push({ platform, handle, group });
  };
  for (const h of brand.accounts) add(h.platform, h.handle, { kind: "personal" });
  const jobs = (workspaces.data ?? [])
    .filter((w) => names.has(w.project_id))
    .map((w) => ({ id: w.project_id as string, name: names.get(w.project_id) || "Job", profiles: readWorkspace(w.data).account.profiles }))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const j of jobs) for (const p of j.profiles) add(p.platform, p.handle, { kind: "job", id: j.id, name: j.name });
  return out;
}

export async function getAccounts(userId: string): Promise<AccountsData> {
  const [tracked, settings] = await Promise.all([trackedAccounts(userId), getSettings(userId)]);
  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await adminClient()
    .from("hub_account_stats")
    .select("platform, handle, day, followers, posts, pulled_at")
    .eq("user_id", userId)
    .gte("day", since)
    .order("day");
  if (error) throw statsError(error);
  const rows = data ?? [];
  const accounts: AccountView[] = tracked.map((t) => {
    const mine = rows.filter((r) => r.platform === t.platform && r.handle === t.handle);
    const latest = mine.at(-1);
    return {
      key: accountKey(t.platform, t.handle),
      ...t,
      snapshots: mine.map((r) => ({ day: r.day as string, followers: r.followers as number | null })),
      posts: (latest?.posts as Post[]) ?? [],
      pulledAt: (latest?.pulled_at as string) ?? null,
    };
  });
  return { accounts, ...settings, apify: apifyEnabled };
}

/** Pull every account's followers and latest posts, and save today's snapshot. */
export async function refreshAccounts(userId: string): Promise<AccountsData> {
  if (!apifyEnabled) throw new StudioError("Add APIFY_TOKEN in Vercel to pull stats.");
  const tracked = await trackedAccounts(userId);
  if (!tracked.length) throw new StudioError("Add your accounts first: personal ones on the brand plan page, a job's on its Account tab.");
  const { posts, followers, problems } = await pullAccounts(tracked);
  const day = new Date().toISOString().slice(0, 10);
  const rows = tracked
    .map((t) => {
      const key = accountKey(t.platform, t.handle);
      const own = posts.filter((p) => p.platform === t.platform && p.handle === t.handle).sort((a, b) => b.postedAt.localeCompare(a.postedAt));
      return { user_id: userId, platform: t.platform, handle: t.handle, day, followers: followers[key] ?? null, posts: own, pulled_at: new Date().toISOString() };
    })
    .filter((r) => r.posts.length || r.followers != null);
  if (rows.length) {
    const { error } = await adminClient().from("hub_account_stats").upsert(rows, { onConflict: "user_id,platform,handle,day" });
    if (error) throw statsError(error);
  }
  await saveSettings(userId, { lastRefresh: new Date().toISOString(), problems });
  return getAccounts(userId);
}

/** Who wants a daily refresh (for the cron). */
export async function dailyUsers(): Promise<string[]> {
  const { data } = await adminClient().from("hub_workspaces").select("user_id").eq("project_id", ACCOUNTS_ID).eq("data->>autoDaily", "true");
  return (data ?? []).map((r) => r.user_id as string);
}
