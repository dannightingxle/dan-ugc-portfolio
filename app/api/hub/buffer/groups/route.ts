import { z } from "zod";
import { crossSite } from "../../../../hub/_lib/same-origin";
import { studioApiUser } from "../../../../hub/_lib/studio/data";
import {
  bufferFailure,
  saveBufferGroups,
} from "../../../../hub/_lib/buffer/data";

/* Your channel groups for scheduling: PUT the whole list to save it. */

const Body = z.object({
  groups: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(64),
        name: z.string().trim().min(1, "Give the group a name.").max(40),
        channelIds: z.array(z.string().trim().min(1).max(100)).min(1).max(30),
      }),
    )
    .max(30),
});

export async function PUT(request: Request) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const auth = await studioApiUser("calendar");
  if (!auth.ok) return auth.response;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Bad request." },
      { status: 400 },
    );
  try {
    return Response.json({
      groups: await saveBufferGroups(auth.user.id, parsed.data.groups),
    });
  } catch (e) {
    return bufferFailure(e);
  }
}
