import { z } from "zod";
import { failRequest, grabbedFrames } from "../../../../../hub/_lib/edits/styles";
import { helperApi } from "../../../../../hub/_lib/edits/helper-auth";
import { FRAMES_PER_UPLOAD, MAX_FRAME_CHARS } from "../../../../../hub/_lib/edits/style-types";

/* The helper sends key frames from a finished video picked on the Mac (or why it couldn't), for one edit style. */

const Body = z.union([
  z.object({ requestId: z.string().max(100), styleId: z.string().max(40), error: z.string().max(2_000) }),
  z.object({
    requestId: z.string().max(100),
    styleId: z.string().max(40),
    // Frames that aren't JPEG/PNG data URLs under MAX_FRAME_CHARS are skipped (and counted) rather than failing the rest.
    frames: z
      .array(z.object({ data: z.string().max(MAX_FRAME_CHARS * 8), at: z.number().default(0), source: z.string().max(1_000).default("") }))
      .max(FRAMES_PER_UPLOAD),
  }),
]);

export async function POST(request: Request) {
  return helperApi(request, async (auth) => {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return { ok: false, error: `Send up to ${FRAMES_PER_UPLOAD} JPEG or PNG frames, each under about 120KB.` };
    const b = parsed.data;
    if ("error" in b) return { ok: await failRequest(auth, b.requestId, "grab", b.error || "Your Mac couldn't grab the frames.") };
    return grabbedFrames(auth, b.requestId, b.styleId, b.frames);
  });
}
