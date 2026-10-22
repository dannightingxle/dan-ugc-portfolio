import { z } from "zod";
import { helperApi } from "../../../../../hub/_lib/edits/helper-auth";
import { receiveFiles } from "../../../../../hub/_lib/edits/setup";
import { MAX_SETUP_FILE, MAX_SETUP_FILES } from "../../../../../hub/_lib/edits/setup-types";

/* Syncing your editing setup: the helper sends the files it was asked for,
   word for word (text, or base64 for anything else), about 3.5 MB at a time. */

export const maxDuration = 60;

const Body = z.object({
  requestId: z.string().max(100),
  files: z
    .array(
      z.object({
        path: z.string().max(2_000),
        sha: z.string().max(100),
        size: z.number().int().nonnegative(),
        mtime: z.string().max(40),
        exec: z.boolean().default(false),
        text: z.string().max(MAX_SETUP_FILE + 1).optional(),
        base64: z.string().max(Math.ceil(MAX_SETUP_FILE / 3) * 4 + 4).optional(),
      }),
    )
    .max(MAX_SETUP_FILES),
});

export async function POST(request: Request) {
  return helperApi(request, async (auth) => {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return { ok: false, error: "Send files as { path, sha, size, mtime, exec, text | base64 }, each under 2 MB." };
    return receiveFiles(auth, parsed.data.requestId, parsed.data.files);
  });
}
