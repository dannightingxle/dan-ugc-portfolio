import { timingSafeEqual } from "node:crypto";
import { continueTask, takeRelay } from "../../../../hub/_lib/studio/tasks";
import { RELAY_STAGES } from "../../../../hub/_lib/studio/relay-stages";

/* The second half of a Studio job that ran out of room in one run: the first
   run read the brief, saved what it found and called this with CRON_SECRET;
   this carries the same job on (writing the shoot sheet) with a whole time
   limit of its own. Answers at once; the work goes on in the background. */
export const maxDuration = 800; // = JOB_SECONDS in studio/tasks.ts

function authorised(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  return Boolean(secret) && given.length === want.length && timingSafeEqual(Buffer.from(given), Buffer.from(want));
}

export async function POST(request: Request) {
  if (!authorised(request)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { path?: unknown } | null;
  const path = typeof body?.path === "string" ? body.path : "";
  const saved = await takeRelay(path).catch((e) => {
    console.error("Creator Desk studio relay:", e);
    return null;
  });
  if (!saved) return Response.json({ skipped: "nothing to carry on" });
  const stage = RELAY_STAGES[saved.stage];
  if (!stage) return Response.json({ error: `Unknown stage ${saved.stage}.` }, { status: 400 });
  continueTask(saved.user, saved.task, (progress) => stage(saved.user, saved.projectId, saved.payload, progress));
  return Response.json({ started: true }, { status: 202 });
}
