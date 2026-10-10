import "server-only";
import { z } from "zod";
import { crossSite } from "../same-origin";
import { claudeEnabled, studioApiUser, validProjectId } from "./data";
import { studioErrorMessage } from "./claude";
import type { HubUser } from "../supabase/server";

/* Shared plumbing for the Studio API routes: owner check, same-site check,
   body validation and turning failures into readable messages. */

const text = (max: number) => z.string().max(max).default("");

// Vercel caps a request at ~4.5 MB, so uploads are kept well under that.
const MAX_UPLOAD_B64 = 4_000_000;
export const Uploads = z
  .array(
    z.object({
      name: z.string().max(200),
      type: z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"]),
      data: z.string().regex(/^[A-Za-z0-9+/=]*$/),
    }),
  )
  .max(10)
  .default([])
  .refine((u) => u.reduce((n, f) => n + f.data.length, 0) <= MAX_UPLOAD_B64, "Those files are too big - keep them under 3 MB in total.");

export const IntakeBody = z.object({ material: text(200_000), filming: text(2_000), voice: text(500), uploads: Uploads });
export const WeekBody = z.object({
  videos: z.number().int().min(1).max(21).default(7),
  filmingOn: text(500),
  lastWeek: text(5_000),
  trending: text(10_000),
  newBrief: text(200_000),
  uploads: Uploads,
});
export const ReviewBody = z.object({ numbers: text(20_000), uploads: Uploads });

const File = text(400_000);
export const WorkspaceBody = z.object({
  instructions: text(50_000),
  files: z.object({ brief: File, appNotes: File, references: File, winners: File, scriptBank: File }),
  clientQuestions: z.array(z.string().max(2_000)).max(50).default([]),
  needsDan: z.array(z.string().max(2_000)).max(50).default([]),
  couldntOpen: z.array(z.string().max(2_000)).max(50).default([]),
  account: z.object({ handles: text(2_000), checks: z.record(z.string().max(40), z.boolean()).default({}), notes: text(10_000) }),
  lastReview: z
    .object({ at: z.string().max(40), moreOf: z.array(z.string().max(2_000)).max(30), lessOf: z.array(z.string().max(2_000)).max(30), nextWeek: text(10_000) })
    .nullable()
    .default(null),
  updatedAt: z.string().max(40).nullable().default(null),
});

type Handler<B> = (args: { user: HubUser; projectId: string; body: B }) => Promise<unknown>;

/** Runs a Studio action for the signed-in owner on one of their jobs. */
export async function studioAction<S extends z.ZodType>(request: Request, projectId: string, schema: S, run: Handler<z.infer<S>>, { needsClaude = true } = {}) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const auth = await studioApiUser();
  if (!auth.ok) return auth.response;
  if (!validProjectId(projectId)) return Response.json({ error: "Unknown job." }, { status: 400 });
  if (needsClaude && !claudeEnabled) return Response.json({ error: "Add ANTHROPIC_API_KEY in Vercel to switch on Claude." }, { status: 503 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Bad request." }, { status: 400 });
  try {
    return Response.json(await run({ user: auth.user, projectId, body: parsed.data }));
  } catch (e) {
    console.error("Creator Desk studio:", e);
    return Response.json({ error: studioErrorMessage(e) }, { status: 500 });
  }
}
