import { z } from "zod";
import { crossSite } from "../../../hub/_lib/same-origin";
import { adminClient } from "../../../hub/_lib/supabase/admin";
import { claudeEnabled, studioApiUser } from "../../../hub/_lib/studio/data";
import { studioErrorMessage } from "../../../hub/_lib/studio/claude";
import { Uploads } from "../../../hub/_lib/studio/request";
import { listTasks, startTask } from "../../../hub/_lib/studio/tasks";
import { deleteScript, listScripts } from "../../../hub/_lib/scripts/data";
import { runScript } from "../../../hub/_lib/scripts/generate";
import { DESTINATIONS, FEEDBACK_PICKS, FORMATS, OWN_SCRIPTS } from "../../../hub/_lib/scripts/types";
import type { HubUser } from "../../../hub/_lib/supabase/server";

/* Scripts for a job (?scope=<job id>) or the standalone ones (?scope=scripts).
   GET: the scripts, newest first, and the one being written if any.
   POST: write a script - a new request, answers to its questions, or
   "Not right?" feedback on its latest version. It runs in the background.
   DELETE ?scope=&id=: delete a script. */
export const maxDuration = 800; // = JOB_SECONDS in studio/tasks.ts

const text = (max: number) => z.string().max(max).default("");
const Scope = z.string().regex(/^[\w-]{1,80}$/);

const ScriptRequest = z.object({
  brand: z.string().trim().min(1, "Add the brand.").max(200),
  product: z.string().trim().min(1, "Add the product.").max(300),
  brief: text(100_000),
  length: z.union([z.literal(15), z.literal(30), z.literal(60)]),
  format: z.enum(["", ...FORMATS]).default(""),
  experience: text(5_000),
  mustSay: text(5_000),
  mustNotSay: text(5_000),
  destination: z.enum(["", ...DESTINATIONS]).default(""),
});

const Body = z
  .object({
    scope: Scope,
    scriptId: z.string().uuid().optional(),
    request: ScriptRequest.optional(),
    uploads: Uploads,
    answers: z
      .array(
        z.object({
          question: z.string().max(2_000),
          answer: z.string().max(5_000),
        }),
      )
      .max(10)
      .default([]),
    feedback: z
      .object({
        picks: z.array(z.enum(FEEDBACK_PICKS)).max(4).default([]),
        text: text(3_000),
      })
      .optional(),
  })
  .refine((b) => b.scriptId || b.request, "Add the brand and product first.")
  .refine((b) => !b.feedback || b.feedback.picks.length || b.feedback.text.trim(), "Say what's not right first.");

/** A job's scripts belong to one of your jobs; the standalone ones are under "scripts". */
async function validScope(user: HubUser, scope: string) {
  if (scope === OWN_SCRIPTS) return true;
  const { data } = await adminClient().from("hub_projects").select("id").eq("user_id", user.id).eq("id", scope).maybeSingle();
  return Boolean(data);
}

export async function GET(request: Request) {
  const auth = await studioApiUser("scripts");
  if (!auth.ok) return auth.response;
  const scope = Scope.safeParse(new URL(request.url).searchParams.get("scope"));
  if (!scope.success || !(await validScope(auth.user, scope.data))) return Response.json({ error: "Unknown job." }, { status: 400 });
  try {
    const [scripts, tasks] = await Promise.all([listScripts(auth.user.id, scope.data), listTasks(auth.user.id)]);
    return Response.json({
      scripts,
      task: tasks.find((t) => t.projectId === scope.data && t.kind === "script") ?? null,
    });
  } catch (e) {
    console.error("Creator Desk scripts:", e);
    return Response.json({ error: "Couldn't load your scripts." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const auth = await studioApiUser("scripts");
  if (!auth.ok) return auth.response;
  if (!claudeEnabled) return Response.json({ error: "Add ANTHROPIC_API_KEY in Vercel to switch on Claude." }, { status: 503 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Bad request." }, { status: 400 });
  const { scope, scriptId, request: req, uploads, answers, feedback } = parsed.data;
  if (!(await validScope(auth.user, scope))) return Response.json({ error: "Unknown job." }, { status: 400 });
  const user = auth.user;
  try {
    const task = await startTask(
      user,
      scope,
      "script",
      (progress) => runScript(user, scope, { scriptId, request: req, uploads, answers, feedback }, progress),
      scriptId,
    );
    return Response.json(task);
  } catch (e) {
    console.error("Creator Desk scripts:", e);
    return Response.json({ error: studioErrorMessage(e) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const auth = await studioApiUser("scripts");
  if (!auth.ok) return auth.response;
  const params = new URL(request.url).searchParams;
  const scope = Scope.safeParse(params.get("scope"));
  const id = z.string().uuid().safeParse(params.get("id"));
  if (!scope.success || !id.success) return Response.json({ error: "Unknown script." }, { status: 400 });
  await deleteScript(auth.user.id, scope.data, id.data);
  return Response.json({ ok: true });
}
