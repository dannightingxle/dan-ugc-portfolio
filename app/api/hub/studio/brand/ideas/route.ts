import { BRAND_ID } from "../../../../../hub/_lib/studio/data";
import { scanIdeas, setIdeaStatus } from "../../../../../hub/_lib/studio/brand";
import { Empty, IdeaStatusBody, studioAction } from "../../../../../hub/_lib/studio/request";

/* The ideas inbox: POST looks for new ideas in the latest stats, PATCH saves,
   picks or turns down one idea. */
export const maxDuration = 300;

export async function POST(request: Request) {
  return studioAction(request, BRAND_ID, Empty, ({ user }) => scanIdeas(user), { feature: "brand" });
}

export async function PATCH(request: Request) {
  return studioAction(request, BRAND_ID, IdeaStatusBody, ({ user, body }) => setIdeaStatus(user.id, body.id, body.status, body.reason), { needsClaude: false, feature: "brand" });
}
