import { crossSite } from "../../../../../hub/_lib/same-origin";
import { deleteSheet, sheetUser } from "../../../../../hub/_lib/studio/data";

/* Delete a shoot sheet. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/hub/studio/sheets/[id]">) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const user = await sheetUser();
  if (!user) return Response.json({ error: "Not found." }, { status: 404 });
  const { id } = await ctx.params;
  await deleteSheet(user.id, id);
  return Response.json({ ok: true });
}
