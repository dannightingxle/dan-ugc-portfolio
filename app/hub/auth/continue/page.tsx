import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "../../_lib/supabase/server";
import { NotYou } from "./not-you";

export const metadata: Metadata = { title: "You're signed in" };

/* After an email link: say who's signed in, then carry on. */
export default async function Continue({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const user = await currentUser();
  if (!user) redirect("/hub/login");
  const next = params.next?.startsWith("/hub") ? params.next : "/hub";
  return (
    <div className="mx-auto max-w-sm space-y-6 py-16 text-center">
      <div className="space-y-2">
        <h1 className="font-serif text-3xl">{params.reset ? "Choose a new password" : "Email confirmed"}</h1>
        <p className="text-text-muted">
          You&apos;re signed in as <strong className="text-text">{user.email}</strong>.
        </p>
      </div>
      <Link href={next} className="block rounded-xl bg-accent py-3 font-semibold text-on-accent hover:bg-accent-hover">
        Continue
      </Link>
      <NotYou />
    </div>
  );
}
