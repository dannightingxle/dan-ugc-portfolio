import { z } from "zod";
import { helperApi } from "../../../../../hub/_lib/edits/helper-auth";
import { finishPart } from "../../../../../hub/_lib/edits/setup";

/* Syncing your editing setup: the helper says how its part went - after
   sending (how many files, or why it couldn't), or after getting (what it
   wrote, what it backed up first and where, and what it skipped and why). */

const Paths = z.array(z.string().max(2_000)).max(5_000);

const Body = z.object({
  requestId: z.string().max(100),
  phase: z.enum(["upload", "download"]),
  error: z.string().max(2_000).optional(),
  sent: z.number().int().nonnegative().optional(),
  written: Paths.optional(),
  backedUp: Paths.optional(),
  backupDir: z.string().max(1_000).optional(),
  skipped: z.array(z.object({ path: z.string().max(2_000), why: z.string().max(1_000) })).max(5_000).optional(),
});

export async function POST(request: Request) {
  return helperApi(request, async (auth) => {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return { ok: false, error: "bad request" };
    const { requestId, ...rest } = parsed.data;
    return finishPart(auth, requestId, rest);
  });
}
