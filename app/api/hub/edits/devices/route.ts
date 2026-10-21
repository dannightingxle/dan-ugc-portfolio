import { z } from "zod";
import { listDevices, newPairCode, removeDevice, setMaxEdits } from "../../../../hub/_lib/edits/data";
import { editsApi } from "../../../../hub/_lib/edits/request";
import { MAX_EDITS_CHOICES } from "../../../../hub/_lib/edits/types";

/* Your connected Macs: list them, get a code to connect another, change how many edits one runs at once, or disconnect one (?id=). */

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

export async function PATCH(request: Request) {
  const Body = z.object({ id: z.string().regex(/^[0-9a-f-]{36}$/i), maxEdits: z.number().int().min(1).max(Math.max(...MAX_EDITS_CHOICES)) });
  return editsApi(request, Body, async ({ user, body }) => {
    await setMaxEdits(user.id, body.id, body.maxEdits);
  });
}
