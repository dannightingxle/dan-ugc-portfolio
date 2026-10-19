import { BRAND_ID, claudeEnabled, listSheets, studioApiUser } from "../../../../hub/_lib/studio/data";
import { apifyEnabled } from "../../../../hub/_lib/studio/apify";
import { getBrand, saveBrand } from "../../../../hub/_lib/studio/brand";
import { cleanHandle } from "../../../../hub/_lib/studio/brand-types";
import { BrandBody, studioAction } from "../../../../hub/_lib/studio/request";

/* The personal brand plan: GET it (with its shoot sheets), PUT edits. */

export async function GET() {
  const auth = await studioApiUser("brand");
  if (!auth.ok) return auth.response;
  const [brand, sheets] = await Promise.all([getBrand(auth.user.id), listSheets(auth.user.id, BRAND_ID)]);
  return Response.json({ brand, sheets, claude: claudeEnabled, apify: apifyEnabled });
}

export async function PUT(request: Request) {
  return studioAction(
    request,
    BRAND_ID,
    BrandBody,
    async ({ user, body }) => {
      const tidy = (list: typeof body.accounts) => list.map((h) => ({ ...h, handle: cleanHandle(h.handle) })).filter((h) => h.handle);
      const current = await getBrand(user.id);
      return saveBrand(user.id, {
        ...current,
        ...body,
        accounts: tidy(body.accounts),
        tracked: tidy(body.tracked),
        ideaAccounts: body.ideaAccounts ? tidy(body.ideaAccounts) : current.ideaAccounts,
        autoIdeas: body.autoIdeas ?? current.autoIdeas,
      });
    },
    { needsClaude: false, feature: "brand" },
  );
}
