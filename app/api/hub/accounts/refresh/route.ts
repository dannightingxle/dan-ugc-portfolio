import { crossSite } from "../../../../hub/_lib/same-origin";
import { studioApiUser } from "../../../../hub/_lib/studio/data";
import { studioErrorMessage } from "../../../../hub/_lib/studio/claude";
import { refreshAccounts } from "../../../../hub/_lib/accounts/data";

/* Pull every account's followers and latest posts now (Apify can take a few minutes). */
export const maxDuration = 300;

export async function POST(request: Request) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const auth = await studioApiUser("accounts");
  if (!auth.ok) return auth.response;
  try {
    return Response.json(await refreshAccounts(auth.user.id));
  } catch (e) {
    console.error("Creator Desk accounts refresh:", e);
    return Response.json({ error: studioErrorMessage(e) }, { status: 500 });
  }
}
