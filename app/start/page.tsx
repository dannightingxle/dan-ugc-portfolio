import type { Metadata } from "next";
import OnboardingForm from "../mentorship/onboarding-form";
import { Shell } from "../mentorship/parts";

/* dannightingxle.com/start - the new-member intro form on its own, to send to
   members who joined before it was on the "You're in" page. Unlisted. */

export const metadata: Metadata = {
  title: "Tell me about you — Anyone Can Create",
  robots: { index: false, follow: false },
};

export default function StartPage() {
  return (
    <Shell>
      <div className="max-w-2xl mx-auto">
        <OnboardingForm />
      </div>
    </Shell>
  );
}
