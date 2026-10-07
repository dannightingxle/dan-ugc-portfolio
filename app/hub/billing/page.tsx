import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "../_lib/supabase/server";
import { billingEnabled, billingFor, billingRow, currentOffer } from "../_lib/billing/stripe";
import { StartTrial } from "./start-trial";

export const metadata: Metadata = { title: "Start your free trial" };

/* The paywall: add a card to start the free trial (or restart a subscription). */
export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const user = await currentUser();
  if (!user) redirect("/hub/login?next=/hub/billing");
  if (!billingEnabled || (await billingFor(user)).hasAccess) redirect("/hub");

  const row = await billingRow(user.id);
  const offer = await currentOffer(row?.had_subscription ?? false);
  return (
    <StartTrial
      offer={offer}
      name={user.name}
      returning={Boolean(row?.had_subscription)}
      autoStart={params.start === "1"}
      notice={params.canceled ? "No problem - you haven't been charged. Start whenever you're ready." : params.error ? "Something went wrong with checkout. Please try again." : null}
    />
  );
}
