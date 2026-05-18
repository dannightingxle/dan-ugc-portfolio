"use client";

import Link from "next/link";
import { useState } from "react";

const NAV = [
  { href: "#work", label: "Work" },
  { href: "#brands", label: "Brands" },
  { href: "#niches", label: "Niches" },
  { href: "#process", label: "Process" },
  { href: "#rates", label: "Rates" },
  { href: "#duo", label: "Duo" },
  { href: "#contact", label: "Contact" },
];

const STATS = [
  { value: "10+", label: "Years in marketing" },
  { value: "UK", label: "Based in" },
  { value: "48h", label: "Concept turnaround" },
  { value: "2", label: "Creators (with wife)" },
];

const FEATURED_BRANDS: { name: string; domain: string }[] = [
  { name: "Neutonic", domain: "neutonic.com" },
  { name: "JustFloow", domain: "justfloow.com" },
  { name: "Puma", domain: "puma.com" },
  { name: "Anker", domain: "anker.com" },
  { name: "MyProtein", domain: "myprotein.com" },
];

const ALL_BRANDS = [
  "Huel",
  "Meoky",
  "Applied Nutrition",
  "Warrior Supplements",
  "Chilly's",
  "L'Oréal",
  "Perfect Ted",
  "Surreal",
  "Wellgard",
];

const SERVICES = [
  {
    title: "Concept + script",
    body: "I write the hook, the body and the CTA. Performance-tested structure, not vibes.",
  },
  {
    title: "Filming",
    body: "Mobile-first, lit and framed for paid social. Multi-hook variations on request.",
  },
  {
    title: "Editing",
    body: "Cuts, captions, B-roll, sound design. Delivered ready to push as an ad.",
  },
  {
    title: "Multi-platform",
    body: "TikTok, Reels, Meta + YouTube Shorts. Aspect ratios sorted on delivery.",
  },
];

const NICHES = [
  { name: "Supplements & health", note: "Protein, longevity, sleep, gut" },
  { name: "Fitness & wellness", note: "Apps, equipment, recovery" },
  { name: "Productivity & SaaS", note: "Where my marketing brain is a moat" },
  { name: "Personal finance", note: "Investing apps, neobanks, money tools" },
  { name: "Travel & lifestyle", note: "Family travel, gear, weekenders" },
  { name: "Family & parenting", note: "Stronger with my wife — see Duo" },
];

// To populate the Work grid with real TikToks, replace videoId with the
// long number at the end of a video URL:
//   https://www.tiktok.com/@dansdailydeals/video/7398765432109876543
//                                              ^^^^^^^^^^^^^^^^^^^
// Leave videoId empty to keep the existing placeholder card.
type WorkItem = {
  category: string;
  title: string;
  duration: string;
  videoId?: string;
};

const WORK: WorkItem[] = [
  { category: "Neutonic", title: "Nootropic drink — talking to camera", duration: "30s", videoId: "" },
  { category: "JustFloow", title: "Supplement routine — voiceover + B-roll", duration: "45s", videoId: "" },
  { category: "MyProtein", title: "Protein review — POV unboxing", duration: "30s", videoId: "" },
  { category: "Puma", title: "Sportswear — lifestyle demo", duration: "30s", videoId: "" },
  { category: "Anker", title: "Tech product — problem to solution", duration: "45s", videoId: "" },
  { category: "Family", title: "Couple-POV with wife — family product demo", duration: "45s", videoId: "" },
];

const PROCESS = [
  {
    n: "01",
    title: "Brief",
    body: "Send me the product + a sentence on the angle. Or just the product — I'll concept.",
  },
  {
    n: "02",
    title: "Concept",
    body: "Within 48 hours: script, hook variations, shot list. We lock direction before I film.",
  },
  {
    n: "03",
    title: "Film + edit",
    body: "3–5 days. Mobile-first, paid-ad ready, captions burned in, sound designed.",
  },
  {
    n: "04",
    title: "Deliver",
    body: "Final cuts, raw footage on request, 2 rounds of revisions included.",
  },
];

const RATES = [
  {
    name: "Starter",
    price: "£100",
    cadence: "per video",
    desc: "Up to 30s. One hook. Organic usage. Great for testing the relationship.",
    features: ["Up to 30 seconds", "1 hook + body + CTA", "Organic usage only", "2 revisions"],
  },
  {
    name: "Standard",
    price: "£250",
    cadence: "per video",
    desc: "30–60s. Up to 3 hook variations for paid testing. 30 days paid usage included.",
    features: [
      "Up to 60 seconds",
      "3 hook variations",
      "30 days paid usage included",
      "Captions + sound design",
      "2 revisions",
    ],
    featured: true,
  },
  {
    name: "Performance",
    price: "From £500",
    cadence: "per video",
    desc: "Full creative direction, repeat usage rights, posted on my channels if needed.",
    features: [
      "60s+ or vertical sequence",
      "Up to 5 hook variations",
      "Extended paid usage rights",
      "Optional post on my socials",
      "Priority turnaround",
    ],
  },
];

export default function Home() {
  return (
    <>
      <header className="sticky top-0 z-50 backdrop-blur-md bg-[color:var(--bg)]/80 border-b border-[color:var(--border)]">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 py-4">
          <Link href="/" className="font-semibold tracking-tight text-[color:var(--text)]">
            Dan Nightingale<span className="text-[color:var(--accent)]">.</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-[color:var(--text-muted)]">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="hover:text-[color:var(--text)] transition-colors"
              >
                {n.label}
              </a>
            ))}
          </nav>
          <a
            href="#contact"
            className="text-sm font-medium px-4 py-2 rounded-full bg-[color:var(--accent)] text-[color:var(--bg)] hover:bg-[color:var(--accent-hover)] transition-colors"
          >
            Work with me
          </a>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="aurora" />
        <div className="relative mx-auto max-w-[1440px] px-6 lg:px-10 py-16 sm:py-20 lg:py-28">
          <div className="grid lg:grid-cols-[1fr_1.15fr] gap-10 lg:gap-16 items-stretch lg:min-h-[680px] fade-up">
            <div className="order-2 lg:order-1 flex flex-col justify-center">
              <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)] mb-6">
                <span className="size-1.5 rounded-full bg-[color:var(--accent)] animate-pulse" />
                Available for new briefs · UK
              </div>
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[0.95] mb-5">
                Dan Nightingale
              </h1>
              <p className="text-xl sm:text-2xl lg:text-[28px] font-medium tracking-tight leading-snug text-[color:var(--text)]">
                Marketing-trained <span className="text-[color:var(--accent)]">UGC</span> for dads,
                families and grown-up brands.
              </p>
              <p className="mt-5 text-sm sm:text-base text-[color:var(--text-muted)] leading-relaxed max-w-xl">
                I write, film and edit UGC built to convert — not just look good. 10+ years in
                performance marketing, a wife who creates too, zero interest in pretending to be 22.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
                <HeroLink
                  href="https://www.tiktok.com/@dansdailydeals"
                  label="TikTok"
                  handle="@dansdailydeals"
                />
                <HeroLink
                  href="https://www.instagram.com/dannightingaleugc"
                  label="Instagram"
                  handle="@dannightingaleugc"
                />
                <HeroLink
                  href="mailto:hello@dannightingale.com?subject=UGC brief"
                  label="Email"
                  handle="hello@dannightingale.com"
                />
              </div>
            </div>

            <div className="order-1 lg:order-2 relative rounded-3xl overflow-hidden border border-[color:var(--border)] bg-[color:var(--bg-card)] aspect-[4/3] lg:aspect-auto lg:h-full lg:min-h-[640px] shadow-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/dan-hero.jpg"
                alt="Dan Nightingale and family"
                className="w-full h-full object-cover"
                style={{ objectPosition: "70% 35%" }}
              />
            </div>
          </div>
        </div>

        <div className="relative border-y border-[color:var(--border)] bg-[color:var(--bg-elevated)]/40">
          <div className="mx-auto max-w-6xl grid grid-cols-2 md:grid-cols-4">
            {STATS.map((s, i) => (
              <div
                key={s.label}
                className={`px-6 py-8 ${
                  i === 1 || i === 3 ? "border-l border-[color:var(--border)]" : ""
                } ${i >= 2 ? "border-t md:border-t-0 border-[color:var(--border)]" : ""} ${
                  i === 2 ? "md:border-l border-[color:var(--border)]" : ""
                }`}
              >
                <div className="text-3xl sm:text-4xl font-semibold tracking-tight text-[color:var(--text)]">
                  {s.value}
                </div>
                <div className="mt-1 text-xs uppercase tracking-wider text-[color:var(--text-dim)]">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="brands"
        className="relative border-b border-[color:var(--border)] bg-[color:var(--bg-elevated)]/20"
      >
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="text-center text-xs uppercase tracking-[0.18em] text-[color:var(--text-dim)] mb-10">
            Brands I've worked with
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-8 gap-y-8 items-center justify-items-center mb-10">
            {FEATURED_BRANDS.map((b) => (
              <BrandLogo key={b.name} name={b.name} domain={b.domain} />
            ))}
          </div>
          <div className="flex flex-wrap justify-center items-center gap-x-1 gap-y-3 text-sm tracking-wide text-[color:var(--text-muted)]">
            {ALL_BRANDS.map((name, i) => (
              <span key={name} className="flex items-center gap-3">
                <span>{name}</span>
                {i < ALL_BRANDS.length - 1 && (
                  <span className="text-[color:var(--text-dim)]">·</span>
                )}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="relative mx-auto max-w-6xl px-6 py-24">
        <SectionLabel n="01">What I do</SectionLabel>
        <h2 className="mt-3 text-3xl sm:text-5xl font-semibold tracking-tight max-w-3xl">
          Full-service UGC — brief in, ad-ready file out.
        </h2>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {SERVICES.map((s) => (
            <div
              key={s.title}
              className="hover-lift p-6 rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-card)]"
            >
              <div className="text-sm font-medium text-[color:var(--accent)] mb-3">{s.title}</div>
              <p className="text-[color:var(--text-muted)] text-sm leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative border-t border-[color:var(--border)] bg-[color:var(--bg-elevated)]/30">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <SectionLabel n="02">Why me</SectionLabel>
          <div className="mt-3 grid lg:grid-cols-2 gap-12 lg:gap-20 items-start">
            <div>
              <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight">
                Most UGC creators are great on camera. Few of them know how an ad actually works.
              </h2>
            </div>
            <div className="space-y-8 lg:pt-4">
              <Reason
                title="Marketing-trained."
                body="10+ years in performance marketing, currently leading creative on a 7-figure UK supplement brand. I think in CTRs, hooks and three-second openers — not just aesthetics."
              />
              <Reason
                title="Dad demographic."
                body="UGC skews early-20s female. If your audience is parents, professionals or men in their 30s, you've been forcing creators to act outside their own lives. I don't have to act."
              />
              <Reason
                title="Husband-wife duo available."
                body="Need couple POV, family demos or his-and-hers content? My wife creates too. Book us together and skip the casting call."
              />
              <Reason
                title="UK-based, fast turnarounds."
                body="48-hour concept turnaround, 3–5 days to delivered cuts. I run a business — I treat your deadlines like one."
              />
            </div>
          </div>
        </div>
      </section>

      <section id="niches" className="relative mx-auto max-w-6xl px-6 py-24">
        <SectionLabel n="03">Niches</SectionLabel>
        <h2 className="mt-3 text-3xl sm:text-5xl font-semibold tracking-tight max-w-3xl">
          Where I'm strongest.
        </h2>
        <p className="mt-4 max-w-2xl text-[color:var(--text-muted)]">
          Briefs outside these are welcome — but these are where my background gives you an unfair advantage.
        </p>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {NICHES.map((n) => (
            <div
              key={n.name}
              className="hover-lift p-6 rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-card)]"
            >
              <div className="text-base font-medium text-[color:var(--text)]">{n.name}</div>
              <div className="mt-2 text-sm text-[color:var(--text-dim)]">{n.note}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="work" className="relative border-t border-[color:var(--border)] bg-[color:var(--bg-elevated)]/30">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="flex items-end justify-between flex-wrap gap-4 mb-12">
            <div>
              <SectionLabel n="04">Work</SectionLabel>
              <h2 className="mt-3 text-3xl sm:text-5xl font-semibold tracking-tight">
                Selected spec + client work.
              </h2>
            </div>
            <p className="text-sm text-[color:var(--text-dim)] max-w-md">
              Sample reel updating weekly. Brand-specific case studies and full client deliverables available on request.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {WORK.map((w, i) => (
              <WorkCard key={i} item={w} />
            ))}
          </div>
        </div>
      </section>

      <section id="process" className="relative mx-auto max-w-6xl px-6 py-24">
        <SectionLabel n="05">Process</SectionLabel>
        <h2 className="mt-3 text-3xl sm:text-5xl font-semibold tracking-tight max-w-3xl">
          From brief to ad-ready file in under a week.
        </h2>
        <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-4 gap-px bg-[color:var(--border)] rounded-2xl overflow-hidden border border-[color:var(--border)]">
          {PROCESS.map((p) => (
            <div key={p.n} className="bg-[color:var(--bg-card)] p-6 lg:p-8">
              <div className="text-xs font-mono text-[color:var(--accent)] tracking-wider mb-4">
                {p.n}
              </div>
              <div className="text-lg font-medium text-[color:var(--text)] mb-2">{p.title}</div>
              <p className="text-sm text-[color:var(--text-muted)] leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="rates" className="relative border-t border-[color:var(--border)] bg-[color:var(--bg-elevated)]/30">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <SectionLabel n="06">Rates</SectionLabel>
          <h2 className="mt-3 text-3xl sm:text-5xl font-semibold tracking-tight max-w-3xl">
            Simple, transparent, no surprises.
          </h2>
          <p className="mt-4 max-w-2xl text-[color:var(--text-muted)]">
            Starting prices. Final quote depends on hooks, usage rights, exclusivity and turnaround. Bundles and retainers available — see Contact.
          </p>
          <div className="mt-12 grid md:grid-cols-3 gap-4">
            {RATES.map((r) => (
              <div
                key={r.name}
                className={`relative p-6 rounded-2xl border ${
                  r.featured
                    ? "border-[color:var(--accent)] bg-[color:var(--bg-card)]"
                    : "border-[color:var(--border)] bg-[color:var(--bg-card)]"
                }`}
              >
                {r.featured && (
                  <div className="absolute -top-3 left-6 px-3 py-1 text-xs font-medium rounded-full bg-[color:var(--accent)] text-[color:var(--bg)]">
                    Most popular
                  </div>
                )}
                <div className="text-base font-medium text-[color:var(--text)]">{r.name}</div>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-4xl font-semibold tracking-tight">{r.price}</span>
                  <span className="text-sm text-[color:var(--text-dim)]">{r.cadence}</span>
                </div>
                <p className="mt-3 text-sm text-[color:var(--text-muted)] leading-relaxed">{r.desc}</p>
                <ul className="mt-6 space-y-2.5">
                  {r.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-[color:var(--text-muted)]">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        className="text-[color:var(--accent)] mt-0.5 shrink-0"
                      >
                        <path
                          d="M2 7l3.5 3.5L12 4"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-8 text-sm text-[color:var(--text-dim)]">
            Add-ons: posting on my own socials +£100 per platform · paid usage extension +30% of base per month · whitelisting / Spark Ads quoted per brand.
          </p>
        </div>
      </section>

      <section id="duo" className="relative mx-auto max-w-6xl px-6 py-24">
        <SectionLabel n="07">The Duo</SectionLabel>
        <div className="mt-3 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight">
              Two creators, one brief, half the headache.
            </h2>
            <p className="mt-6 text-lg text-[color:var(--text-muted)] leading-relaxed">
              My wife is a UGC creator too. If your product needs a couple POV, a family demo, his-and-hers, or paired content across two demographics — book us as a duo.
            </p>
            <p className="mt-4 text-[color:var(--text-muted)] leading-relaxed">
              One brief. One invoice. Two creators who actually know each other (and your product by the end of it). Perfect for parenting brands, home goods, fitness, travel, wellness — anywhere a &ldquo;real couple&rdquo; beats two strangers reading from the same script.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <a
                href="#contact"
                className="inline-flex items-center gap-2 text-base font-medium px-6 py-3 rounded-full bg-[color:var(--accent)] text-[color:var(--bg)] hover:bg-[color:var(--accent-hover)] transition-colors"
              >
                Brief the duo
              </a>
            </div>
          </div>
          <div className="relative">
            <div className="grid grid-cols-2 gap-4">
              <DuoCard label="Dan" tag="Marketing-trained" tagline="Dad / business / fitness / SaaS" />
              <DuoCard label="Wife" tag="Mum creator" tagline="Parenting / beauty / wellness / home" />
            </div>
            <div className="absolute -inset-px rounded-2xl border border-[color:var(--accent)] opacity-20 pointer-events-none" />
          </div>
        </div>
      </section>

      <section
        id="contact"
        className="relative border-t border-[color:var(--border)] bg-[color:var(--bg-elevated)]/30"
      >
        <div className="mx-auto max-w-6xl px-6 py-24">
          <SectionLabel n="08">Contact</SectionLabel>
          <div className="mt-3 grid lg:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight">
                Got a brief? Got a product? Got a vague idea?
              </h2>
              <p className="mt-6 text-lg text-[color:var(--text-muted)] leading-relaxed">
                Email me. Tell me what you're selling, who it's for, and any creative direction you've already got. I'll come back within 24 hours with concepts or honest &ldquo;this isn't a fit.&rdquo;
              </p>
            </div>
            <div className="space-y-4">
              <a
                href="mailto:hello@dannightingale.com?subject=UGC brief"
                className="hover-lift block p-6 rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-card)]"
              >
                <div className="text-xs uppercase tracking-wider text-[color:var(--text-dim)] mb-2">
                  Email
                </div>
                <div className="text-lg font-medium text-[color:var(--text)]">
                  hello@dannightingale.com
                </div>
                <div className="mt-1 text-sm text-[color:var(--text-muted)]">
                  Best for briefs, quotes and pitches.
                </div>
              </a>
              <div className="grid grid-cols-2 gap-4">
                <SocialCard
                  label="TikTok"
                  handle="@dansdailydeals"
                  href="https://www.tiktok.com/@dansdailydeals"
                />
                <SocialCard label="Instagram" handle="@dannightingaleugc" href="#" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative border-t border-[color:var(--border)]">
        <div className="mx-auto max-w-6xl px-6 py-10 flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm text-[color:var(--text-dim)]">
            © {new Date().getFullYear()} Dan Nightingale. UK-based UGC creator.
          </div>
          <div className="text-xs text-[color:var(--text-dim)] font-mono">
            v0.2 · brands, photo and TikTok-ready work grid
          </div>
        </div>
      </footer>
    </>
  );
}

function SectionLabel({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
      <span className="font-mono text-[color:var(--accent)]">{n}</span>
      <span className="h-px w-8 bg-[color:var(--border-strong)]" />
      <span>{children}</span>
    </div>
  );
}

function Reason({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-l-2 border-[color:var(--accent)] pl-5">
      <div className="text-base font-medium text-[color:var(--text)]">{title}</div>
      <p className="mt-2 text-[color:var(--text-muted)] leading-relaxed">{body}</p>
    </div>
  );
}

function DuoCard({ label, tag, tagline }: { label: string; tag: string; tagline: string }) {
  return (
    <div className="hover-lift aspect-[3/4] rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-card)] p-5 flex flex-col justify-between">
      <div className="text-xs uppercase tracking-wider text-[color:var(--accent)] font-medium">
        {tag}
      </div>
      <div>
        <div className="text-2xl font-semibold tracking-tight text-[color:var(--text)]">{label}</div>
        <div className="mt-2 text-sm text-[color:var(--text-muted)]">{tagline}</div>
      </div>
    </div>
  );
}

function HeroLink({ href, label, handle }: { href: string; label: string; handle: string }) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="group inline-flex items-baseline gap-2 text-sm text-[color:var(--text-muted)] hover:text-[color:var(--text)] transition-colors"
    >
      <span className="text-xs uppercase tracking-wider text-[color:var(--text-dim)]">{label}</span>
      <span className="font-medium text-[color:var(--text)] border-b border-transparent group-hover:border-[color:var(--accent)] transition-colors">
        {handle}
      </span>
    </a>
  );
}

function SocialCard({ label, handle, href }: { label: string; handle: string; href: string }) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noreferrer" : undefined}
      className="hover-lift block p-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-card)]"
    >
      <div className="text-xs uppercase tracking-wider text-[color:var(--text-dim)] mb-1">
        {label}
      </div>
      <div className="text-sm font-medium text-[color:var(--text)]">{handle}</div>
    </a>
  );
}

function BrandLogo({ name, domain }: { name: string; domain: string }) {
  const [sourceIdx, setSourceIdx] = useState(0);
  // 1) Logo.dev (free, public test token from their docs)
  // 2) Google favicons (always resolves, smaller / icon-style)
  // 3) Text fallback if both error
  const sources = [
    `https://img.logo.dev/${domain}?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ&size=200&format=png`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
  ];
  if (sourceIdx >= sources.length) {
    return (
      <div className="text-base sm:text-lg font-bold uppercase tracking-wider text-[color:var(--text-muted)] text-center">
        {name}
      </div>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      key={sourceIdx}
      src={sources[sourceIdx]}
      alt={name}
      onError={() => setSourceIdx((i) => i + 1)}
      className="h-10 sm:h-12 max-w-[140px] object-contain opacity-80 hover:opacity-100 transition-opacity"
    />
  );
}

function WorkCard({ item }: { item: WorkItem }) {
  return (
    <div className="hover-lift group relative aspect-[9/16] rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-card)] overflow-hidden">
      {item.videoId ? (
        <iframe
          src={`https://www.tiktok.com/embed/v2/${item.videoId}`}
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
          title={item.title}
        />
      ) : (
        <>
          <div className="absolute inset-0 flex flex-col justify-between p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-[color:var(--accent)] font-medium">
                {item.category}
              </span>
              <span className="text-xs text-[color:var(--text-dim)] font-mono">
                {item.duration}
              </span>
            </div>
            <div>
              <div className="text-base font-medium text-[color:var(--text)] leading-snug">
                {item.title}
              </div>
              <div className="mt-3 text-xs text-[color:var(--text-dim)] flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-[color:var(--accent)]" />
                Sample · contact for full reel
              </div>
            </div>
          </div>
          <div className="absolute inset-0 bg-gradient-to-br from-[color:var(--accent-soft)] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </>
      )}
    </div>
  );
}
