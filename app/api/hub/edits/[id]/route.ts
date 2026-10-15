import { z } from "zod";
import { deleteEdit, getEdit, listEvents, toCard, updateEdit } from "../../../../hub/_lib/edits/data";
import { EDIT_STATUSES } from "../../../../hub/_lib/edits/types";
import { FileList, NotFound, editsApi } from "../../../../hub/_lib/edits/request";

/* One edit card: read it with its conversation (new events after ?after=), change it, delete it. */

export async function GET(request: Request, ctx: RouteContext<"/api/hub/edits/[id]">) {
  const { id } = await ctx.params;
  const after = Number(new URL(request.url).searchParams.get("after")) || 0;
  return editsApi(request, null, async ({ user }) => {
    const edit = await getEdit(user.id, id);
    if (!edit) throw new NotFound("That card isn't there any more.");
    return { edit: toCard(edit), events: await listEvents(id, after) };
  });
}

// Only what's sent changes (no defaults here, or a clip change would blank the title and card).
const Patch = z.object({
  status: z.enum(EDIT_STATUSES).optional(),
  files: FileList.optional(),
  title: z.string().max(300).optional(),
  brief: z.string().max(200_000).optional(),
});

export async function PATCH(request: Request, ctx: RouteContext<"/api/hub/edits/[id]">) {
  const { id } = await ctx.params;
  return editsApi(request, Patch, async ({ user, body }) => {
    if (!(await getEdit(user.id, id))) throw new NotFound("That card isn't there any more.");
    const patch: Record<string, unknown> = {};
    for (const k of ["status", "files", "title", "brief"] as const) if (body[k] !== undefined) patch[k] = body[k];
    return { edit: await updateEdit(user.id, id, patch) };
  });
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/hub/edits/[id]">) {
  const { id } = await ctx.params;
  return editsApi(request, null, async ({ user }) => {
    await deleteEdit(user.id, id);
  });
}
