import { getEdit, updateEdit } from "../../../../../hub/_lib/edits/data";
import { NotFound, editsApi } from "../../../../../hub/_lib/edits/request";

/* Ask the Mac to open its file picker for this card (DELETE to stop waiting). */

export async function POST(request: Request, ctx: RouteContext<"/api/hub/edits/[id]/pick">) {
  const { id } = await ctx.params;
  return editsApi(request, null, async ({ user }) => {
    if (!(await getEdit(user.id, id))) throw new NotFound("That card isn't there any more.");
    return { edit: await updateEdit(user.id, id, { pick_requested_at: new Date().toISOString() }) };
  });
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/hub/edits/[id]/pick">) {
  const { id } = await ctx.params;
  return editsApi(request, null, async ({ user }) => ({ edit: await updateEdit(user.id, id, { pick_requested_at: null }) }));
}
