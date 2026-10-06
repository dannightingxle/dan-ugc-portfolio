import { COOKIE, tokenFor } from "../../../hub/_lib/auth";

export async function POST(request: Request) {
  const password = process.env.HUB_PASSWORD;
  const body = await request.json().catch(() => ({}));
  if (!password || body?.password !== password) {
    return Response.json({ error: "Wrong password." }, { status: 401 });
  }
  const res = Response.json({ ok: true });
  res.headers.set(
    "Set-Cookie",
    `${COOKIE}=${await tokenFor(password)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 90}`,
  );
  return res;
}
