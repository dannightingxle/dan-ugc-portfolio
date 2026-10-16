import { z } from "zod";
import { crossSite } from "../../../hub/_lib/same-origin";
import { studioApiUser } from "../../../hub/_lib/studio/data";
import { studioErrorMessage } from "../../../hub/_lib/studio/claude";
import { getAccounts, saveSettings } from "../../../hub/_lib/accounts/data";

/* Accounts: GET every tracked account with its snapshots; PUT the daily-refresh setting. */

export async function GET() {
  const auth = await studioApiUser("accounts");
  if (!auth.ok) return auth.response;
  try {
    return Response.json(await getAccounts(auth.user.id));
  } catch (e) {
    console.error("Creator Desk accounts:", e);
    return Response.json({ error: studioErrorMessage(e) }, { status: 500 });
  }
}

const Settings = z.object({ autoDaily: z.boolean() });

export async function PUT(request: Request) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const auth = await studioApiUser("accounts");
  if (!auth.ok) return auth.response;
  const parsed = Settings.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request." }, { status: 400 });
  try {
    await saveSettings(auth.user.id, { autoDaily: parsed.data.autoDaily });
    return Response.json(await getAccounts(auth.user.id));
  } catch (e) {
    console.error("Creator Desk accounts:", e);
    return Response.json({ error: studioErrorMessage(e) }, { status: 500 });
  }
}
