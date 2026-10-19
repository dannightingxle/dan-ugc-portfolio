import { z } from "zod";
import { BRAND_ID } from "../../../../../hub/_lib/studio/data";
import { canUse } from "../../../../../hub/_lib/features";
import { StudioError } from "../../../../../hub/_lib/studio/claude";
import { deleteTrial, makeTrial, saveTrialResults } from "../../../../../hub/_lib/studio/trials";
import { studioAction } from "../../../../../hub/_lib/studio/request";

/* Trial reels: POST writes 5 versions of a reel (one of your posts, a finished
   edit card, or pasted), PATCH saves their views and the winner, DELETE
   removes one. */
export const maxDuration = 300;

const Source = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("post"), url: z.string().url().max(1_000) }),
  z.object({ kind: z.literal("edit"), editId: z.string().uuid() }),
  z.object({ kind: z.literal("paste"), text: z.string().max(20_000) }),
]);

export async function POST(request: Request) {
  return studioAction(
    request,
    BRAND_ID,
    Source,
    async ({ user, body }) => {
      if (body.kind === "edit" && !(await canUse(user, "edits"))) throw new StudioError("Edits on your Mac aren't switched on for you yet.");
      return makeTrial(user, body);
    },
    { feature: "brand" },
  );
}

export async function PATCH(request: Request) {
  return studioAction(
    request,
    BRAND_ID,
    z.object({ id: z.string().max(40), views: z.array(z.number().int().min(0).nullable()).max(10), winner: z.string().max(10).nullable() }),
    ({ user, body }) => saveTrialResults(user.id, body.id, body.views, body.winner),
    { needsClaude: false, feature: "brand" },
  );
}

export async function DELETE(request: Request) {
  return studioAction(request, BRAND_ID, z.object({ id: z.string().max(40) }), ({ user, body }) => deleteTrial(user.id, body.id), { needsClaude: false, feature: "brand" });
}
