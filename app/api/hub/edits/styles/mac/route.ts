import { z } from "zod";
import { listDevices, ownDevice } from "../../../../../hub/_lib/edits/data";
import { BadRequest, NotFound, editsApi } from "../../../../../hub/_lib/edits/request";
import { createRequest, getRequest, listStyles, validStyleId } from "../../../../../hub/_lib/edits/styles";

/* Asking your Mac for help with your edit styles: POST { kind: "scan" } to
   have it read its editing setup (CLAUDE.md, skills, memory) so Claude can
   sort it into styles, or { kind: "grab", styleId } to open a file picker
   there for a finished video to take key frames from. GET ?id= to see how
   it's going. deviceId picks the Mac (otherwise whichever of yours asks first). */

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  return editsApi(request, null, async ({ user }) => {
    const r = await getRequest(user.id, id);
    if (!r) throw new NotFound("That request isn't there any more.");
    return { request: r };
  });
}

const Body = z.object({ kind: z.enum(["scan", "grab"]), styleId: z.string().max(40).optional(), deviceId: z.string().uuid().optional() });

export async function POST(request: Request) {
  return editsApi(request, Body, async ({ user, body }) => {
    if (!(await listDevices(user.id)).length) throw new BadRequest("Connect your Mac first.");
    if (body.kind === "grab" && !(validStyleId(body.styleId) && (await listStyles(user.id)).some((s) => s.id === body.styleId))) throw new NotFound("That style isn't there any more.");
    const device = await ownDevice(user.id, body.deviceId);
    return { request: await createRequest(user.id, body.kind, device, body.kind === "grab" ? body.styleId : undefined) };
  });
}
