import { z } from "zod";
import { crossSite } from "../../../../hub/_lib/same-origin";
import { studioApiUser } from "../../../../hub/_lib/studio/data";
import { bufferFailure, videoUploadUrl } from "../../../../hub/_lib/buffer/data";

/* A one-off link to upload a post's video straight to storage from the
   browser (videos are too big to send through the server). */

const Body = z.object({ name: z.string().trim().min(1).max(300) });

export async function POST(request: Request) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const auth = await studioApiUser("calendar");
  if (!auth.ok) return auth.response;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request." }, { status: 400 });
  try {
    return Response.json(await videoUploadUrl(auth.user.id, parsed.data.name));
  } catch (e) {
    return bufferFailure(e);
  }
}
