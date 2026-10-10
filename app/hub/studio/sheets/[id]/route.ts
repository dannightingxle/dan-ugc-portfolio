import { getSheet, studioUser } from "../../../_lib/studio/data";
import { buildShootSheetHtml } from "../../../_lib/studio/html";

/* A shoot sheet as its own full page (your template), for the phone on set. */
export async function GET(_request: Request, ctx: RouteContext<"/hub/studio/sheets/[id]">) {
  const user = await studioUser();
  const { id } = await ctx.params;
  const sheet = user ? await getSheet(user.id, id) : null;
  if (!sheet) return new Response("Not found", { status: 404 });
  return new Response(buildShootSheetHtml(sheet.id, sheet.data), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" },
  });
}
