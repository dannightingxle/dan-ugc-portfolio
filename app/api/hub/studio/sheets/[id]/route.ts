import { crossSite } from "../../../../../hub/_lib/same-origin";
import { deleteSheet, studioApiUser } from "../../../../../hub/_lib/studio/data";

/* Delete a shoot sheet. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/hub/studio/sheets/[id]">) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const auth = await studioApiUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  await deleteSheet(auth.user.id, id);
  return Response.json({ ok: true });
}
