import type { Metadata } from "next";
import { OFFER } from "../../mentorship/offer";
import OnboardingForm from "../../mentorship/onboarding-form";
import { Shell, Steps } from "../../mentorship/parts";

/* Where Stripe sends people after they buy the course on its own. */

export const metadata: Metadata = {
  title: "You're in — Anyone Can Create",
  robots: { index: false, follow: false },
};

export default function CourseWelcomePage() {
  const { skoolUrl } = OFFER;
  return (
    <Shell>
      <div className="max-w-2xl mx-auto">
        <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Payment received</div>
        <h1 className="mt-4 font-display text-6xl sm:text-7xl leading-[0.92]">
          You&apos;re <em className="text-[color:var(--accent)]">in.</em>
        </h1>
        <p className="mt-6 text-lg text-[color:var(--text-muted)]">Thanks for getting Anyone Can Create. Here&apos;s what happens next.</p>
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
                title: "I'll unlock the course within 24 hours",
                body: "You'll see it in the Skool classroom. Start with the module that matches where you're at.",
              },
              {
                title: "Tell me about you",
                body: "Fill in the short form below so I know where you're at.",
              },
            ]}
          />
        </div>
        <div className="mt-12">
          <OnboardingForm />
        </div>
      </div>
    </Shell>
  );
}
