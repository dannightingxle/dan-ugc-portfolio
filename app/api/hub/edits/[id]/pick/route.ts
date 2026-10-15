import { z } from "zod";
import { getEdit, updateEdit } from "../../../../../hub/_lib/edits/data";
import { NotFound, editsApi } from "../../../../../hub/_lib/edits/request";

/* Ask the Mac to open its file picker for this card - for clips, or a whole folder of them
   (DELETE to stop waiting). */

export async function POST(request: Request, ctx: RouteContext<"/api/hub/edits/[id]/pick">) {
  const { id } = await ctx.params;
  return editsApi(request, z.object({ mode: z.enum(["files", "folder"]).default("files") }), async ({ user, body }) => {
    if (!(await getEdit(user.id, id))) throw new NotFound("That card isn't there any more.");
    return { edit: await updateEdit(user.id, id, { pick_requested_at: new Date().toISOString(), pick_mode: body.mode }) };
  });
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/hub/edits/[id]/pick">) {
  const { id } = await ctx.params;
  return editsApi(request, null, async ({ user }) => ({ edit: await updateEdit(user.id, id, { pick_requested_at: null }) }));
}
