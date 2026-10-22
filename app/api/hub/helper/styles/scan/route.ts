import { z } from "zod";
import { failRequest, sortScan } from "../../../../../hub/_lib/edits/styles";
import { helperApi } from "../../../../../hub/_lib/edits/helper-auth";

/* The helper sends the CLAUDE.md, skill and memory files it found on the Mac
   (or why it couldn't read them), and Claude sorts them into edit styles. */

// Sorting a big setup can take Claude a minute or two.
export const maxDuration = 300;

const MAX_FILES = 60;
const MAX_TEXT = 20_000;
const MAX_TOTAL = 400_000;

const Body = z.union([
  z.object({ requestId: z.string().max(100), error: z.string().max(2_000) }),
  z.object({
    requestId: z.string().max(100),
    // A little over the limits is trimmed rather than turned away.
    files: z.array(z.object({ path: z.string().max(1_000), text: z.string().max(200_000) })).max(200),
  }),
]);

export async function POST(request: Request) {
  return helperApi(request, async (auth) => {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return { ok: false, error: "bad request" };
    const b = parsed.data;
    if ("error" in b) return { ok: await failRequest(auth, b.requestId, "scan", b.error || "Your Mac couldn't read its setup.") };
    // At most 60 files, each up to 20,000 characters and 400,000 in all.
    let total = 0;
    const files: { path: string; text: string }[] = [];
    for (const f of b.files.slice(0, MAX_FILES)) {
      const text = f.text.slice(0, Math.min(MAX_TEXT, MAX_TOTAL - total));
      if (!text && total >= MAX_TOTAL) break;
      total += text.length;
      files.push({ path: f.path, text });
    }
    return sortScan(auth, b.requestId, files);
  });
}
