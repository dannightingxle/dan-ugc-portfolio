import { NotConnected } from "./trendtrack";

/** Turn a TrendTrack failure into a response the pages understand. */
export function trendTrackError(e: unknown) {
  if (e instanceof NotConnected) return Response.json({ error: e.message, code: "not_connected" }, { status: 409 });
  console.error("Creator Desk: TrendTrack call failed", e);
  return Response.json({ error: (e as Error).message || "Something went wrong talking to TrendTrack." }, { status: 502 });
}
