import { z } from "zod";
import { reportRead } from "../../../../hub/_lib/edits/mac-reads";
import { helperApi } from "../../../../hub/_lib/edits/helper-auth";

/* The helper claims a page to read in your browser, then sends back its text (or why it couldn't). */

const Body = z.object({
  id: z.string().max(80),
  claim: z.boolean().optional(),
  title: z.string().max(1_000).optional(),
  url: z.string().max(4_000).optional(),
  text: z.string().max(200_000).optional(),
  links: z.array(z.tuple([z.string().max(500), z.string().max(4_000)])).max(400).optional(),
  error: z.string().max(2_000).optional(),
});

export async function POST(request: Request) {
  return helperApi(request, async (auth) => {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return { ok: false };
    const { id, ...rest } = parsed.data;
    return reportRead(auth, id, rest);
  });
}
