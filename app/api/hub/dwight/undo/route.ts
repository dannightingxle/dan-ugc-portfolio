import { z } from "zod";
import { crossSite } from "../../../../hub/_lib/same-origin";
import { studioApiUser } from "../../../../hub/_lib/studio/data";
import { UndoError, undoLatest } from "../../../../hub/_lib/dwight/undo";

/* Undo Dwight's latest change (POST {conversationId, messageId}). Says which jobs to reload and which to take off the page. */
export async function POST(request: Request) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const auth = await studioApiUser("dwight");
  if (!auth.ok) return auth.response;
  const parsed = z.object({ conversationId: z.string().uuid(), messageId: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request." }, { status: 400 });
  try {
    return Response.json(await undoLatest(auth.user.id, parsed.data.conversationId, parsed.data.messageId));
  } catch (e) {
    if (e instanceof UndoError) return Response.json({ error: e.message }, { status: 409 });
    console.error("Creator Desk Dwight undo:", e);
    return Response.json({ error: "Couldn't undo it." }, { status: 500 });
  }
}
