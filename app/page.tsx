"use client";

import Link from "next/link";
import { useState, useRef, useEffect, Fragment } from "react";

const NAV = [
  { href: "#work", label: "Work" },
  { href: "#brands", label: "Brands" },
  { href: "#niches", label: "Niches" },
  { href: "#process", label: "Process" },
  { href: "#duo", label: "Duo" },
  { href: "#contact", label: "Contact" },
];

const STATS = [
  { prefix: "£", target: 150, suffix: "k+", label: "Generated · one brand, 9 months" },
  { prefix: "£", target: 50, suffix: "k+", label: "TikTok Shop GMV · 12 months" },
  { prefix: "", target: 5, suffix: "+", label: "Years in marketing + content" },
  { prefix: "", target: 48, suffix: "h", label: "Concept turnaround" },
];

const FEATURED_BRANDS: { name: string; logo: string; invert?: boolean }[] = [
  { name: "Neutonic", logo: "/logos/neutonic.svg" },
  { name: "Puma", logo: "/logos/puma.svg" },
  { name: "MyProtein", logo: "/logos/myprotein.svg" },
  { name: "B&M", logo: "/logos/bm.png" },
  { name: "Tembo", logo: "/logos/tembo.png" },
  { name: "Zable", logo: "/logos/zable.png" },
  { name: "Avios", logo: "/logos/avios.png", invert: true },
  { name: "Harry's", logo: "/logos/harrys.png", invert: true },
  { name: "Huel", logo: "/logos/huel.png", invert: true },
  { name: "Whatnot", logo: "/logos/whatnot.png" },
  { name: "Parcel2Go", logo: "/logos/parcel2go.png", invert: true },
  { name: "Applied Nutrition", logo: "/logos/applied-nutrition.png" },
  { name: "Chilly's", logo: "/logos/chillys.png" },
  { name: "Warrior Supplements", logo: "/logos/warrior.png" },
  { name: "Wellgard", logo: "/logos/wellgard.png" },
  { name: "Spoon Cereals", logo: "/logos/spoon.png" },
  { name: "JustFloow", logo: "/logos/justfloow.svg" },
  { name: "Anker", logo: "/logos/anker.svg" },
  { name: "Shark", logo: "/logos/shark.png", invert: true },
];

const SERVICES = [
  {
    n: "01",
    title: "Concept + script",
    body: "I write the hook, the body and the CTA. Performance-tested structure, not vibes.",
    points: ["Hook development", "Audience research", "Conversion structure"],
  },
  {
    n: "02",
    title: "Filming",
    body: "Mobile-first, lit and framed for paid social. Multi-hook variations on request.",
    points: ["Talk-to-camera", "Product demos", "Problem-solution"],
  },
  {
    n: "03",
    title: "Editing",
    body: "Cuts, captions, B-roll, sound design. Delivered ready to push as an ad.",
    points: ["Retention pacing", "Burned-in captions", "Sound design"],
  },
  {
    n: "04",
    title: "Multi-platform",
    body: "TikTok, Reels, Meta + YouTube Shorts. Aspect ratios sorted on delivery.",
    points: ["Ad variations", "Aspect ratios", "Hook iterations"],
  },
];

const NICHES = [
  { name: "Supplements & health", note: "Protein, longevity, sleep, gut" },
  { name: "Fitness & wellness", note: "Apps, equipment, recovery" },
  { name: "Productivity & SaaS", note: "Where my marketing brain is a moat" },
  { name: "Personal finance", note: "Investing apps, money tools, banking" },
  { name: "Home & lifestyle", note: "Home goods, family setup, everyday gear" },
  { name: "Family & parenting", note: "Couple, family and his-and-hers - solo or with my wife" },
];

const REASONS = [
  {
    title: "Marketing-trained.",
    body: "5+ years in performance marketing, currently leading creative on a 7-figure UK supplement brand. I think in CTRs, hooks and three-second openers - and the numbers back it up.",
  },
  {
    title: "Your demographic, not a stand-in.",
    body: "If your customer is a working male in his late 20s or 30s - fitness, supplements, tech, finance, SaaS, dad-and-business brands - I'm already there.",
  },
  {
    title: "Husband-wife duo available.",
    body: "Need couple POV, family demos or his-and-hers content? My wife creates too. Book us together and skip the casting call.",
  },
  {
    title: "UK-based, fast turnarounds.",
    body: "48-hour concept turnaround, 3-5 days to delivered cuts. I run a business - I treat your deadlines like one.",
  },
];

type WorkItem = {
  category: string;
  title: string;
  videoSrc: string;
  stat?: string;
};

const WORK: WorkItem[] = [
  { category: "Parcel2Go", title: "Parcel delivery app - paid social", videoSrc: "/work/parcel2go.mp4" },
  { category: "Avios", title: "Loyalty rewards - paid social", videoSrc: "/work/avios.mp4" },
  { category: "Tembo", title: "Cash ISA - paid social", videoSrc: "/work/tembo.mp4" },
  { category: "Zable", title: "Car finance - paid social", videoSrc: "/work/zable.mp4" },
  { category: "Spoon Cereals x Manilife", title: "Cereal collab - lifestyle", videoSrc: "/work/spoon-manilife.mp4" },
  { category: "Whatnot", title: "Live selling platform - paid social", videoSrc: "/work/whatnot.mp4" },
  { category: "B&M", title: "90s/00s birthday buffet - lifestyle", videoSrc: "/work/bm2.mp4" },
  { category: "Fussy", title: "Natural deodorant - paid social", videoSrc: "/work/fussy.mp4" },
  { category: "Harry's", title: "Men's grooming - paid social", videoSrc: "/work/harrys.mp4" },
  { category: "OneFamily", title: "Savings & investments - paid social", videoSrc: "/work/onefamily.mp4" },
  { category: "CarLoans365", title: "Car finance - paid social", videoSrc: "/work/carloans365.mp4" },
  { category: "Inckd", title: "Tattoo booking app - paid social", videoSrc: "/work/inckd.mp4" },
  {
    category: "JustFloow",
    title: "Organic Facebook reel - top performer",
    videoSrc: "/work/fb-reel.mp4",
    stat: "2M+ organic views · £55k+ generated",
  },
  {
    category: "JustFloow",
    title: "Supplement reel - Facebook",
    videoSrc: "/work/justfloow.mp4",
    stat: "1M+ organic views · £40k+ generated",
  },
  { category: "Puma", title: "Sportswear showcase", videoSrc: "/work/puma.mp4", stat: "High GMV TikTok Shop" },
  { category: "Neutonic", title: "Nootropic drink - long-term partner", videoSrc: "/work/neutonic.mp4", stat: "Paid UGC partnership" },
  { category: "Tech", title: "4-in-1 charging cable", videoSrc: "/work/cable.mp4", stat: "Top-selling UGC piece" },
  { category: "Hitch", title: "Bottle + coffee mug - street interview", videoSrc: "/work/hitch.mp4", stat: "Street interview UGC style" },
  { category: "B&M", title: "90s/00s birthday buffet - lifestyle", videoSrc: "/work/bm.mp4" },
];

const PROCESS = [
  { n: "01", title: "Brief", body: "Send me the product + a sentence on the angle. Or just the product - I'll handle the rest." },
  { n: "02", title: "Concept", body: "Within 48 hours: script, hook variations, shot list. We lock direction before I film." },
  { n: "03", title: "Film + edit", body: "3-5 days. Mobile-first, paid-ad ready, captions burned in, audio mixed." },
  { n: "04", title: "Deliver", body: "Final cuts, raw footage on request, 2 rounds of revisions included." },
];

export default function Home() {
  return (
    <>
      <AuroraGlow />

      <header className="sticky top-0 z-50 backdrop-blur-md bg-[color:var(--bg)]/75 border-b border-[color:var(--border)]">
        <div className="mx-auto max-w-[1440px] flex items-center justify-between px-6 lg:px-10 py-4">
          <Link href="/" className="font-semibold tracking-tight text-[color:var(--text)]">
            Dan Nightingale<span className="text-[color:var(--accent)]">.</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-[color:var(--text-muted)]">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="hover:text-[color:var(--text)] transition-colors">
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

      {/* ---------------- HERO ---------------- */}
      <section className="relative overflow-hidden">
        <div className="relative mx-auto max-w-[1440px] px-6 lg:px-10 pt-16 sm:pt-24 lg:pt-28 pb-10">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)] mb-8">
            <span className="size-1.5 rounded-full bg-[color:var(--accent)] animate-pulse" />
            Available for new briefs · UK
          </div>

          <div className="grid lg:grid-cols-[1fr_0.9fr] gap-10 lg:gap-16 items-center lg:min-h-[560px]">
            <div className="flex flex-col justify-center order-2 lg:order-1">
              <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl xl:text-[5.5rem] leading-[0.92] tracking-[-0.02em]">
                <KineticText text="Dan Nightingale" className="block" />
                <span className="block">
                  <KineticText text="UGC " delay={220} />
                  <KineticText text="creator" delay={220} className="italic text-[color:var(--accent)]" />
                </span>
              </h1>
              <Reveal delay={160}>
                <p className="mt-8 text-lg sm:text-xl font-medium tracking-tight leading-snug text-[color:var(--text)] max-w-xl">
                  Marketing-trained UGC for fitness, family and lifestyle brands - written, filmed and
                  edited to <span className="font-display italic text-[color:var(--accent)]">convert</span>, not
                  just look good.
                </p>
              </Reveal>
              <Reveal delay={240}>
                <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                  <HeroLink href="https://www.tiktok.com/@dannightingxle.ugc" label="TikTok" handle="@dannightingxle.ugc" />
                  <HeroLink href="https://www.instagram.com/dannightingxle.ugc" label="Instagram" handle="@dannightingxle.ugc" />
                  <HeroLink href="mailto:hello@dannightingxle.com?subject=UGC brief" label="Email" handle="hello@dannightingxle.com" />
                </div>
              </Reveal>
            </div>
            <Reveal delay={180} className="order-1 lg:order-2 w-full lg:h-full">
              <div className="relative h-full rounded-2xl overflow-hidden border border-[color:var(--border)] bg-[color:var(--bg-card)] aspect-[4/5] sm:aspect-[16/10] lg:aspect-auto lg:min-h-[560px] shadow-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/dan-hero.jpg"
                  alt="Dan Nightingale"
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ objectPosition: "center 32%" }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-4 left-4 inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/90 bg-black/45 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                  <span className="size-1.5 rounded-full bg-[color:var(--accent)]" /> Dan Nightingale · UK
                </div>
              </div>
            </Reveal>
          </div>
        </div>

        {/* hero brand marquee */}
        <div id="brands" className="scroll-mt-20 border-y border-[color:var(--border)] py-7">
          <Marquee duration={36}>
            {FEATURED_BRANDS.map((b) => (
              <div key={b.name} className="flex items-center px-2">
                <BrandLogo name={b.name} logo={b.logo} invert={b.invert} />
              </div>
            ))}
          </Marquee>
        </div>
      </section>

      {/* ---------------- (01) COMMITMENT + STATS ---------------- */}
      <section className="relative mx-auto max-w-[1440px] px-6 lg:px-10 py-20 sm:py-28 lg:py-32">
        <Reveal>
          <SectionLabel n="(01)">My commitment</SectionLabel>
        </Reveal>
        <Reveal delay={80}>
          <h2 className="font-display mt-5 text-4xl sm:text-6xl lg:text-7xl max-w-4xl">
            UGC that&apos;s <em className="text-[color:var(--accent)]">built to convert</em>, driven by a real
            marketing brain.
          </h2>
        </Reveal>
        <div className="mt-16 grid grid-cols-2 lg:grid-cols-4 gap-px bg-[color:var(--border)] rounded-2xl overflow-hidden border border-[color:var(--border)]">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 90} className="bg-[color:var(--bg-elevated)] p-6 lg:p-8">
              <div className="font-display text-5xl sm:text-6xl lg:text-7xl text-[color:var(--text)]">
                <CountUp prefix={s.prefix} target={s.target} suffix={s.suffix} />
              </div>
              <div className="mt-3 text-xs uppercase tracking-wider text-[color:var(--text-dim)] leading-relaxed">
                {s.label}
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- (02) WORK ---------------- */}
      <section id="work" className="relative bg-[color:var(--bg-elevated)]/70">
        <div className="mx-auto max-w-[1440px] px-6 lg:px-10 py-20 sm:py-28 lg:py-32">
          <div className="flex items-end justify-between flex-wrap gap-4 mb-14">
            <div>
              <Reveal>
                <SectionLabel n="(02)">Portfolio</SectionLabel>
              </Reveal>
              <Reveal delay={80}>
                <h2 className="font-display mt-5 text-4xl sm:text-6xl lg:text-7xl">
                  Latest <em className="text-[color:var(--accent)]">works</em>.
                </h2>
              </Reveal>
            </div>
            <Reveal delay={160}>
              <p className="text-sm text-[color:var(--text-dim)] max-w-md">
                Hand-picked highlights. Brand-specific case studies and full client deliverables available on request.
              </p>
            </Reveal>
          </div>
          <Reveal delay={120}>
            <WorkCarousel items={WORK} />
          </Reveal>
        </div>
      </section>

      {/* ---------------- (03) WHY ME ---------------- */}
      <section className="relative mx-auto max-w-[1440px] px-6 lg:px-10 py-20 sm:py-28 lg:py-32">
        <Reveal>
          <SectionLabel n="(03)">Why me</SectionLabel>
        </Reveal>
        <div className="mt-5 grid lg:grid-cols-2 gap-12 lg:gap-20 items-start">
          <Reveal delay={80}>
            <h2 className="font-display text-4xl sm:text-6xl lg:text-7xl">
              Most creators are great on camera. Few know how an ad actually <em className="text-[color:var(--accent)]">works</em>.
            </h2>
          </Reveal>
          <div className="space-y-8 lg:pt-4">
            {REASONS.map((r, i) => (
              <Reveal key={r.title} delay={i * 100}>
                <div className="border-l-2 border-[color:var(--accent)] pl-5">
                  <div className="text-lg font-medium text-[color:var(--text)]">{r.title}</div>
                  <p className="mt-2 text-[color:var(--text-muted)] leading-relaxed">{r.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- (04) SERVICES ---------------- */}
      <section className="relative border-t border-[color:var(--border)] bg-[color:var(--bg-elevated)]/70">
        <div className="mx-auto max-w-[1440px] px-6 lg:px-10 py-20 sm:py-28 lg:py-32">
          <Reveal>
            <SectionLabel n="(04)">Services</SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="font-display mt-5 text-4xl sm:text-6xl lg:text-7xl max-w-3xl">
              Full-service UGC - brief in, <em className="text-[color:var(--accent)]">ad-ready</em> file out.
            </h2>
          </Reveal>
          <div className="mt-16 border-t border-[color:var(--border)]">
            {SERVICES.map((s, i) => (
              <Reveal key={s.title} delay={i * 70}>
                <div className="group grid md:grid-cols-[auto_1fr_1.2fr] gap-4 md:gap-10 items-baseline py-8 border-b border-[color:var(--border)] hover:bg-[color:var(--bg-card)]/40 transition-colors px-2 -mx-2 rounded-lg">
                  <div className="font-mono text-sm text-[color:var(--accent)]">{s.n}</div>
                  <h3 className="font-display text-3xl sm:text-4xl text-[color:var(--text)]">{s.title}</h3>
                  <div>
                    <p className="text-[color:var(--text-muted)] leading-relaxed max-w-md">{s.body}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {s.points.map((p) => (
                        <span
                          key={p}
                          className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-full border border-[color:var(--border-strong)] text-[color:var(--text-dim)]"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- NICHES ---------------- */}
      <section id="niches" className="relative mx-auto max-w-[1440px] px-6 lg:px-10 py-20 sm:py-28 lg:py-32">
        <Reveal>
          <SectionLabel n="(05)">Niches</SectionLabel>
        </Reveal>
        <Reveal delay={80}>
          <h2 className="font-display mt-5 text-4xl sm:text-6xl lg:text-7xl max-w-3xl">
            Where I&apos;m <em className="text-[color:var(--accent)]">strongest</em>.
          </h2>
        </Reveal>
        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {NICHES.map((n, i) => (
            <Reveal key={n.name} delay={i * 70}>
              <div className="hover-lift h-full p-6 rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-card)]">
                <div className="text-base font-medium text-[color:var(--text)]">{n.name}</div>
                <div className="mt-2 text-sm text-[color:var(--text-dim)]">{n.note}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- PROCESS ---------------- */}
      <section id="process" className="relative border-t border-[color:var(--border)] bg-[color:var(--bg-elevated)]/70">
        <div className="mx-auto max-w-[1440px] px-6 lg:px-10 py-20 sm:py-28 lg:py-32">
          <Reveal>
            <SectionLabel n="(06)">Process</SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="font-display mt-5 text-4xl sm:text-6xl lg:text-7xl max-w-3xl">
              From brief to ad-ready file in under a <em className="text-[color:var(--accent)]">week</em>.
            </h2>
          </Reveal>
          <div className="mt-16 grid md:grid-cols-2 lg:grid-cols-4 gap-px bg-[color:var(--border)] rounded-2xl overflow-hidden border border-[color:var(--border)]">
            {PROCESS.map((p, i) => (
              <Reveal key={p.n} delay={i * 90} className="bg-[color:var(--bg-card)] p-6 lg:p-8">
                <div className="text-xs font-mono text-[color:var(--accent)] tracking-wider mb-4">{p.n}</div>
                <div className="font-display text-2xl text-[color:var(--text)] mb-2">{p.title}</div>
                <p className="text-sm text-[color:var(--text-muted)] leading-relaxed">{p.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- DUO ---------------- */}
      <section id="duo" className="relative mx-auto max-w-[1440px] px-6 lg:px-10 py-20 sm:py-28 lg:py-32">
        <Reveal>
          <SectionLabel n="(07)">The duo</SectionLabel>
        </Reveal>
        <div className="mt-5 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <Reveal delay={80}>
              <h2 className="font-display text-4xl sm:text-6xl lg:text-7xl">
                Two creators, one brief, <em className="text-[color:var(--accent)]">half</em> the headache.
              </h2>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-6 text-lg text-[color:var(--text-muted)] leading-relaxed">
                My wife is a UGC creator too. If your product needs a couple POV, a family demo, his-and-hers, or paired content across two demographics - book us as a duo.
              </p>
            </Reveal>
            <Reveal delay={220}>
              <p className="mt-4 text-[color:var(--text-muted)] leading-relaxed">
                One brief. One invoice. Two creators who actually know each other (and your product by the end of it). Perfect for parenting brands, home goods, fitness, travel, wellness.
              </p>
            </Reveal>
            <Reveal delay={280}>
              <a
                href="#contact"
                className="mt-8 inline-flex items-center gap-2 text-base font-medium px-6 py-3 rounded-full bg-[color:var(--accent)] text-[color:var(--bg)] hover:bg-[color:var(--accent-hover)] transition-colors"
              >
                Brief the duo
              </a>
            </Reveal>
          </div>
          <Reveal delay={140}>
            <div className="relative">
              <div className="grid grid-cols-2 gap-4">
                <DuoCard label="Dan" tag="Marketing-trained" tagline="Dad / business / fitness / SaaS" photo="/duo/dan.png" />
                <DuoCard label="Lydia" tag="Mum creator" tagline="Mum / beauty / wellness / home" photo="/duo/wife.jpg" />
              </div>
              <div className="absolute -inset-px rounded-2xl border border-[color:var(--accent)] opacity-20 pointer-events-none" />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------- CONTACT ---------------- */}
      <section id="contact" className="relative border-t border-[color:var(--border)] bg-[color:var(--bg-elevated)]/70 overflow-hidden">
        <div className="mx-auto max-w-[1440px] px-6 lg:px-10 py-20 sm:py-28 lg:py-36">
          <Reveal>
            <SectionLabel n="(08)">Contact</SectionLabel>
          </Reveal>
          <h2 className="font-display mt-6 text-[13vw] lg:text-[10vw] leading-[0.9] tracking-[-0.02em]">
            <KineticText text="Get in touch" />
          </h2>
          <div className="mt-12 grid lg:grid-cols-2 gap-12 items-start">
            <Reveal delay={100}>
              <p className="text-lg text-[color:var(--text-muted)] leading-relaxed max-w-lg">
                Tell me what you&apos;re selling, who it&apos;s for, and any creative direction you&apos;ve already got. I&apos;ll come back within 24 hours with concepts or an honest &ldquo;this isn&apos;t a fit.&rdquo;
              </p>
            </Reveal>
            <div className="space-y-4">
              <Reveal delay={140}>
                <a
                  href="mailto:hello@dannightingxle.com?subject=UGC brief"
                  className="hover-lift block p-6 rounded-2xl bg-white text-[color:var(--bg)] shadow-lg"
                >
                  <div className="text-xs uppercase tracking-wider text-black/50 mb-2">Email</div>
                  <div className="text-lg font-semibold text-black">hello@dannightingxle.com</div>
                  <div className="mt-1 text-sm text-black/60">Best for briefs, quotes and pitches.</div>
                </a>
              </Reveal>
              <Reveal delay={200}>
                <div className="grid sm:grid-cols-2 gap-4">
                  <SocialCard label="TikTok" handle="@dannightingxle.ugc" href="https://www.tiktok.com/@dannightingxle.ugc" />
                  <SocialCard label="Instagram" handle="@dannightingxle.ugc" href="https://www.instagram.com/dannightingxle.ugc" />
                </div>
              </Reveal>
              <Reveal delay={240}>
                <SocialCard
                  label="Also on TikTok"
                  handle="@dansdailydeals"
                  href="https://www.tiktok.com/@dansdailydeals"
                />
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- FOOTER MARQUEE ---------------- */}
      <div className="border-t border-[color:var(--border)] py-10 sm:py-12 overflow-hidden">
        <Marquee duration={40}>
          {["Dan Nightingale", "UGC Creator", "Fitness", "Family", "Lifestyle", "Paid social", "Organic"].map(
            (t, i) => (
              <span
                key={i}
                className="font-display text-5xl sm:text-7xl leading-[1.15] text-[color:var(--text)] flex items-center gap-8 sm:gap-12 whitespace-nowrap"
              >
                {t}
                <span className="text-[color:var(--accent)] text-2xl sm:text-4xl">✦</span>
              </span>
            )
          )}
        </Marquee>
      </div>

      <footer className="relative border-t border-[color:var(--border)]">
        <div className="mx-auto max-w-[1440px] px-6 lg:px-10 py-10 flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm text-[color:var(--text-dim)]">
            © {new Date().getFullYear()} Dan Nightingale. UK-based UGC creator.
          </div>
          <a
            href="mailto:hello@dannightingxle.com?subject=Custom%20web%20or%20app%20design%20enquiry&body=Hi%20Dan%2C%20I%20saw%20your%20portfolio%20and%20I'm%20looking%20for%20help%20with%20a%20custom%20web%20or%20app%20build.%20Here%20are%20the%20details%3A%0A%0A-%20What%20I%20need%3A%0A-%20Timeline%3A%0A-%20Budget%3A%0A%0AThanks%2C"
            className="text-sm text-[color:var(--text-muted)] hover:text-[color:var(--text)] transition-colors"
          >
            Site built by... me! Need a custom web or app build?{" "}
            <span className="text-[color:var(--accent)]">Get in touch →</span>
          </a>
        </div>
      </footer>
    </>
  );
}

/* ================= Motion primitives ================= */

/* Orange + purple glow that trails the cursor across the whole page.
   Falls back to the original static corner glows on touch / reduced motion. */
function AuroraGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!finePointer || reduceMotion) return;

    // normalised 0..1 positions within the viewport
    let targetX = 0.88;
    let targetY = 0.04;
    let x = targetX;
    let y = targetY;
    let trailX = 0.12;
    let trailY = 0.96;
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      targetX = e.clientX / window.innerWidth;
      targetY = e.clientY / window.innerHeight;
    };

    const tick = () => {
      // orange eases toward the cursor, purple trails further behind
      x += (targetX - x) * 0.075;
      y += (targetY - y) * 0.075;
      trailX += (x - trailX) * 0.035;
      trailY += (y - trailY) * 0.035;
      el.style.setProperty("--mx", `${x * 100}%`);
      el.style.setProperty("--my", `${y * 100}%`);
      el.style.setProperty("--mx2", `${trailX * 100}%`);
      el.style.setProperty("--my2", `${trailY * 100}%`);
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <div ref={ref} className="aurora" />;
}

function useInView<T extends HTMLElement>(threshold = 0.15) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, inView };
}

function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`reveal ${inView ? "in" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function KineticText({
  text,
  className = "",
  delay = 0,
}: {
  text: string;
  className?: string;
  delay?: number;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.2);
  const words = text.split(" ");
  let idx = 0;
  return (
    <span ref={ref} className={`kin ${inView ? "in" : ""} ${className}`} aria-label={text}>
      {words.map((word, w) => (
        <Fragment key={w}>
          {[...word].map((ch, c) => {
            const d = delay + idx * 34;
            idx += 1;
            return (
              <span key={c} className="kin-letter" aria-hidden="true" style={{ transitionDelay: `${d}ms` }}>
                {ch}
              </span>
            );
          })}
          {w < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </span>
  );
}

function CountUp({
  target,
  prefix = "",
  suffix = "",
}: {
  target: number;
  prefix?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setN(target);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const dur = 1400;
        const start = performance.now();
        const tick = (t: number) => {
          const p = Math.min(1, (t - start) / dur);
          const eased = 1 - Math.pow(1 - p, 3);
          setN(Math.round(eased * target));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [target]);
  return (
    <span ref={ref}>
      {prefix}
      {n}
      {suffix}
    </span>
  );
}

function Marquee({
  children,
  duration = 34,
  reverse = false,
}: {
  children: React.ReactNode;
  duration?: number;
  reverse?: boolean;
}) {
  return (
    <div className="marquee">
      <div
        className="marquee-track"
        style={{ animationDuration: `${duration}s`, animationDirection: reverse ? "reverse" : "normal" }}
      >
        <div className="marquee-group">{children}</div>
        <div className="marquee-group" aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ================= UI components ================= */

function SectionLabel({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-[color:var(--text-dim)]">
      <span className="font-mono text-[color:var(--accent)]">{n}</span>
      <span className="h-px w-8 bg-[color:var(--border-strong)]" />
      <span>{children}</span>
    </div>
  );
}

function DuoCard({ label, tag, tagline, photo }: { label: string; tag: string; tagline: string; photo: string }) {
  return (
    <div className="hover-lift relative aspect-[3/4] rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-card)] overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo} alt={label} className="absolute inset-0 w-full h-full object-cover object-top" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none" />
      <div className="relative h-full p-4 sm:p-5 flex flex-col justify-end sm:justify-between gap-2 sm:gap-0">
        <span className="self-start inline-flex items-center px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-black/55 backdrop-blur-md border border-white/10 text-[10px] sm:text-xs uppercase tracking-wider text-[color:var(--accent)] font-semibold whitespace-nowrap">
          {tag}
        </span>
        <div>
          <div className="font-display text-2xl sm:text-3xl text-white leading-tight">{label}</div>
          <div className="mt-1 sm:mt-2 text-xs sm:text-sm text-white/85 leading-snug">{tagline}</div>
        </div>
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
      className="hover-lift block p-4 rounded-2xl bg-white text-[color:var(--bg)] shadow-lg"
    >
      <div className="text-xs uppercase tracking-wider text-black/50 mb-1">{label}</div>
      <div className="text-sm font-semibold text-black">{handle}</div>
    </a>
  );
}

function BrandLogo({ name, logo, invert }: { name: string; logo: string; invert?: boolean }) {
  const [failed, setFailed] = useState(false);
  const isSvg = logo.endsWith(".svg");
  const useInvert = isSvg || invert;
  if (failed) {
    return (
      <div className="text-xl sm:text-2xl font-bold uppercase tracking-wider text-[color:var(--text-muted)] whitespace-nowrap">
        {name}
      </div>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={logo}
      alt={name}
      onError={() => setFailed(true)}
      className="h-10 sm:h-12 max-w-[150px] object-contain opacity-60 hover:opacity-100 transition-opacity"
      style={useInvert ? { filter: "brightness(0) invert(1)" } : { mixBlendMode: "screen" }}
    />
  );
}

function WorkCarousel({ items }: { items: WorkItem[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const displayItems = [...items, ...items, ...items];

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollLeft = el.scrollWidth / 3 - 64;
    });
  }, []);

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    const firstCard = el.querySelector("[data-card]") as HTMLElement | null;
    const step = firstCard ? firstCard.offsetWidth + 16 : 320;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  return (
    <div className="relative -mx-6 lg:mx-0">
      <div
        ref={scrollRef}
        style={{ scrollPaddingLeft: 64, scrollPaddingRight: 64 }}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory px-6 lg:px-16 pb-3 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {displayItems.map((w, i) => (
          <div
            key={i}
            data-card
            className="snap-start shrink-0 w-[78vw] max-w-[320px] sm:w-[46%] sm:max-w-[360px] lg:w-[31%] lg:max-w-none"
          >
            <WorkCard item={w} />
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute left-0 top-0 bottom-3 w-24 bg-gradient-to-r from-[color:var(--bg-elevated)] via-[color:var(--bg-elevated)]/60 to-transparent hidden lg:block" />
      <div className="pointer-events-none absolute right-0 top-0 bottom-3 w-24 bg-gradient-to-l from-[color:var(--bg-elevated)] via-[color:var(--bg-elevated)]/60 to-transparent hidden lg:block" />
      <button
        type="button"
        onClick={() => scrollBy(-1)}
        aria-label="Previous"
        className="hidden lg:flex absolute -left-4 top-1/2 -translate-y-1/2 z-10 size-11 items-center justify-center rounded-full bg-[color:var(--bg-card)] border border-[color:var(--border-strong)] text-[color:var(--text)] hover:bg-[color:var(--accent)] hover:text-[color:var(--bg)] hover:border-[color:var(--accent)] transition-colors shadow-lg"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => scrollBy(1)}
        aria-label="Next"
        className="hidden lg:flex absolute -right-4 top-1/2 -translate-y-1/2 z-10 size-11 items-center justify-center rounded-full bg-[color:var(--bg-card)] border border-[color:var(--border-strong)] text-[color:var(--text)] hover:bg-[color:var(--accent)] hover:text-[color:var(--bg)] hover:border-[color:var(--accent)] transition-colors shadow-lg"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

function WorkCard({ item }: { item: WorkItem }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="hover-lift group relative aspect-[9/16] rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-card)] overflow-hidden">
        <video
          src={item.videoSrc}
          autoPlay
          muted
          loop
          playsInline
          controls
          controlsList="nodownload"
          preload="metadata"
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>
      <div className="px-1">
        <div className="text-xs uppercase tracking-wider text-[color:var(--accent)] font-medium">{item.category}</div>
        <div className="mt-1 text-sm font-medium text-[color:var(--text)] leading-snug">{item.title}</div>
        {item.stat && <div className="mt-1 text-xs text-[color:var(--text-muted)]">{item.stat}</div>}
      </div>
    </div>
  );
}
