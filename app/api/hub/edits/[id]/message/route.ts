import { z } from "zod";
import { addEvents, getEdit, updateEdit } from "../../../../../hub/_lib/edits/data";
import { BadRequest, NotFound, editsApi } from "../../../../../hub/_lib/edits/request";

/* A reply in the card's chat. The Mac passes it to the same Claude Code session. */

export async function POST(request: Request, ctx: RouteContext<"/api/hub/edits/[id]/message">) {
  const { id } = await ctx.params;
  return editsApi(request, z.object({ text: z.string().trim().min(1).max(10_000) }), async ({ user, body }) => {
    const edit = await getEdit(user.id, id);
    if (!edit) throw new NotFound("That card isn't there any more.");
    if (!edit.session_id || !edit.device_id) throw new BadRequest("Start the edit first - then you can reply here.");
    await addEvents(id, [{ kind: "user", text: body.text, delivered: false }]);
    if (edit.status !== "editing") await updateEdit(user.id, id, { status: "editing" });
  });
}
