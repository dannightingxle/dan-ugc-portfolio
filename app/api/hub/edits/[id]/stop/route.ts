import { addEvents, deviceOnline, getEdit, updateEdit } from "../../../../../hub/_lib/edits/data";
import { NotFound, editsApi } from "../../../../../hub/_lib/edits/request";

/* Stop an edit: a queued one just comes off the queue; a running one is stopped by the Mac. */

export async function POST(request: Request, ctx: RouteContext<"/api/hub/edits/[id]/stop">) {
  const { id } = await ctx.params;
  return editsApi(request, null, async ({ user }) => {
    const edit = await getEdit(user.id, id);
    if (!edit) throw new NotFound("That card isn't there any more.");
    if (edit.status === "queued") {
      await addEvents(id, [{ kind: "status", text: "Stopped before it started." }]);
      return { edit: await updateEdit(user.id, id, { status: "todo" }) };
    }
    // With its Mac offline (or the edit dropped by a restart), nothing would ever stop it: stop it here.
    if (edit.status !== "editing" || !(await deviceOnline(edit.device_id))) {
      await addEvents(id, [{ kind: "status", text: "Stopped." }]);
      return { edit: await updateEdit(user.id, id, { status: "failed", cancel_requested: false }) };
    }
    return { edit: await updateEdit(user.id, id, { cancel_requested: true }) };
  });
}
