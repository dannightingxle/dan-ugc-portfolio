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

const COURSES = [
  {
    title: "Start Here",
    body: "How UGC really makes money (briefs, outreach, retainers, dedicated accounts), picking your niche, kit on a budget, and your first 30 days.",
  },
  {
    title: "Content That Converts",
    body: "How brands actually judge a UGC ad, hooks and the first 3 seconds, scripting, reading a brief properly, filming, batching a shoot, and light editing.",
  },
  {
    title: "Portfolio and Personal Brand",
    body: "Building your portfolio and your site, and using your own TikTok to bring brands to you.",
  },
  {
    title: "Tech UGC: Your First Paid Work",
    body: "If you've never been paid for UGC before, start here. Low barrier, repeatable formats, and you get paid while you build experience.",
    tag: "Start here if you're new",
  },
  {
    title: "Winning Jobs",
    body: "The platforms worth your time, applications that actually win, outreach using the Meta Ad Library, rate cards, usage rights and keeping clients.",
  },
  {
    title: "Tools, AI and Workflow",
    body: "Using AI for briefs, scripts and shot lists, the apps I use, and handing off to an editor.",
  },
  {
    title: "The Business Side",
    body: "Contracts, deposits, invoicing, tax basics, and staying compliant.",
  },
  {
    title: "Mentality, Routine and Health",
    body: "Handling rejection and slow months, and a weekly routine that fits around a job and a family.",
  },
];

const MENTORSHIP = [
  "Feedback on your content, scripts and pitches",
  "Ask questions and get unstuck",
  "Share wins (and the tough weeks) with people doing the same",
  "Me in there, helping you towards your UGC goals",
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

        {/* ---------------- course outline ---------------- */}
        <section className="mt-24 sm:mt-32">
          <div className="max-w-2xl">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">What&apos;s inside</div>
            <h2 className="mt-4 font-display text-4xl sm:text-5xl">
              Anyone <em className="text-[color:var(--accent)]">Can Create.</em>
            </h2>
            <p className="mt-4 text-[color:var(--text-muted)]">
              Zero experience, zero followers - it doesn&apos;t matter. Here&apos;s everything you get.
            </p>
          </div>

          <div className="mt-10 rounded-2xl border border-[color:var(--accent)] bg-[color:var(--accent-soft)] p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-[color:var(--accent)] px-3 py-1 text-xs font-semibold text-[color:var(--bg)]">
                Free
              </span>
              <h3 className="text-xl font-semibold">The A to Z of UGC</h3>
              <span className="text-sm text-[color:var(--text-dim)]">30 mins</span>
            </div>
            <p className="mt-3 text-[color:var(--text-muted)] max-w-2xl">
              What UGC actually is, where the money is, and exactly how I&apos;d start from zero today. Anyone can
              watch it.
            </p>
          </div>

          <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {COURSES.map((c, i) => (
              <div
                key={c.title}
                className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-card)] p-6 flex flex-col"
              >
                <span className="font-display text-4xl text-[color:var(--accent)]">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-3 font-semibold text-[color:var(--text)]">{c.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[color:var(--text-muted)]">{c.body}</p>
                {c.tag && (
                  <span className="mt-4 self-start rounded-full border border-[color:var(--accent)] px-3 py-1 text-xs text-[color:var(--accent)]">
                    {c.tag}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-card)] p-6 sm:p-8 grid lg:grid-cols-[1fr_1.2fr] gap-6 lg:gap-10">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">On top of the course</div>
              <h3 className="mt-3 font-display text-3xl sm:text-4xl">
                The <em className="text-[color:var(--accent)]">mentorship</em>
              </h3>
              <p className="mt-3 text-[color:var(--text-muted)]">
                You won&apos;t be doing this on your own. Mentorship members join a private group with me.
              </p>
            </div>
            <ul className="flex flex-col gap-3 self-center">
              {MENTORSHIP.map((m) => (
                <li key={m} className="flex gap-3">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[color:var(--accent)]" />
                  <span className="text-[color:var(--text)]">{m}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-10 text-center">
            <a
              href="#join"
              className="inline-flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-full bg-[color:var(--accent)] text-[color:var(--bg)] hover:bg-[color:var(--accent-hover)] transition-colors"
            >
              Join the waitlist
            </a>
          </div>
        </section>
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
