import type { Metadata } from "next";
import IntroVideo from "../waitlist/intro-video";
import { OFFER } from "./offer";
import { CheckoutButton, Dot, ModuleGrid, Shell } from "./parts";

/* Sales page for the mentorship (the main offer). Prices and the Stripe link
   are in offer.ts. */

export const metadata: Metadata = {
  title: "Anyone Can Create Mentorship — Dan Nightingale",
  description:
    "The UGC mentorship that gets you paid: my exact system for landing paid brand deals around your 9-5, with me and a small group in your corner.",
  openGraph: {
    title: "Anyone Can Create - the UGC mentorship",
    description:
      "Land paid UGC deals around your 9-5, with feedback from me, a private group and referrals to paid tech UGC work.",
    type: "website",
  },
};

const { mentorship, skoolUrl } = OFFER;

const INCLUDED = [
  {
    title: "Me in your corner",
    body: "A private WhatsApp group with me and the other members. Feedback on your content, scripts and pitches, and answers when you're stuck.",
  },
  {
    title: "Referrals to paid tech UGC work",
    body: "I work with tech UGC companies that need good creators. Hit the standard in the course and I'll refer you.",
  },
  {
    title: "The full Anyone Can Create course",
    body: "Eight modules, from your first video to retainers. New lessons drop every Monday.",
  },
  {
    title: "A 30-day guarantee",
    body: "Land your first paid deal in 30 days, or I work with you 1:1 until you do - as long as you've put the work in.",
  },
];

const STAGES = [
  {
    stage: "Never been paid for UGC",
    body: "Start with Tech UGC. Learn the formats tech companies pay for, pass the referral test, and get paid while you build experience.",
  },
  {
    stage: "Made content, no paid deals yet",
    body: "Go to Winning Jobs. The platforms worth your time, turning gifted work into paid, and pitching brands that have budget.",
  },
  {
    stage: "Landed a few deals",
    body: "Get brands coming to you, price properly, and turn one-off briefs into repeat work and retainers.",
  },
];

const BRANDS = [
  { name: "Canva", logo: "/logos/canva.webp" },
  { name: "Sure", logo: "/logos/sure.jpg" },
  { name: "B&M", logo: "/logos/bm-color.png" },
  { name: "Avios", logo: "/logos/avios.png" },
  { name: "Manchester City", logo: "/logos/mancity.webp" },
  { name: "Coors", logo: "/logos/coors.webp" },
  { name: "Shark", logo: "/logos/shark.png" },
  { name: "P&O Ferries", logo: "/logos/po-ferries.jpg" },
];

const FAQS = [
  {
    q: "Do I need a following?",
    a: "No. Brands pay for the video, not your audience. Most UGC never gets posted on the creator's own account.",
  },
  {
    q: "How much time does it take?",
    a: "A couple of hours a week is enough to get going. The course is built around a full-time job.",
  },
  {
    q: "Is it a subscription?",
    a: `No. It's one payment of ${mentorship.price}, and you keep access to the course.`,
  },
  {
    q: "How does the guarantee work?",
    a: "If you haven't landed a paid deal within 30 days of joining, I'll work with you 1:1 until you do. To qualify, show me that in those 30 days you've completed at least half of the course lessons released so far, posted at least 7 times on your personal brand account, and sent at least 10 pitches or applications on UGC platforms.",
  },
  {
    q: "What happens after I pay?",
    a: "You'll get a receipt by email straight away. Within 24 hours I'll add you to the course in Skool and to the WhatsApp group.",
  },
  {
    q: "Not ready yet?",
    a: "Join the free Skool group and watch The A to Z of UGC: what UGC is, where the money is, and how I'd start from zero today.",
  },
];

export default function MentorshipPage() {
  return (
    <Shell cta={{ href: "#join", label: "Join the mentorship" }}>
      {/* ---------------- headline ---------------- */}
      <div className="fade-up max-w-3xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
          <span className="size-1.5 rounded-full bg-[color:var(--accent)] animate-pulse" />
          UGC mentorship · Doors open
        </div>
        <h1 className="mt-6 font-display text-6xl sm:text-7xl lg:text-8xl leading-[0.92] tracking-[-0.02em]">
          Anyone <em className="text-[color:var(--accent)]">Can Create.</em>
        </h1>
        <p className="mt-6 text-lg sm:text-xl font-medium tracking-tight leading-snug text-[color:var(--text-muted)] max-w-2xl mx-auto">
          The UGC mentorship that gets you paid. My exact system for landing paid brand deals around your 9-5, with me
          and a small group in your corner while you do it.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <CheckoutButton url={mentorship.checkoutUrl} label={`Join the mentorship · ${mentorship.price}`} />
          <p className="text-sm text-[color:var(--text-dim)]">One-time payment · 30-day guarantee</p>
        </div>
      </div>

      {/* ---------------- video + what's included ---------------- */}
      <div className="mt-16 sm:mt-24 grid lg:grid-cols-[380px_1fr] gap-10 lg:gap-14 items-center">
        <div className="fade-up" style={{ animationDelay: "120ms" }}>
          <IntroVideo />
        </div>
        <div className="fade-up" style={{ animationDelay: "200ms" }}>
          <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">The mentorship</div>
          <h2 className="mt-4 font-display text-4xl sm:text-5xl">
            What you <em className="text-[color:var(--accent)]">get.</em>
          </h2>
          <ul className="mt-8 flex flex-col gap-6 max-w-xl">
            {INCLUDED.map((p) => (
              <li key={p.title} className="flex gap-3">
                <Dot />
                <div>
                  <p className="font-medium text-[color:var(--text)]">{p.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-[color:var(--text-muted)]">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ---------------- credibility ---------------- */}
      <section className="mt-24 sm:mt-32">
        <div className="max-w-2xl">
          <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Who you&apos;re learning from</div>
          <h2 className="mt-4 font-display text-4xl sm:text-5xl">
            Hi, I&apos;m <em className="text-[color:var(--accent)]">Dan.</em>
          </h2>
          <p className="mt-4 text-[color:var(--text-muted)]">
            A UK UGC creator and ex performance marketer. I&apos;ve generated £150k+ in sales from UGC for one brand in
            9 months, and made content for brands like these - from my phone, around a family.
          </p>
        </div>
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {BRANDS.map((b) => (
            <div key={b.name} title={b.name} className="flex min-h-[72px] items-center justify-center rounded-xl bg-white px-4 py-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={b.logo}
                alt={b.name}
                className="max-h-8 w-auto max-w-full object-contain"
                style={b.whiteAsset ? { filter: "brightness(0)" } : undefined}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- where to start ---------------- */}
      <section className="mt-24 sm:mt-32">
        <div className="max-w-2xl">
          <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Wherever you&apos;re starting</div>
          <h2 className="mt-4 font-display text-4xl sm:text-5xl">
            A clear next <em className="text-[color:var(--accent)]">step.</em>
          </h2>
        </div>
        <div className="mt-10 grid md:grid-cols-3 gap-4">
          {STAGES.map((s) => (
            <div key={s.stage} className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-card)] p-6">
              <p className="font-semibold text-[color:var(--text)]">{s.stage}</p>
              <p className="mt-2 text-sm leading-relaxed text-[color:var(--text-muted)]">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- course outline ---------------- */}
      <section className="mt-24 sm:mt-32">
        <div className="max-w-2xl">
          <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Included in the mentorship</div>
          <h2 className="mt-4 font-display text-4xl sm:text-5xl">
            The <em className="text-[color:var(--accent)]">course.</em>
          </h2>
          <p className="mt-4 text-[color:var(--text-muted)]">
            Eight modules, from your first video to retainers. Start with Tech UGC and Winning Jobs, then a new lesson
            drop every Monday.
          </p>
        </div>
        <div className="mt-10">
          <ModuleGrid />
        </div>
      </section>

      {/* ---------------- join ---------------- */}
      <section id="join" className="mt-24 sm:mt-32 scroll-mt-8">
        <div className="rounded-2xl border border-[color:var(--accent)] bg-[color:var(--accent-soft)] p-6 sm:p-10 grid lg:grid-cols-[1fr_1fr] gap-8 lg:gap-12 items-center">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Join</div>
            <h2 className="mt-3 font-display text-4xl sm:text-5xl">
              The <em className="text-[color:var(--accent)]">mentorship.</em>
            </h2>
            <p className="mt-4 flex items-baseline gap-3">
              <span className="font-display text-6xl">{mentorship.price}</span>
              <span className="text-sm text-[color:var(--text-muted)]">one-time payment</span>
            </p>
            <div className="mt-6">
              <CheckoutButton url={mentorship.checkoutUrl} label="Join the mentorship" />
            </div>
          </div>
          <ul className="flex flex-col gap-3">
            {[...INCLUDED.map((i) => i.title), "No subscription, no following needed"].map((t) => (
              <li key={t} className="flex gap-3">
                <Dot />
                <span className="text-[color:var(--text)]">{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------- questions ---------------- */}
      <section className="mt-24 sm:mt-32 max-w-3xl">
        <h2 className="font-display text-4xl sm:text-5xl">
          Questions<em className="text-[color:var(--accent)]">.</em>
        </h2>
        <div className="mt-8 flex flex-col divide-y divide-[color:var(--border)] border-y border-[color:var(--border)]">
          {FAQS.map((f) => (
            <div key={f.q} className="py-5">
              <p className="font-medium text-[color:var(--text)]">{f.q}</p>
              <p className="mt-1 text-sm leading-relaxed text-[color:var(--text-muted)]">
                {f.a}
                {f.q === "Not ready yet?" && skoolUrl && (
                  <>
                    {" "}
                    <a href={skoolUrl} className="text-[color:var(--accent)] underline underline-offset-4">
                      Join free on Skool
                    </a>
                  </>
                )}
              </p>
            </div>
          ))}
        </div>
      </section>
    </Shell>
  );
}
