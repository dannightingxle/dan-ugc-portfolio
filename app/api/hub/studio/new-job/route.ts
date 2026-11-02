import { crossSite } from "../../../../hub/_lib/same-origin";
import { claudeEnabled, studioApiUser } from "../../../../hub/_lib/studio/data";
import { studioErrorMessage } from "../../../../hub/_lib/studio/claude";
import { setUpJob } from "../../../../hub/_lib/studio/jobs";
import { createTechJob } from "../../../../hub/_lib/studio/new-job";
import { IntakeBody } from "../../../../hub/_lib/studio/request";
import { startTask } from "../../../../hub/_lib/studio/tasks";

/* A new tech job from everything you have on it: the job goes in your tracker
   straight away, and its setup runs in the background - the workspace, the
   job's details, its setup to-dos and suggested handles. Answers with the new
   job's id, so the page can open its Studio and show the setup going. */
export const maxDuration = 800; // = JOB_SECONDS in studio/tasks.ts

export async function POST(request: Request) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const auth = await studioApiUser("studio");
  if (!auth.ok) return auth.response;
  if (!claudeEnabled) return Response.json({ error: "Add ANTHROPIC_API_KEY in Vercel to switch on Claude." }, { status: 503 });
  const parsed = IntakeBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Bad request." }, { status: 400 });
  const body = parsed.data;
  if (!body.material.trim() && !body.uploads.length) return Response.json({ error: "Paste the brief, links or messages first." }, { status: 400 });
  try {
    const projectId = await createTechJob(auth.user.id);
    await startTask(auth.user, projectId, "intake", async (progress) => {
      await setUpJob(auth.user, projectId, body, progress);
      return null;
    });
    return Response.json({ projectId });
  } catch (e) {
    console.error("Creator Desk studio:", e);
    return Response.json({ error: studioErrorMessage(e) }, { status: 500 });
  }
}
