import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, tokenFor } from "./app/hub/_lib/auth";
import { SUPABASE_KEY, SUPABASE_URL, accountsEnabled, isAllowed } from "./app/hub/_lib/supabase/config";

/* Guards /hub. With Supabase accounts set up, each visitor must be signed in
   (and on HUB_ALLOWED_EMAILS, if that's set); this also keeps their session
   fresh. Signed-out visitors to /hub see the landing page. Without accounts,
   the older single HUB_PASSWORD gate applies. Whether a signed-in creator has
   paid is checked by the pages and API routes themselves. */

const PUBLIC = [
  "/hub/welcome", // landing page (and its share image)
  "/hub/privacy",
  "/hub/terms",
  "/hub/login",
  "/hub/auth", // email links
  "/api/hub/login",
  "/api/hub/stripe", // Stripe webhooks, verified by signature
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const deny = (reason?: string) => {
    if (pathname.startsWith("/api/")) return Response.json({ error: "Not signed in." }, { status: 401 });
    if (pathname === "/hub" && !reason && accountsEnabled) return NextResponse.redirect(new URL("/hub/welcome", request.url));
    const to = new URL("/hub/login", request.url);
    if (pathname !== "/hub") to.searchParams.set("next", pathname);
    if (reason) to.searchParams.set("error", reason);
    return NextResponse.redirect(to);
  };

  if (accountsEnabled) {
    let response = NextResponse.next({ request });
    const db = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(toSet, headers) {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
        },
      },
    });
    // Verifies the session (refreshing it if needed) - don't trust the cookie alone.
    const { data } = await db.auth.getClaims();
    const email = data?.claims?.email as string | undefined;
    if (isPublic) return response;
    if (!data?.claims) return deny();
    if (!isAllowed(email)) return deny("not_invited");
    return response;
  }

  const password = process.env.HUB_PASSWORD;
  if (!password || isPublic) return NextResponse.next();
  if (request.cookies.get(COOKIE)?.value === (await tokenFor(password))) return NextResponse.next();
  return deny();
}

export const config = {
  matcher: ["/hub/:path*", "/api/hub/:path*"],
};
