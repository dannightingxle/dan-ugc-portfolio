import { source } from "../../../hub/_lib/trendtrack";

export async function GET() {
  return Response.json({ source: source() });
}
