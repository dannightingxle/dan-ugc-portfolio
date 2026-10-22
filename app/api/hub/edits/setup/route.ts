import { listDevices } from "../../../../hub/_lib/edits/data";
import { BadRequest, editsApi } from "../../../../hub/_lib/edits/request";
import { createSync, latestSync, setupOverview } from "../../../../hub/_lib/edits/setup";
import { canSyncSetup } from "../../../../hub/_lib/edits/setup-types";
import { HELPER_FOR_SETUP } from "../../../../hub/_lib/edits/style-types";

/* Your editing setup, word for word: GET the files, skills, your Macs and the
   latest sync (?only=sync for just the sync, while it's going), POST to sync
   all your Macs that are on. */

export async function GET(request: Request) {
  const only = new URL(request.url).searchParams.get("only");
  return editsApi(request, null, async ({ user }) => {
    if (only === "sync") return { sync: await latestSync(user.id) };
    const [overview, devices] = await Promise.all([setupOverview(user.id), listDevices(user.id)]);
    return { ...overview, devices: devices.map((d) => ({ id: d.id, name: d.name, online: d.online, helper: d.info.helper ?? null, ready: canSyncSetup(d) })) };
  });
}

export async function POST(request: Request) {
  return editsApi(request, null, async ({ user }) => {
    const devices = await listDevices(user.id);
    if (!devices.length) throw new BadRequest("Connect your Mac first.");
    const on = devices.filter((d) => d.online);
    if (!on.length) throw new BadRequest("None of your Macs is on right now. Start the Creator Desk Helper on them, then try again.");
    const ready = on.filter(canSyncSetup);
    if (!ready.length) throw new BadRequest(`Your Macs need the latest helper (${HELPER_FOR_SETUP}) for this. It updates itself between edits, or close its window and start it again.`);
    return { sync: await createSync(user.id, ready.map((d) => ({ id: d.id, name: d.name }))) };
  });
}
