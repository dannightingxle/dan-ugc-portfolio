import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { serverClient } from "../../_lib/supabase/server";

/* Where the links in sign-up and password-reset emails land. Exchanges the
   one-time token for a session cookie, then shows who's signed in
   (/hub/auth/continue) before carrying on to `next`. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = url.searchParams.get("next")?.startsWith("/hub") ? url.searchParams.get("next")! : "/hub";
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const db = await serverClient();
  const { error } = code
    ? await db.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await db.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("missing code") };

  if (error) return NextResponse.redirect(new URL("/hub/login?error=link", url.origin));
  // Show who's now signed in before carrying on, so a link to someone else's
  // account (sent to trick you into using it) can't go unnoticed.
  const to = new URL("/hub/auth/continue", url.origin);
  to.searchParams.set("next", next);
  if (type === "recovery") to.searchParams.set("reset", "1");
  return NextResponse.redirect(to);
}
