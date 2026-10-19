import "server-only";
import { z } from "zod";
import { crossSite } from "../same-origin";
import { BRAND_ID, studioApiUser, validProjectId } from "../studio/data";
import type { HubUser } from "../supabase/server";

/* Shared plumbing for the Edits API routes the web app calls (the helper's own routes use a device token instead). */

export const text = (max: number) => z.string().max(max).default("");
export const FileList = z.array(z.object({ path: z.string().min(1).max(1_000), name: z.string().max(300), duration: z.number().nullable().optional() })).max(40);

export async function editsApi<S extends z.ZodType>(
  request: Request,
  schema: S | null,
  run: (args: { user: HubUser; body: z.infer<S> }) => Promise<unknown>,
) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const auth = await studioApiUser("edits");
  if (!auth.ok) return auth.response;
  let body: unknown = {};
  if (schema) {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "That request didn't look right." }, { status: 400 });
    body = parsed.data;
  }
  try {
    return Response.json((await run({ user: auth.user, body: body as z.infer<S> })) ?? { ok: true });
  } catch (e) {
    if (e instanceof NotFound) return Response.json({ error: e.message }, { status: 404 });
    if (e instanceof BadRequest) return Response.json({ error: e.message }, { status: 400 });
    console.error("Creator Desk edits:", e);
    return Response.json({ error: "Something went wrong - try again." }, { status: 500 });
  }
}

export class NotFound extends Error {}
export class BadRequest extends Error {}
/** A job, or the personal brand: both can have edit cards. */
export const editableProject = (id: unknown): id is string => validProjectId(id) || id === BRAND_ID;
