import { z } from "zod";
import { BRAND_ID } from "../../../../../../hub/_lib/studio/data";
import { canUse } from "../../../../../../hub/_lib/features";
import { StudioError } from "../../../../../../hub/_lib/studio/claude";
import { trialToMac } from "../../../../../../hub/_lib/studio/trials";
import { studioAction } from "../../../../../../hub/_lib/studio/request";

/* A trial's edit card, so the Mac can make the 5 drafts. */

export async function POST(request: Request) {
  return studioAction(
    request,
    BRAND_ID,
    z.object({ id: z.string().max(40) }),
    async ({ user, body }) => {
      if (!(await canUse(user, "edits"))) throw new StudioError("Edits on your Mac aren't switched on for you yet.");
      return trialToMac(user.id, body.id);
    },
    { needsClaude: false, feature: "brand" },
  );
}
