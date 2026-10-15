import { listDevices, newPairCode, removeDevice } from "../../../../hub/_lib/edits/data";
import { editsApi } from "../../../../hub/_lib/edits/request";

/* Your connected Macs: list them, get a code to connect another, or disconnect one (?id=). */

export async function GET(request: Request) {
  return editsApi(request, null, async ({ user }) => ({ devices: await listDevices(user.id) }));
}

export async function POST(request: Request) {
  return editsApi(request, null, async ({ user }) => newPairCode(user.id));
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  return editsApi(request, null, async ({ user }) => {
    if (/^[0-9a-f-]{36}$/i.test(id)) await removeDevice(user.id, id);
  });
}
