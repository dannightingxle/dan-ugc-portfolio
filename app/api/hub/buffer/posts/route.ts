import { z } from "zod";
import { crossSite } from "../../../../hub/_lib/same-origin";
import { studioApiUser } from "../../../../hub/_lib/studio/data";
import { bufferFailure, schedulePosts } from "../../../../hub/_lib/buffer/data";

/* Schedule a post on Buffer, on one or more of your channels: in the queue's next free slot or at a set time. */

const Body = z
  .object({
    channelIds: z.array(z.string().trim().min(1).max(100)).min(1, "Pick at least one account.").max(10),
    text: z.string().max(5_000).default(""),
    when: z.enum(["queue", "time"]),
    dueAt: z.string().datetime().optional(),
    videoPath: z.string().max(300).optional(),
    title: z.string().max(100).optional(),
  })
  .refine((b) => b.when === "queue" || (b.dueAt && Date.parse(b.dueAt) > Date.now()), "Pick a time in the future.")
  .refine((b) => b.text.trim() || b.videoPath, "Add a video or a caption.");

export async function POST(request: Request) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const auth = await studioApiUser("calendar");
  if (!auth.ok) return auth.response;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Bad request." }, { status: 400 });
  try {
    return Response.json({ results: await schedulePosts(auth.user.id, parsed.data) });
  } catch (e) {
    return bufferFailure(e);
  }
}
