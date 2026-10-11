import { BRAND_ID } from "../../../../../hub/_lib/studio/data";
import { apifyEnabled } from "../../../../../hub/_lib/studio/apify";
import { refreshStats } from "../../../../../hub/_lib/studio/brand";
import { Empty, studioAction } from "../../../../../hub/_lib/studio/request";

/* Pull the latest public stats for your accounts and tracked creators. */
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!apifyEnabled) return Response.json({ error: "Add APIFY_TOKEN in Vercel to pull stats automatically." }, { status: 503 });
  return studioAction(request, BRAND_ID, Empty, ({ user }) => refreshStats(user.id), { needsClaude: false, feature: "brand" });
}
