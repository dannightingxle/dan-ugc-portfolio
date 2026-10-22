import { z } from "zod";
import { helperApi } from "../../../../../hub/_lib/edits/helper-auth";
import { receiveList, sendList } from "../../../../../hub/_lib/edits/setup";
import { MAX_SETUP_FILES } from "../../../../../hub/_lib/edits/setup-types";

/* Syncing your editing setup. Sending: the helper POSTs every file it has
   ({ path, sha, size, mtime, exec }) and the skills it left out, and is told
   which ones to send. Getting: GET ?requestId= lists every file's shared
   version, to compare with what the Mac has. */

export const maxDuration = 60;

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("requestId") ?? "";
  return helperApi(request, (auth) => sendList(auth, id));
}

// Paths, shas and times are checked file by file (one odd file is skipped, not the whole list).
const Body = z.object({
  requestId: z.string().max(100),
  files: z
    .array(z.object({ path: z.string().max(2_000), sha: z.string().max(100), size: z.number().int().nonnegative(), mtime: z.string().max(40), exec: z.boolean().default(false) }))
    .max(MAX_SETUP_FILES),
  skippedSkills: z.array(z.object({ name: z.string().max(200), description: z.string().max(1_000).default("") })).max(500).default([]),
});

export async function POST(request: Request) {
  return helperApi(request, async (auth) => {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return { ok: false, error: `Send up to ${MAX_SETUP_FILES} files as { path, sha, size, mtime, exec }.` };
    const b = parsed.data;
    return receiveList(auth, b.requestId, b.files, b.skippedSkills);
  });
}
