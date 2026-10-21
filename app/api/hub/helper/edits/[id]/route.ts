import { z } from "zod";
import { addEvents, addNotes, claimEdit, getEdit, markDelivered, updateEdit } from "../../../../../hub/_lib/edits/data";
import { helperApi } from "../../../../../hub/_lib/edits/helper-auth";
import { ALL_EDITS, EDIT_STATUSES } from "../../../../../hub/_lib/edits/types";

/* The helper's updates on one edit: claim it, report progress and Claude's
   messages, say which replies it passed on, hand back picked clips, and pass
   on feedback Claude was asked to remember for future edits. */

const Body = z.object({
  claim: z.boolean().optional(),
  status: z.enum(EDIT_STATUSES).optional(),
  sessionId: z.string().max(200).optional(),
  draftName: z.string().max(300).optional(),
  picked: z.array(z.object({ path: z.string().max(1_000), name: z.string().max(300), duration: z.number().nullable().optional() })).max(40).optional(),
  pickDone: z.boolean().optional(),
  events: z.array(z.object({ kind: z.enum(["status", "assistant", "tool", "error", "done"]), text: z.string().max(20_000) })).max(200).default([]),
  delivered: z.array(z.number().int()).max(200).default([]),
  /** Feedback on how to edit that Claude was asked to remember (NOTE: lines). */
  notes: z.array(z.object({ text: z.string().trim().min(1).max(500), all: z.boolean().default(false) })).max(10).default([]),
});

export async function POST(request: Request, ctx: RouteContext<"/api/hub/helper/edits/[id]">) {
  const { id } = await ctx.params;
  return helperApi(request, async (auth) => {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return { ok: false, error: "bad request" };
    const b = parsed.data;
    const edit = await getEdit(auth.userId, id);
    if (!edit) return { ok: false, error: "gone" };
    if (b.claim) return { ok: await claimEdit(auth, id) };
    // Clip picks can come from any of the person's Macs; edit progress only from the Mac running it.
    if (b.pickDone) {
      const patch: Record<string, unknown> = { pick_requested_at: null };
      if (b.picked?.length) patch.files = [...edit.files.filter((f) => !b.picked!.some((p) => p.path === f.path)), ...b.picked];
      await updateEdit(auth.userId, id, patch);
      return { ok: true };
    }
    if (edit.device_id !== auth.deviceId) return { ok: false, error: "not this Mac's edit" };
    const patch: Record<string, unknown> = {};
    if (b.status) patch.status = b.status;
    if (b.sessionId) patch.session_id = b.sessionId;
    if (b.draftName) patch.draft_name = b.draftName;
    if (b.status && b.status !== "editing") patch.cancel_requested = false;
    if (Object.keys(patch).length) await updateEdit(auth.userId, id, patch);
    await addEvents(id, b.events);
    await markDelivered(auth, b.delivered);
    // Remembered for next time: for this job, or for every edit.
    for (const all of [false, true]) {
      const added = await addNotes(auth.userId, all ? ALL_EDITS : edit.project_id, b.notes.filter((n) => n.all === all).map((n) => n.text), "edit");
      if (added.length) await addEvents(id, [{ kind: "status", text: `Saved to your editing notes for ${all ? "all your edits" : "this job"}: ${added.map((n) => n.text).join(" · ")}` }]);
    }
    return { ok: true };
  });
}
