import { z } from "zod";
import { crossSite } from "../../../hub/_lib/same-origin";
import { studioApiUser } from "../../../hub/_lib/studio/data";
import { BufferError, bufferCalendar, bufferFailure, bufferStatus, connectBuffer, disconnectBuffer } from "../../../hub/_lib/buffer/data";

/* Buffer: GET whether you're connected and, if so, your calendar (?refresh=1
   fetches it again now); POST an API key to connect; DELETE to disconnect. */

export async function GET(request: Request) {
  const auth = await studioApiUser("calendar");
  if (!auth.ok) return auth.response;
  try {
    const status = await bufferStatus(auth.user.id);
    if (!status.connected) return Response.json({ status });
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    return Response.json({ status, calendar: await bufferCalendar(auth.user.id, refresh) });
  } catch (e) {
    // Still connected, but Buffer said no: the page shows why, with the calendar it had.
    if (e instanceof BufferError) return Response.json({ status: await bufferStatus(auth.user.id), error: e.message });
    return bufferFailure(e);
  }
}

const Connect = z.object({ apiKey: z.string().trim().min(10, "Paste the whole key.").max(500) });

export async function POST(request: Request) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const auth = await studioApiUser("calendar");
  if (!auth.ok) return auth.response;
  const parsed = Connect.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Bad request." }, { status: 400 });
  try {
    return Response.json(await connectBuffer(auth.user.id, parsed.data.apiKey));
  } catch (e) {
    return bufferFailure(e);
  }
}

export async function DELETE(request: Request) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const auth = await studioApiUser("calendar");
  if (!auth.ok) return auth.response;
  await disconnectBuffer(auth.user.id);
  return Response.json({ ok: true });
}
