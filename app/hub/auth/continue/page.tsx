import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "../../_lib/supabase/server";
import { SignOut } from "./not-you";

export const metadata: Metadata = { title: "You're signed in" };

const button = "block w-full rounded-xl bg-accent py-3 font-semibold text-on-accent hover:bg-accent-hover";

/* After an email link: say who's signed in, then carry on. Also where a link
   opened while already signed in waits (`link`), so switching accounts is
   never silent. */
export default async function Continue({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const user = await currentUser();
  const link = params.link?.startsWith("/hub/auth/confirm?") ? params.link : null;
  if (!user) redirect(link ?? "/hub/login");

  if (link) {
    return (
      <div className="mx-auto max-w-sm space-y-6 py-16 text-center">
        <div className="space-y-2">
          <h1 className="font-serif text-3xl">You&apos;re already signed in</h1>
          <p className="text-text-muted">
            You&apos;re signed in as <strong className="text-text">{user.email}</strong>. To use this email link, we&apos;ll sign you out first.
          </p>
        </div>
        <SignOut then={link} className={button}>
          Sign out and use the link
        </SignOut>
        <Link href="/hub" className="block text-sm text-text-dim hover:text-text">
          Stay signed in as {user.email}
        </Link>
      </div>
    );
  }

  const next = params.next?.startsWith("/hub") ? params.next : "/hub";
  return (
    <div className="mx-auto max-w-sm space-y-6 py-16 text-center">
      <div className="space-y-2">
        <h1 className="font-serif text-3xl">{params.reset ? "Choose a new password" : "Email confirmed"}</h1>
        <p className="text-text-muted">
          You&apos;re signed in as <strong className="text-text">{user.email}</strong>.
        </p>
      </div>
      <Link href={next} className={button}>
        Continue
      </Link>
      <SignOut />
    </div>
  );
}
