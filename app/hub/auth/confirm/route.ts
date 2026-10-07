import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { currentUser, serverClient } from "../../_lib/supabase/server";

/* Where the links in sign-up and password-reset emails land. Exchanges the
   one-time token for a session cookie, then shows who's signed in
   (/hub/auth/continue) before carrying on to `next`. */

// Only the kinds of link our emails send: confirm sign-up, reset password.
const TYPES = new Set<string>(["email", "signup", "recovery"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = url.searchParams.get("next")?.startsWith("/hub") ? url.searchParams.get("next")! : "/hub";
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  // Already signed in? Ask before switching accounts, so a link to someone
  // else's account can't quietly replace yours. (A `code` link only works in
  // the browser that asked for it, so it can't be used that way.)
  if (tokenHash && (await currentUser())) {
    const to = new URL("/hub/auth/continue", url.origin);
    to.searchParams.set("link", url.pathname + url.search);
    return NextResponse.redirect(to);
  }

  const db = await serverClient();
  const { error } = code
    ? await db.auth.exchangeCodeForSession(code)
    : tokenHash && type && TYPES.has(type)
      ? await db.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType })
      : { error: new Error("not a link we sent") };

  if (error) return NextResponse.redirect(new URL("/hub/login?error=link", url.origin));
  // Show who's now signed in before carrying on, so a link to someone else's
  // account (sent to trick you into using it) can't go unnoticed.
  const to = new URL("/hub/auth/continue", url.origin);
  to.searchParams.set("next", next);
  if (type === "recovery") to.searchParams.set("reset", "1");
  return NextResponse.redirect(to);
}
