import { z } from "zod";
import { BRAND_ID } from "../../../../../../hub/_lib/studio/data";
import { canUse } from "../../../../../../hub/_lib/features";
import { makeIdea } from "../../../../../../hub/_lib/studio/brand";
import { StudioError } from "../../../../../../hub/_lib/studio/claude";
import { studioAction } from "../../../../../../hub/_lib/studio/request";

/* Make an idea: an edit card for the Mac helper, sent straight to the Mac when it can find its own B-roll. */

export async function POST(request: Request) {
  return studioAction(
    request,
    BRAND_ID,
    z.object({ id: z.string().max(40) }),
    async ({ user, body }) => {
      if (!(await canUse(user, "edits"))) throw new StudioError("Edits on your Mac aren't switched on for you yet.");
      return makeIdea(user.id, body.id);
    },
    { needsClaude: false, feature: "brand" },
  );
}
