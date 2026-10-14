import type { Metadata } from "next";
import { OFFER } from "../offer";
import { Shell, Steps } from "../parts";

/* Where Stripe sends people after they pay for the mentorship. Set this page's
   address as the payment link's "after payment" redirect (see MENTORSHIP.md). */

export const metadata: Metadata = {
  title: "You're in — Anyone Can Create Mentorship",
  robots: { index: false, follow: false },
};

export default function MentorshipWelcomePage() {
  const { skoolUrl } = OFFER;
  return (
    <Shell>
      <div className="max-w-2xl mx-auto">
        <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Payment received</div>
        <h1 className="mt-4 font-display text-6xl sm:text-7xl leading-[0.92]">
          You&apos;re <em className="text-[color:var(--accent)]">in.</em>
        </h1>
        <p className="mt-6 text-lg text-[color:var(--text-muted)]">
          Welcome to the Anyone Can Create Mentorship. Here&apos;s what happens next.
        </p>
        <div className="mt-10">
          <Steps
            steps={[
              {
                title: "Check your email",
                body: "Your receipt is on its way from Stripe.",
              },
              {
                title: "Join the Skool group",
                body: skoolUrl ? (
                  <>
                    Use the email you gave at checkout, so I can find you.{" "}
                    <a href={skoolUrl} className="text-[color:var(--accent)] underline underline-offset-4">
                      Join on Skool
                    </a>
                  </>
                ) : (
                  "I'll email you the link. Use the email you gave at checkout, so I can find you."
                ),
              },
              {
                title: "I'll add you within 24 hours",
                body: "To the full course in Skool and to the mentorship WhatsApp group, using the phone number you gave at checkout.",
              },
              {
                title: "Get started",
                body: "Watch The A to Z of UGC and the pinned welcome post, then introduce yourself in the group.",
              },
            ]}
          />
        </div>
      </div>
    </Shell>
  );
}
