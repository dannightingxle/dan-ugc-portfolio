import { z } from "zod";
import { listDevices } from "../../../../hub/_lib/edits/data";
import { BadRequest, NotFound, editsApi } from "../../../../hub/_lib/edits/request";
import { createStyle, deleteStyle, latestScan, listStyles, stylesInUse, updateStyle, validStyleId } from "../../../../hub/_lib/edits/styles";
import { MAX_RULES, STYLE_KINDS } from "../../../../hub/_lib/edits/style-types";

/* Your edit styles: GET them (with which jobs use each, your Macs, and the
   last read of your Mac's setup), POST a new one, PATCH one you've changed,
   DELETE ?id= one. */

export async function GET(request: Request) {
  return editsApi(request, null, async ({ user }) => {
    const [styles, scan, devices] = await Promise.all([listStyles(user.id), latestScan(user.id), listDevices(user.id)]);
    const used = await stylesInUse(user.id, styles);
    return { styles: styles.map((s) => ({ ...s, frameCount: s.frameCount ?? 0, usedBy: used.get(s.id) ?? [] })), scan, devices };
  });
}

const Fields = z.object({
  name: z.string().trim().min(1, "Give the style a name.").max(80),
  kind: z.enum(STYLE_KINDS),
  summary: z.string().max(1_000).default(""),
  rules: z.array(z.string().max(300)).max(MAX_RULES).default([]),
});

export async function POST(request: Request) {
  return editsApi(request, Fields, async ({ user, body }) => {
    const r = await createStyle(user.id, body);
    if ("error" in r) throw new BadRequest(r.error);
    return r;
  });
}

export async function PATCH(request: Request) {
  const Patch = z.object({
    id: z.string().max(40),
    name: Fields.shape.name.optional(),
    kind: Fields.shape.kind.optional(),
    summary: z.string().max(1_000).optional(),
    rules: z.array(z.string().max(300)).max(MAX_RULES).optional(),
  });
  return editsApi(request, Patch, async ({ user, body }) => {
    const { id, ...patch } = body;
    if (!validStyleId(id)) throw new NotFound("That style isn't there any more.");
    const r = await updateStyle(user.id, id, patch);
    if ("error" in r) throw new BadRequest(r.error);
    return r;
  });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  return editsApi(request, null, async ({ user }) => {
    if (validStyleId(id)) await deleteStyle(user.id, id);
  });
}
