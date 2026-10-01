import type { Metadata } from "next";
import Link from "next/link";
import IntroVideo from "./intro-video";
import WaitlistForm from "./waitlist-form";

/* Standalone waitlist page for the UGC mentorship programme. Deliberately not
   in the main site nav - share the /waitlist link directly. */

export const metadata: Metadata = {
  title: "UGC Mentorship Waitlist — Dan Nightingale",
  description:
    "Join the waitlist for Dan Nightingale's UGC mentorship programme - a simple, systemised way to land paid brand deals around your 9-5.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "UGC, made simple - join the waitlist",
    description:
      "The system I use to land paid UGC deals - built for people with a full-time job. Join the waitlist and help shape the programme.",
    type: "website",
  },
};

const POINTS = [
  {
    title: "A system, not guesswork",
    body: "Find brands, pitch, script, film, get paid - the same repeatable steps every time.",
  },
  {
    title: "Built around a 9-5",
    body: "A couple of hours a week. An extra £1k+ a month on the side - or a way out of the day job.",
  },
  {
    title: "More accessible than you think",
    body: "No big following, no fancy kit. Your phone and a plan.",
  },
  {
    title: "One-time fee + 14-day guarantee",
    body: "No subscription. Land your first paid deal in 14 days, or I work with you 1:1 until you do.",
  },
];

export default function WaitlistPage() {
  return (
    <>
      <div className="aurora" />

      <header className="relative z-10 border-b border-[color:var(--border)]">
        <div className="mx-auto max-w-[1200px] flex items-center justify-between px-6 lg:px-10 py-4">
          <Link href="/" className="font-semibold tracking-tight text-[color:var(--text)]">
            Dan Nightingale<span className="text-[color:var(--accent)]">.</span>
          </Link>
          <a
            href="#join"
            className="text-sm font-medium px-4 py-2 rounded-full bg-[color:var(--accent)] text-[color:var(--bg)] hover:bg-[color:var(--accent-hover)] transition-colors"
          >
            Join the waitlist
          </a>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-[1200px] px-6 lg:px-10 pt-12 sm:pt-20 pb-24">
        {/* ---------------- headline ---------------- */}
        <div className="fade-up max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
            <span className="size-1.5 rounded-full bg-[color:var(--accent)] animate-pulse" />
            UGC mentorship · Waitlist open
          </div>
          <h1 className="mt-6 font-display text-6xl sm:text-7xl lg:text-8xl leading-[0.92] tracking-[-0.02em]">
            UGC, made <em className="text-[color:var(--accent)]">simple.</em>
          </h1>
          <p className="mt-6 text-lg sm:text-xl font-medium tracking-tight leading-snug text-[color:var(--text-muted)] max-w-2xl mx-auto">
            Join the waitlist for my UGC mentorship programme - the exact system I use to land paid brand deals,
            so you can add an extra £1,000+ a month around your 9-5, or replace it entirely.
          </p>
        </div>

        {/* ---------------- video + form ---------------- */}
        <div className="mt-12 sm:mt-16 grid lg:grid-cols-[380px_1fr] gap-10 lg:gap-14 items-start">
          <div className="fade-up lg:sticky lg:top-8 flex flex-col gap-8" style={{ animationDelay: "120ms" }}>
            <IntroVideo />
            <ul className="flex flex-col gap-5 max-w-[380px] mx-auto">
              {POINTS.map((p) => (
                <li key={p.title} className="flex gap-3">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[color:var(--accent)]" />
                  <div>
                    <p className="font-medium text-[color:var(--text)]">{p.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-[color:var(--text-muted)]">{p.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div id="join" className="fade-up scroll-mt-8" style={{ animationDelay: "200ms" }}>
            <h2 className="font-display text-4xl sm:text-5xl">
              Help me build it <em className="text-[color:var(--accent)]">for you.</em>
            </h2>
            <p className="mt-4 mb-8 text-[color:var(--text-muted)] max-w-xl">
              I&apos;m shaping the programme around the people on this list. Answer a few quick questions and
              you&apos;ll be first to hear when doors open - with founding-member pricing.
            </p>
            <WaitlistForm />
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-[color:var(--border)]">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-10 py-8 text-xs text-[color:var(--text-dim)]">
          © {new Date().getFullYear()} Dan Nightingale. Your answers are only used to shape the programme and
          let you know when it launches.
        </div>
      </footer>
    </>
  );
}
