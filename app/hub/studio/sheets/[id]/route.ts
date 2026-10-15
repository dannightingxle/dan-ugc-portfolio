import { getSheet, sheetUser } from "../../../_lib/studio/data";
import { buildShootSheetHtml } from "../../../_lib/studio/html";
import { customSheetPage, isCustomSheet } from "../../../_lib/studio/custom-template";

/* A shoot sheet as its own full page (your template, or the job's own one), for the phone on set. */
export async function GET(_request: Request, ctx: RouteContext<"/hub/studio/sheets/[id]">) {
  const user = await sheetUser();
  const { id } = await ctx.params;
  const sheet = user ? await getSheet(user.id, id) : null;
  if (!sheet) return new Response("Not found", { status: 404 });
  const html = isCustomSheet(sheet.data) ? customSheetPage(sheet.id, sheet.data.custom.header.title || sheet.title, sheet.data.custom.html) : buildShootSheetHtml(sheet.id, sheet.data);
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" },
  });
}
