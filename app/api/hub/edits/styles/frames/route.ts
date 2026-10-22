import { z } from "zod";
import { BadRequest, NotFound, editsApi } from "../../../../../hub/_lib/edits/request";
import { addFrames, deleteFrame, styleFrames, validStyleId } from "../../../../../hub/_lib/edits/styles";
import { FRAMES_PER_UPLOAD, MAX_FRAME_CHARS } from "../../../../../hub/_lib/edits/style-types";

/* A style's key frames: GET ?styleId= them, POST screenshots from this
   browser (already shrunk to 720px wide JPEGs), DELETE ?styleId=&id= one. */

export async function GET(request: Request) {
  const styleId = new URL(request.url).searchParams.get("styleId");
  return editsApi(request, null, async ({ user }) => {
    if (!validStyleId(styleId)) throw new NotFound("That style isn't there any more.");
    return { frames: await styleFrames(user.id, styleId) };
  });
}

const Body = z.object({
  styleId: z.string().max(40),
  frames: z
    .array(z.object({ data: z.string().max(MAX_FRAME_CHARS, "That picture is too big - try a smaller screenshot."), source: z.string().max(300).default("") }))
    .min(1)
    .max(FRAMES_PER_UPLOAD, `Add up to ${FRAMES_PER_UPLOAD} at a time.`),
});

export async function POST(request: Request) {
  return editsApi(request, Body, async ({ user, body }) => {
    if (!validStyleId(body.styleId)) throw new NotFound("That style isn't there any more.");
    const r = await addFrames(user.id, body.styleId, body.frames);
    if (!r) throw new NotFound("That style isn't there any more.");
    if (!r.added) throw new BadRequest("Those didn't come through as pictures - try a JPEG or PNG screenshot.");
    return r;
  });
}

export async function DELETE(request: Request) {
  const params = new URL(request.url).searchParams;
  const styleId = params.get("styleId"), id = params.get("id") ?? "";
  return editsApi(request, null, async ({ user }) => {
    if (!validStyleId(styleId)) throw new NotFound("That style isn't there any more.");
    return { frames: await deleteFrame(user.id, styleId, id) };
  });
}
