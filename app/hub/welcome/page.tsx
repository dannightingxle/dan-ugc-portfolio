import type { Metadata } from "next";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { BRAND } from "../_lib/brand";
import { currentUser } from "../_lib/supabase/server";
import { accountsEnabled } from "../_lib/supabase/config";
import { billingEnabled, currentOffer } from "../_lib/billing/stripe";
import home from "../../../public/hub/screens/home.webp";
import phone from "../../../public/hub/screens/phone.webp";
import board from "../../../public/hub/screens/board.webp";
import project from "../../../public/hub/screens/project.webp";
import ad from "../../../public/hub/screens/ad.webp";
import avatar from "../../../public/dan-avatar.jpg";

/* The public landing page - what people see when you share the link. */

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name} – ${BRAND.tagline.toLowerCase()}` },
  description: BRAND.description,
  robots: { index: true, follow: true },
  openGraph: { title: `${BRAND.name} – ${BRAND.tagline.toLowerCase()}`, description: BRAND.description, type: "website" },
  twitter: { card: "summary_large_image" },
};

/** The founder's note. Edit freely - it's the most personal part of the page. */
const FOUNDER = {
  name: "Dan Nightingale",
  role: "UGC creator & founder",
  note:
    "I was tracking brand deals across notes, emails and spreadsheets, and checking how my ads were doing on TrendTrack every few days. Creator Desk is the tool I wanted for all of it - so I built it.",
};

const FEATURES: { title: string; body: string; points: string[]; image: StaticImageData; alt: string }[] = [
  {
    title: "Pitch to paid, on one board",
    body: "Every brand deal in one place, from the first pitch to the money landing.",
    points: ["See what you've earned, what's invoiced and what's overdue", "A coming-up list so no deadline sneaks up on you", "Export your payments for your accountant in one click"],
    image: board,
    alt: "Projects board with deals in each stage from Pitched to Paid",
  },
  {
    title: "Briefs that don't go missing",
    body: "Everything about a job lives with the job - not scattered across DMs and email threads.",
    points: [
      "Deliverables checklist with formats and lengths",
      "Usage rights, exclusivity and revisions in writing",
      "The contact, with one tap to email or WhatsApp",
      "Links to the Notion brief, Drive folder and product page",
    ],
    image: project,
    alt: "A project page with deliverables, the brief, payment and contact details",
  },
  {
    title: "See how your ads are really doing",
    body: "Find the ads you're in across brand accounts and watch their reach grow - then show it off.",
    points: ["Reach over time, days running and estimated spend", "Star the ads you're in and track them all in one place", "Share cards for your stories and pitch deck"],
    image: ad,
    alt: "An ad's reach over time with total reach and days running",
  },
];

function trialLength(days: number) {
  return days >= 28 ? `${Math.round(days / 30)} months` : `${days} days`;
}

export default async function Welcome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const [user, offer] = await Promise.all([currentUser(), billingEnabled ? currentOffer() : null]);
  const signedIn = Boolean(user) || !accountsEnabled;
  const cta = signedIn ? { href: "/hub", label: "Open your desk" } : { href: "/hub/login?mode=signup", label: "Start your free trial" };
  const trial = offer && offer.trialDays > 0 ? trialLength(offer.trialDays) : null;
  const small = offer
    ? `${trial ? `${trial} free, then ` : ""}${offer.price ?? "one simple monthly price"}. Card required - cancel any time before your trial ends and you won't pay a thing.`
    : "Free while we're in early access.";

  return (
    <div className="-mt-6 space-y-24 pb-8 sm:space-y-32">
      {params.deleted && (
        <p className="mx-auto mt-6 max-w-xl rounded-xl bg-bg-elevated px-4 py-3 text-center text-sm text-text-muted">
          Your account and everything in it has been deleted. Sorry to see you go.
        </p>
      )}

      {/* Hero */}
      <section className="space-y-10 pt-12 text-center sm:pt-20">
        {offer?.founder && (
          <p className="mx-auto inline-flex flex-wrap items-center justify-center gap-x-2 rounded-full border border-accent/20 bg-accent-soft px-4 py-1.5 text-sm text-accent">
            <strong>Founding offer:</strong> {trialLength(offer.trialDays)} free for the first {offer.founderSlots} creators
            <span className="font-semibold">
              · {offer.spotsLeft} spot{offer.spotsLeft === 1 ? "" : "s"} left
            </span>
          </p>
        )}
        <div className="mx-auto max-w-3xl space-y-5">
          <h1 className="font-serif text-5xl leading-[1.05] sm:text-7xl">Run your UGC business from one desk.</h1>
          <p className="mx-auto max-w-2xl text-lg text-text-muted sm:text-xl">
            Brand deals, briefs, invoices and the ads you&apos;re in - all in one place. Built by a UGC creator, for UGC creators.
          </p>
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap justify-center gap-3">
            <Link href={cta.href} className="rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-on-accent shadow-sm transition hover:bg-accent-hover">
              {cta.label}
            </Link>
            <a href="#features" className="rounded-xl border border-border bg-bg-card px-6 py-3.5 text-base font-medium hover:border-border-strong">
              See how it works
            </a>
          </div>
          {!signedIn && <p className="text-sm text-text-dim">{small}</p>}
        </div>
        <div className="relative mx-auto max-w-5xl">
          <Frame>
            <Image src={home} alt="The Creator Desk home screen: earnings, upcoming projects and tracked ads" priority sizes="(min-width: 1024px) 1024px, 100vw" className="h-auto w-full" />
          </Frame>
          <div className="absolute -bottom-10 -right-4 hidden w-48 overflow-hidden rounded-[28px] border-[6px] border-text bg-bg shadow-2xl md:block lg:-right-10 lg:w-56">
            <Image src={phone} alt="Creator Desk on a phone" sizes="224px" className="h-auto w-full" />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-24 space-y-20 sm:space-y-28">
        {FEATURES.map((f, i) => (
          <div key={f.title} className="grid items-center gap-8 lg:grid-cols-[5fr_7fr] lg:gap-14">
            <div className={`space-y-4 ${i % 2 ? "lg:order-2" : ""}`}>
              <h2 className="font-serif text-3xl sm:text-4xl">{f.title}</h2>
              <p className="text-lg text-text-muted">{f.body}</p>
              <ul className="space-y-2.5">
                {f.points.map((p) => (
                  <li key={p} className="flex gap-2.5">
                    <span className="mt-0.5 text-accent">✓</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            <Frame>
              <Image src={f.image} alt={f.alt} sizes="(min-width: 1024px) 640px, 100vw" className="h-auto w-full" />
            </Frame>
          </div>
        ))}
        <p className="text-center text-sm text-text-dim">
          Ad tracking uses your own{" "}
          <a href={process.env.NEXT_PUBLIC_TRENDTRACK_URL || "https://www.trendtrack.io"} target="_blank" rel="noreferrer" className="underline hover:text-text">
            TrendTrack
          </a>{" "}
          account. Everything else works without it. <span className="whitespace-nowrap">Script &amp; shot-list builder coming soon.</span>
        </p>
      </section>

      {/* Founder note */}
      <section className="mx-auto max-w-3xl">
        <figure className="flex flex-col items-center gap-6 rounded-3xl border border-border bg-bg-card p-8 text-center sm:flex-row sm:p-10 sm:text-left">
          <Image src={avatar} alt={FOUNDER.name} width={96} height={96} className="h-24 w-24 shrink-0 rounded-full object-cover" />
          <div className="space-y-3">
            <blockquote className="text-lg leading-relaxed">&ldquo;{FOUNDER.note}&rdquo;</blockquote>
            <figcaption className="text-sm text-text-muted">
              <strong className="text-text">{FOUNDER.name}</strong> · {FOUNDER.role}
            </figcaption>
          </div>
        </figure>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-md scroll-mt-24 space-y-6 text-center">
        <h2 className="font-serif text-4xl">One plan. Everything in.</h2>
        <div className="space-y-5 rounded-3xl border border-border bg-bg-card p-8 text-left shadow-sm">
          {offer?.price && (
            <p>
              <span className="font-serif text-5xl">{offer.price.split("/")[0]}</span>
              <span className="text-text-muted">{offer.price.includes("/") ? ` / ${offer.price.split("/")[1]}` : ""}</span>
            </p>
          )}
          {trial && (
            <p className="rounded-xl bg-accent-soft px-4 py-2.5 text-sm text-accent">
              <strong>{trial} free</strong>
              {offer?.founder ? ` - founding offer for the first ${offer.founderSlots} creators` : " to try it properly"}
            </p>
          )}
          <ul className="space-y-2.5 text-sm">
            {["Unlimited projects, briefs and contacts", "Earnings, invoices and overdue tracking", "Ad tracking with your TrendTrack account", "Share cards, CSV exports, phone-friendly", "Script & shot-list builder when it lands"].map((p) => (
              <li key={p} className="flex gap-2.5">
                <span className="text-accent">✓</span>
                {p}
              </li>
            ))}
          </ul>
          <Link href={cta.href} className="block rounded-xl bg-accent py-3.5 text-center font-semibold text-on-accent hover:bg-accent-hover">
            {cta.label}
          </Link>
          {!signedIn && <p className="text-center text-xs text-text-dim">{small}</p>}
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-2xl space-y-6">
        <h2 className="text-center font-serif text-4xl">Questions</h2>
        <div className="divide-y divide-border rounded-2xl border border-border bg-bg-card">
          {[
            [
              "Do I need TrendTrack?",
              "No. Projects, briefs, contacts and payments all work on their own. To find and track the ads you're in, connect your own TrendTrack account (a plan with API access) - it takes a minute.",
            ],
            [
              "Why do you need my card for a free trial?",
              "It keeps the trial for real creators. You won't be charged a penny until your trial ends, we'll remind you before it does, and you can cancel in a couple of clicks from your account.",
            ],
            ["How do I cancel?", "Account → Manage billing → Cancel. You keep access until the end of what you've paid for, and you can download all your data any time."],
            ["Is my data private?", "Yes. Your projects, contacts and tracked ads are only visible to you. We don't sell data, and you can delete your account and everything in it whenever you like."],
            ["Does it work on my phone?", "Yes - it's built for phones as much as laptops, so you can check a brief or log a payment on the go."],
          ].map(([q, a]) => (
            <details key={q} className="group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {q}
                <span className="text-text-dim transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final call */}
      {!signedIn && (
        <section className="mx-auto max-w-3xl space-y-5 rounded-3xl bg-accent px-6 py-12 text-center text-on-accent sm:px-12">
          <h2 className="font-serif text-4xl">Give your UGC business a proper desk.</h2>
          <Link href={cta.href} className="inline-block rounded-xl bg-bg-card px-6 py-3.5 font-semibold text-accent hover:opacity-90">
            {cta.label}
          </Link>
        </section>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-8 text-sm text-text-dim">
        <p>
          © {new Date().getFullYear()} {BRAND.name}
        </p>
        <nav className="flex gap-5">
          <Link href="/hub/privacy" className="hover:text-text">
            Privacy
          </Link>
          <Link href="/hub/terms" className="hover:text-text">
            Terms
          </Link>
          {BRAND.supportEmail && (
            <a href={`mailto:${BRAND.supportEmail}`} className="hover:text-text">
              Contact
            </a>
          )}
        </nav>
      </footer>
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-bg-card shadow-[0_20px_60px_-20px_rgba(15,23,42,0.25)]">
      <div className="flex gap-1.5 border-b border-border px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
      </div>
      {children}
    </div>
  );
}
