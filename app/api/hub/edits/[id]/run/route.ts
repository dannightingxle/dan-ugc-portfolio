import { z } from "zod";
import { addEvents, getEdit, updateEdit } from "../../../../../hub/_lib/edits/data";
import { BadRequest, NotFound, editsApi } from "../../../../../hub/_lib/edits/request";

/* Send a card to the Mac to edit. "fresh" starts a new Claude session instead of carrying on the last one. */

export async function POST(request: Request, ctx: RouteContext<"/api/hub/edits/[id]/run">) {
  const { id } = await ctx.params;
  return editsApi(request, z.object({ fresh: z.boolean().default(false) }), async ({ user, body }) => {
    const edit = await getEdit(user.id, id);
    if (!edit) throw new NotFound("That card isn't there any more.");
    if (!edit.files.length) throw new BadRequest("Pick the clips for this video first.");
    if (edit.status === "queued" || edit.status === "editing") throw new BadRequest("It's already being edited.");
    const card = await updateEdit(user.id, id, { status: "queued", cancel_requested: false, ...(body.fresh ? { session_id: null, device_id: null } : {}) });
    await addEvents(id, [{ kind: "status", text: "Sent to your Mac." }]);
    return { edit: card };
  });
}
