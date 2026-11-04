import { z } from "zod";
import { adminClient } from "../../../../hub/_lib/supabase/admin";
import { crossSite } from "../../../../hub/_lib/same-origin";
import { studioApiUser } from "../../../../hub/_lib/studio/data";
import { BRAND_ID } from "../../../../hub/_lib/studio/brand-types";
import { bufferFailure, saveJobChannels } from "../../../../hub/_lib/buffer/data";
import { matchFinished } from "../../../../hub/_lib/buffer/finished";

/* Finished videos: POST the file names you picked to have each matched to its
   job, caption and Buffer accounts; PUT a job's accounts to keep them. */

const Match = z.object({ names: z.array(z.string().trim().min(1).max(300)).min(1).max(60), jobFor: z.record(z.string().max(300), z.string().max(100)).optional() });
const Save = z.object({ projectId: z.string().trim().min(1).max(100), channelIds: z.array(z.string().trim().min(1).max(100)).max(30) });

async function jobs(userId: string) {
  const { data } = await adminClient().from("hub_projects").select("id, data").eq("user_id", userId);
  const list = (data ?? [])
    .map((p) => ({ id: p.id as string, brand: String((p.data as { brand?: string })?.brand ?? ""), stage: String((p.data as { stage?: string })?.stage ?? "") }))
    .filter((p) => p.brand && !["Paid", "Lost"].includes(p.stage))
    .sort((a, b) => a.brand.localeCompare(b.brand))
    .map(({ id, brand }) => ({ id, brand }));
  return [{ id: BRAND_ID, brand: "Personal brand" }, ...list];
}

export async function POST(request: Request) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const auth = await studioApiUser("calendar");
  if (!auth.ok) return auth.response;
  const parsed = Match.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Bad request." }, { status: 400 });
  try {
    const [matched, list] = await Promise.all([matchFinished(auth.user.id, parsed.data.names, parsed.data.jobFor), jobs(auth.user.id)]);
    return Response.json({ ...matched, jobs: list });
  } catch (e) {
    return bufferFailure(e);
  }
}

export async function PUT(request: Request) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const auth = await studioApiUser("calendar");
  if (!auth.ok) return auth.response;
  const parsed = Save.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request." }, { status: 400 });
  const { projectId, channelIds } = parsed.data;
  if (!(await jobs(auth.user.id)).some((j) => j.id === projectId)) return Response.json({ error: "That job isn't yours." }, { status: 404 });
  await saveJobChannels(auth.user.id, projectId, channelIds);
  return Response.json({ ok: true });
}
