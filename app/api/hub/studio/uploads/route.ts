import { z } from "zod";
import { crossSite } from "../../../../hub/_lib/same-origin";
import { studioApiUser } from "../../../../hub/_lib/studio/data";
import { attachmentUploadUrl } from "../../../../hub/_lib/studio/attachments";

/* A one-off link to upload a video you're attaching to a job's material, straight from the browser. */

const Body = z.object({ name: z.string().trim().min(1).max(300) });

export async function POST(request: Request) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const auth = await studioApiUser("studio");
  if (!auth.ok) return auth.response;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request." }, { status: 400 });
  try {
    return Response.json(await attachmentUploadUrl(auth.user.id, parsed.data.name));
  } catch (e) {
    console.error("Creator Desk attachment upload:", e);
    return Response.json({ error: "Couldn't start the upload - try again." }, { status: 500 });
  }
}
