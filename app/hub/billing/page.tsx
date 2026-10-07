import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "../_lib/supabase/server";
import { billingEnabled, billingFor, billingRow, currentOffer, hadTrialBefore } from "../_lib/billing/stripe";
import { emailsConfirmed, isOwnerEmail } from "../_lib/owners";
import { StartTrial } from "./start-trial";

export const metadata: Metadata = { title: "Start your free trial" };

/* The paywall: add a card to start the free trial (or restart a subscription). */
export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const user = await currentUser();
  if (!user) redirect("/hub/login?next=/hub/billing");
  if (!billingEnabled || (await billingFor(user)).hasAccess) redirect("/hub");

  // Had a trial before (this account, or one they deleted)? Then no trial is offered - and none promised.
  const hadTrial = await hadTrialBefore(user, await billingRow(user.id));
  const offer = await currentOffer(hadTrial);
  // On the owner list but not let in: owner access needs Supabase to confirm emails (see LAUNCH.md).
  const ownerOff = isOwnerEmail(user.email) && !(await emailsConfirmed());
  return (
    <StartTrial
      offer={offer}
      name={user.name}
      returning={hadTrial}
      autoStart={params.start === "1" && !ownerOff}
      notice={
        ownerOff
          ? "Your email is on the owner list, but owner access is off until Supabase asks new accounts to confirm their email (Authentication → Sign In / Providers → Email → Confirm email). Turn that on and reload this page."
          : params.canceled
            ? "No problem - you haven't been charged. Start whenever you're ready."
            : params.error
              ? "Something went wrong with checkout. Please try again."
              : null
      }
    />
  );
}
