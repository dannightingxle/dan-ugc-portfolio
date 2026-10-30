import { after } from "next/server";
import { z } from "zod";
import { addEvents, addNotes, claimEdit, getEdit, markDelivered, updateEdit } from "../../../../../hub/_lib/edits/data";
import { helperApi } from "../../../../../hub/_lib/edits/helper-auth";
import { ALL_EDITS, EDIT_STATUSES } from "../../../../../hub/_lib/edits/types";
import { MAX_PICKED } from "../../../../../hub/_lib/edits/request";
import { addStyleRules } from "../../../../../hub/_lib/edits/styles";

/* The helper's updates on one edit: claim it, report progress and Claude's
   messages, say which replies it passed on, hand back picked clips, and pass
   on feedback Claude was asked to remember for future edits. */

const Body = z.object({
  claim: z.boolean().optional(),
  status: z.enum(EDIT_STATUSES).optional(),
  sessionId: z.string().max(200).optional(),
  draftName: z.string().max(300).optional(),
  picked: z.array(z.object({ path: z.string().max(1_000), name: z.string().max(300), duration: z.number().nullable().optional() })).max(MAX_PICKED).optional(),
  pickDone: z.boolean().optional(),
  events: z.array(z.object({ kind: z.enum(["status", "assistant", "tool", "error", "done"]), text: z.string().max(20_000) })).max(200).default([]),
  delivered: z.array(z.number().int()).max(200).default([]),
  /** Feedback on how to edit that Claude was asked to remember: for this job (NOTE:), all edits (NOTE FOR ALL:) or the job's edit style (NOTE FOR STYLE:). */
  notes: z.array(z.object({ text: z.string().trim().min(1).max(500), all: z.boolean().default(false), style: z.boolean().default(false) })).max(10).default([]),
});

export async function POST(request: Request, ctx: RouteContext<"/api/hub/helper/edits/[id]">) {
  const { id } = await ctx.params;
  return helperApi(request, async (auth) => {
    const raw = await request.json().catch(() => null);
    // The picker has closed: whatever else is wrong with what came back, stop asking for it, or the Mac opens it again and again.
    if (raw?.pickDone === true && Array.isArray(raw.picked) && raw.picked.length > MAX_PICKED) raw.picked = raw.picked.slice(0, MAX_PICKED);
    const parsed = Body.safeParse(raw);
    if (!parsed.success) {
      if (raw?.pickDone === true) await updateEdit(auth.userId, id, { pick_requested_at: null }).catch(() => {});
      return { ok: false, error: "bad request" };
    }
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
      const added = await addNotes(auth.userId, all ? ALL_EDITS : edit.project_id, b.notes.filter((n) => !n.style && n.all === all).map((n) => n.text), "edit");
      if (added.length) await addEvents(id, [{ kind: "status", text: `Saved to your editing notes for ${all ? "all your edits" : "this job"}: ${added.map((n) => n.text).join(" · ")}` }]);
    }
    // Changes to the job's edit style: Claude folds them into the style, so every Mac and job in it follows them (after answering the Mac).
    const forStyle = b.notes.filter((n) => n.style).map((n) => n.text);
    if (forStyle.length) {
      after(async () => {
        try {
          const saved = await addStyleRules(auth.userId, edit.project_id, forStyle);
          if (saved) {
            await addEvents(id, [{ kind: "status", text: `Saved to your "${saved.name}" edit style, for every Mac: ${saved.added.join(" · ")}` }]);
          } else {
            // No style for this job yet: kept as a note for the job instead.
            const added = await addNotes(auth.userId, edit.project_id, forStyle, "edit");
            if (added.length) await addEvents(id, [{ kind: "status", text: `Saved to your editing notes for this job (it has no edit style yet): ${added.map((n) => n.text).join(" · ")}` }]);
          }
        } catch (e) {
          console.error("Creator Desk: couldn't save feedback to the edit style", e);
          await addNotes(auth.userId, edit.project_id, forStyle, "edit").catch(() => {});
        }
      });
    }
    return { ok: true };
  });
}
