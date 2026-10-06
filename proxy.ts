import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, tokenFor } from "./app/hub/_lib/auth";

/* Keeps /hub private once HUB_PASSWORD is set. */
export async function proxy(request: NextRequest) {
  const password = process.env.HUB_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname === "/hub/login" || pathname === "/api/hub/login") return NextResponse.next();
  if (request.cookies.get(COOKIE)?.value === (await tokenFor(password))) return NextResponse.next();

  if (pathname.startsWith("/api/")) return Response.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.redirect(new URL("/hub/login", request.url));
}

export const config = {
  matcher: ["/hub/:path*", "/api/hub/:path*"],
};
