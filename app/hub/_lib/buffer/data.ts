import "server-only";
import { randomUUID } from "node:crypto";
import { adminClient } from "../supabase/admin";
import { type CalendarData, type CalendarPost, type Channel, type ChannelGroup, type ScheduleResult, facebookPostType } from "./types";

/* Buffer, connected with your own API key (Buffer → Settings → API). Its
   GraphQL API is called from the server only. Every request counts against
   Buffer's monthly limit (a couple of thousand on its free plan), so the
   calendar is kept for a while and fetched again only when it's stale or you
   ask. Rows in hub_workspaces (server-only): "buffer:settings" holds the key
   and organization, "buffer:cache" the last calendar. Videos for posts go in
   a public storage bucket under links nobody could guess, because Buffer
   fetches them when the post goes out (it has no upload of its own). */

// Tests point this at a local stand-in.
const API = process.env.BUFFER_API_BASE || "https://api.buffer.com";
const SETTINGS = "buffer:settings";
const CACHE = "buffer:cache";
const GROUPS = "buffer:groups";
const JOBS = "buffer:jobs";
/** How long the calendar is shown before it's fetched again by itself. */
const FRESH_MS = 10 * 60_000;
export const MEDIA_BUCKET = "buffer-media";

export class BufferError extends Error {}

/** A Buffer problem as a message for the page; anything else is logged. */
export function bufferFailure(e: unknown) {
  if (e instanceof BufferError) return Response.json({ error: e.message }, { status: 400 });
  console.error("Creator Desk buffer:", e);
  return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

type Settings = { apiKey: string; organizationId: string; organizationName: string; connectedAt: string };

async function getRow<T>(userId: string, id: string): Promise<T | null> {
  const { data } = await adminClient().from("hub_workspaces").select("data").eq("user_id", userId).eq("project_id", id).maybeSingle<{ data: T }>();
  return data?.data ?? null;
}
async function setRow(userId: string, id: string, data: unknown) {
  const { error } = await adminClient().from("hub_workspaces").upsert({ user_id: userId, project_id: id, data, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/** One GraphQL request to Buffer, with its problems as plain words. */
async function gql<T>(key: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch {
    throw new BufferError("Couldn't reach Buffer. Try again in a minute.");
  }
  if (res.status === 401 || res.status === 403) throw new BufferError("Buffer didn't accept your API key - it may have been deleted. Connect a new one below.");
  if (res.status === 429) {
    const wait = Number(res.headers.get("retry-after") ?? "");
    const when = wait > 0 ? (wait < 3600 ? `in about ${Math.ceil(wait / 60)} minutes` : wait < 86_400 ? `in about ${Math.ceil(wait / 3600)} hours` : "in a day or two") : "later";
    throw new BufferError(`You've used up Buffer's API allowance for now - try again ${when}. (Buffer limits requests per 15 minutes, day and month by plan.)`);
  }
  const json = (await res.json().catch(() => null)) as { data?: T; errors?: { message?: string; extensions?: { code?: string } }[] } | null;
  if (!res.ok || !json) throw new BufferError(`Buffer is having trouble right now (${res.status}). Try again in a minute.`);
  if (json.errors?.length) {
    const e = json.errors[0];
    if (e.extensions?.code === "UNAUTHORIZED" || e.extensions?.code === "UNAUTHENTICATED") throw new BufferError("Buffer didn't accept your API key. Connect a new one below.");
    if (e.extensions?.code === "RATE_LIMIT_EXCEEDED") throw new BufferError("You've used up Buffer's API allowance for now - try again later.");
    throw new BufferError(`Buffer said: ${e.message ?? "something went wrong"}`);
  }
  return json.data as T;
}

// ---------------------------------------------------------------- connecting

/** Whether you're connected, and to which Buffer organization. Never the key itself. */
export async function bufferStatus(userId: string) {
  const s = await getRow<Settings>(userId, SETTINGS);
  return s?.apiKey ? { connected: true as const, organization: s.organizationName, connectedAt: s.connectedAt } : { connected: false as const };
}

/** Check a key with Buffer and keep it, with the organization its channels are in. */
export async function connectBuffer(userId: string, apiKey: string) {
  const key = apiKey.trim();
  const data = await gql<{ account: { organizations: { id: string; name: string; channelCount?: number }[] } }>(key, "query Orgs { account { organizations { id name } } }");
  const orgs = data.account?.organizations ?? [];
  if (!orgs.length) throw new BufferError("That Buffer account has no organizations yet - add your channels in Buffer first.");
  // With more than one, the one with the most channels is almost always the one you post from.
  let org = orgs[0];
  if (orgs.length > 1) {
    const counts = await Promise.all(
      orgs.map((o) =>
        gql<{ channels: { id: string }[] }>(key, "query Ch($org: OrganizationId!) { channels(input: { organizationId: $org }) { id } }", { org: o.id })
          .then((c) => c.channels.length)
          .catch(() => 0),
      ),
    );
    org = orgs[counts.indexOf(Math.max(...counts))];
  }
  await setRow(userId, SETTINGS, { apiKey: key, organizationId: org.id, organizationName: org.name, connectedAt: new Date().toISOString() } satisfies Settings);
  await adminClient().from("hub_workspaces").delete().eq("user_id", userId).eq("project_id", CACHE);
  return { organization: org.name };
}

export async function disconnectBuffer(userId: string) {
  await adminClient().from("hub_workspaces").delete().eq("user_id", userId).in("project_id", [SETTINGS, CACHE, GROUPS, JOBS]);
}

// ---------------------------------------------------------------- channel groups

/** Your channel groups, kept with your account so they're the same on every device. */
export async function bufferGroups(userId: string): Promise<ChannelGroup[]> {
  return (await getRow<{ groups: ChannelGroup[] }>(userId, GROUPS))?.groups ?? [];
}

export async function saveBufferGroups(userId: string, groups: ChannelGroup[]) {
  await setRow(userId, GROUPS, { groups });
  return groups;
}

/** Which of your Buffer accounts each job's videos go to, by job id. */
export async function jobChannels(userId: string): Promise<Record<string, string[]>> {
  return (await getRow<{ jobs: Record<string, string[]> }>(userId, JOBS))?.jobs ?? {};
}

export async function saveJobChannels(userId: string, projectId: string, channelIds: string[]) {
  const jobs = await jobChannels(userId);
  await setRow(userId, JOBS, { jobs: { ...jobs, [projectId]: channelIds } });
}

async function settingsFor(userId: string) {
  const s = await getRow<Settings>(userId, SETTINGS);
  if (!s?.apiKey) throw new BufferError("Connect Buffer first.");
  return s;
}

// ---------------------------------------------------------------- the calendar

const POST_FIELDS = "id text status dueAt sentAt channelId channelService externalLink shareMode error { message supportUrl } assets { type thumbnail }";
// The whole calendar in one request: your channels, what's scheduled for the next four weeks, what failed, and how the last two weeks' posts did.
const CALENDAR_QUERY = `query Calendar($org: OrganizationId!, $from: DateTime!, $to: DateTime!, $since: DateTime!) {
  channels(input: { organizationId: $org }) { id name displayName service avatar isQueuePaused isDisconnected isLocked externalLink postingGoal { goal scheduledCount sentCount } }
  scheduled: posts(first: 100, input: { organizationId: $org, sort: [{ field: dueAt, direction: asc }], filter: { status: [scheduled, sending], dueAt: { start: $from, end: $to } } }) { edges { node { ${POST_FIELDS} } } }
  failed: posts(first: 20, input: { organizationId: $org, sort: [{ field: dueAt, direction: desc }], filter: { status: [error], dueAt: { start: $since } } }) { edges { node { ${POST_FIELDS} } } }
  sent: posts(first: 60, input: { organizationId: $org, sort: [{ field: dueAt, direction: desc }], filter: { status: [sent], dueAt: { start: $since, end: $from } } }) { edges { node { ${POST_FIELDS} metrics { type value } metricsUpdatedAt } } }
}`;

type RawPost = {
  id: string;
  text: string;
  status: string;
  dueAt: string | null;
  sentAt: string | null;
  channelId: string;
  channelService: string;
  externalLink: string | null;
  shareMode: string;
  error: { message: string; supportUrl: string | null } | null;
  assets: { type: string; thumbnail: string }[];
  metrics?: { type: string; value: number }[] | null;
};
type Edges = { edges: { node: RawPost }[] | null };

const toPost = (p: RawPost): CalendarPost => {
  const metric = (t: string) => p.metrics?.find((m) => m.type === t)?.value ?? null;
  return {
    id: p.id,
    text: p.text,
    status: p.status,
    at: p.sentAt ?? p.dueAt,
    channelId: p.channelId,
    service: p.channelService,
    link: p.externalLink,
    queued: p.shareMode === "addToQueue",
    error: p.error?.message ?? null,
    thumbnail: p.assets?.find((a) => a.thumbnail)?.thumbnail ?? null,
    video: p.assets?.some((a) => a.type === "video") ?? false,
    metrics: p.metrics ? { views: metric("views"), likes: metric("reactions"), comments: metric("comments"), shares: metric("shares") } : null,
  };
};

/** Your Buffer calendar: kept for FRESH_MS, or fetched again now with refresh. */
export async function bufferCalendar(userId: string, refresh = false): Promise<CalendarData> {
  const s = await settingsFor(userId);
  const cached = await getRow<CalendarData>(userId, CACHE);
  if (!refresh && cached && Date.now() - Date.parse(cached.at) < FRESH_MS) return cached;
  const now = new Date();
  const day = 86_400_000;
  const data = await gql<{ channels: (Omit<Channel, "goal"> & { postingGoal: Channel["goal"] })[]; scheduled: Edges; failed: Edges; sent: Edges }>(s.apiKey, CALENDAR_QUERY, {
    org: s.organizationId,
    from: now.toISOString(),
    to: new Date(now.getTime() + 28 * day).toISOString(),
    since: new Date(now.getTime() - 14 * day).toISOString(),
  });
  const posts = (e: Edges) => (e?.edges ?? []).map((x) => toPost(x.node));
  const calendar: CalendarData = {
    at: now.toISOString(),
    organization: s.organizationName,
    channels: (data.channels ?? []).map(({ postingGoal, ...c }) => ({ ...c, goal: postingGoal ?? null })),
    scheduled: posts(data.scheduled),
    failed: posts(data.failed),
    sent: posts(data.sent),
  };
  await setRow(userId, CACHE, calendar);
  return calendar;
}

// ---------------------------------------------------------------- scheduling

/** Somewhere to upload a video for a post: a link only this upload can use, and the public address Buffer will fetch it from. */
export async function videoUploadUrl(userId: string, fileName: string) {
  const storage = adminClient().storage;
  const { data: bucket } = await storage.getBucket(MEDIA_BUCKET);
  if (!bucket) {
    const { error } = await storage.createBucket(MEDIA_BUCKET, { public: true });
    if (error && !/already exists/i.test(error.message)) throw error;
  } else if (bucket.file_size_limit || bucket.allowed_mime_types?.length) {
    // A size limit (or list of file types) on the bucket itself would hold videos back whatever the project's upload
    // limit is set to: clear it, so "Upload file size limit" in Supabase's Storage settings is the one that counts.
    const { error } = await storage.updateBucket(MEDIA_BUCKET, { public: true, fileSizeLimit: null, allowedMimeTypes: null });
    if (error) console.error("Creator Desk buffer: couldn't clear the video bucket's own limit:", error.message);
  }
  const ext = (/\.(mp4|mov|m4v|webm)$/i.exec(fileName)?.[1] ?? "mp4").toLowerCase();
  // Public, but only to whoever has the link: a random name in a folder of your own.
  const path = `${userId}/${randomUUID()}.${ext}`;
  const { data, error } = await storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw error ?? new Error("no upload link");
  return { path, token: data.token, publicUrl: storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl };
}

export type ScheduleInput = { channelIds: string[]; text: string; when: "queue" | "time"; dueAt?: string; videoPath?: string; title?: string; /** How long the video is, read in the browser. */ videoSeconds?: number };

/** One post per channel: in the queue's next free slot or at a set time, with the uploaded video. */
export async function schedulePosts(userId: string, input: ScheduleInput): Promise<ScheduleResult[]> {
  const s = await settingsFor(userId);
  if (input.videoPath && !input.videoPath.startsWith(`${userId}/`)) throw new BufferError("That video isn't one of yours.");
  const videoUrl = input.videoPath ? adminClient().storage.from(MEDIA_BUCKET).getPublicUrl(input.videoPath).data.publicUrl : null;
  const channels = (await bufferCalendar(userId).catch(() => null))?.channels ?? [];
  const results: ScheduleResult[] = [];
  for (const channelId of input.channelIds) {
    const service = channels.find((c) => c.id === channelId)?.service ?? "";
    const title = (input.title || input.text.split("\n")[0] || "New video").slice(0, 100);
    const metadata =
      service === "instagram" && videoUrl
        ? { instagram: { type: "reel", shouldShareToFeed: true } }
        : service === "youtube"
          ? { youtube: { title, categoryId: "22" } }
          : service === "facebook"
            ? // Buffer needs a Facebook post's type: a video goes up as a reel, unless it's over Facebook's 90-second reel limit.
              { facebook: { type: facebookPostType(Boolean(videoUrl), input.videoSeconds), annotations: [] } }
            : undefined;
    const variables = {
      input: {
        text: input.text,
        channelId,
        schedulingType: "automatic",
        mode: input.when === "time" ? "customScheduled" : "addToQueue",
        ...(input.when === "time" && { dueAt: input.dueAt }),
        assets: videoUrl ? [{ video: { url: videoUrl } }] : [],
        ...(metadata && { metadata }),
      },
    };
    try {
      const data = await gql<{ createPost: { post?: { id: string; dueAt: string | null }; message?: string } }>(
        s.apiKey,
        "mutation Create($input: CreatePostInput!) { createPost(input: $input) { ... on PostActionSuccess { post { id dueAt } } ... on MutationError { message } } }",
        variables,
      );
      const r = data.createPost;
      results.push(r.post ? { channelId, ok: true, dueAt: r.post.dueAt } : { channelId, ok: false, error: r.message ?? "Buffer didn't schedule it." });
    } catch (e) {
      results.push({ channelId, ok: false, error: e instanceof BufferError ? e.message : "Something went wrong scheduling it." });
    }
  }
  // The calendar shows the new posts on its next look.
  await adminClient().from("hub_workspaces").delete().eq("user_id", userId).eq("project_id", CACHE);
  return results;
}
