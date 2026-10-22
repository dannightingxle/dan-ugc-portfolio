import { z } from "zod";
import { helperApi } from "../../../../../hub/_lib/edits/helper-auth";
import { sendFiles } from "../../../../../hub/_lib/edits/setup";

/* Syncing your editing setup: the helper asks for the shared files it needs,
   and gets as many as fit in about 3.5 MB (it asks again for the rest). */

export const maxDuration = 60;

const Body = z.object({ requestId: z.string().max(100), paths: z.array(z.string().max(2_000)).max(2_000) });

export async function POST(request: Request) {
  return helperApi(request, async (auth) => {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return { ok: false, error: "Send { requestId, paths }." };
    return sendFiles(auth, parsed.data.requestId, parsed.data.paths);
  });
}
