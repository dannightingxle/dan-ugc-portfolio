import { z } from "zod";
import { addEvents, getEdit, ownDevice, updateEdit } from "../../../../../hub/_lib/edits/data";
import { BadRequest, NotFound, editsApi } from "../../../../../hub/_lib/edits/request";
import { needsNoClips } from "../../../../../hub/_lib/edits/types";

/* Send a card to the Mac to edit. "fresh" starts a new Claude session instead of carrying on the last one.
   "deviceId" picks which Mac (with more than one connected): only that one takes it. */

export async function POST(request: Request, ctx: RouteContext<"/api/hub/edits/[id]/run">) {
  const { id } = await ctx.params;
  return editsApi(request, z.object({ fresh: z.boolean().default(false), deviceId: z.string().uuid().optional() }), async ({ user, body }) => {
    const edit = await getEdit(user.id, id);
    if (!edit) throw new NotFound("That card isn't there any more.");
    if (!edit.files.length && !needsNoClips(edit.brief)) throw new BadRequest("Pick the clips for this video first.");
    if (edit.status === "queued" || edit.status === "editing") throw new BadRequest("It's already being edited.");
    const device = await ownDevice(user.id, body.deviceId);
    // A different Mac can't carry on another Mac's Claude session, so it starts fresh there.
    const moved = Boolean(device && edit.device_id && device !== edit.device_id);
    const card = await updateEdit(user.id, id, {
      status: "queued",
      cancel_requested: false,
      ...(body.fresh || moved ? { session_id: null } : {}),
      device_id: device ?? (body.fresh ? null : edit.device_id),
    });
    await addEvents(id, [{ kind: "status", text: "Sent to your Mac." }]);
    return { edit: card };
  });
}
