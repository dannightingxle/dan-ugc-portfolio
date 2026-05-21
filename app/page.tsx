"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";

const NAV = [
  { href: "#work", label: "Work" },
  { href: "#brands", label: "Brands" },
  { href: "#niches", label: "Niches" },
  { href: "#process", label: "Process" },
  { href: "#duo", label: "Duo" },
  { href: "#contact", label: "Contact" },
];

const STATS = [
  { value: "£150k+", label: "Generated · one brand, 9 months" },
  { value: "£50k+", label: "TikTok Shop GMV · 12 months" },
  { value: "5+", label: "Years in marketing + content" },
  { value: "48h", label: "Concept turnaround" },
];

const FEATURED_BRANDS: { name: string; logo: string }[] = [
  { name: "Neutonic", logo: "/logos/neutonic.svg" },
  { name: "JustFloow", logo: "/logos/justfloow.svg" },
  { name: "Puma", logo: "/logos/puma.svg" },
  { name: "Anker", logo: "/logos/anker.svg" },
  { name: "MyProtein", logo: "/logos/myprotein.svg" },
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
  { name: "Personal finance", note: "Investing apps, money tools, banking" },
  { name: "Home & lifestyle", note: "Home goods, family setup, everyday gear" },
  { name: "Family & parenting", note: "Couple, family and his-and-hers - solo or with my wife" },
];

type WorkItem = {
  category: string;
  title: string;
  videoSrc: string;
  stat?: string;
};

const WORK: WorkItem[] = [
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
  {
    category: "Puma",
    title: "Sportswear showcase",
    videoSrc: "/work/puma.mp4",
    stat: "High GMV TikTok Shop",
  },
  {
    category: "Neutonic",
    title: "Nootropic drink - long-term partner",
    videoSrc: "/work/neutonic.mp4",
    stat: "Paid UGC partnership",
  },
  {
    category: "Tech",
    title: "4-in-1 charging cable",
    videoSrc: "/work/cable.mp4",
    stat: "Top-selling UGC piece",
  },
  {
    category: "Hitch",
    title: "Bottle + coffee mug - street interview",
    videoSrc: "/work/hitch.mp4",
    stat: "Street interview UGC style",
  },
];

const PROCESS = [
  {
    n: "01",
    title: "Brief",
    body: "Send me the product + a sentence on the angle. Or just the product - I'll handle the rest.",
  },
  {
    n: "02",
    title: "Concept",
    body: "Within 48 hours: script, hook variations, shot list. We lock direction before I film.",
  },
  {
    n: "03",
    title: "Film + edit",
    body: "3-5 days. Mobile-first, paid-ad ready, captions burned in, audio mixed.",
  },
  {
    n: "04",
    title: "Deliver",
    body: "Final cuts, raw footage on request, 2 rounds of revisions included.",
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
                Marketing-trained <span className="text-[color:var(--accent)]">UGC</span> for fitness,
                family and lifestyle brands.
              </p>
              <p className="mt-5 text-sm sm:text-base text-[color:var(--text-muted)] leading-relaxed max-w-xl">
                I write, film and edit UGC built to convert - not just look good. 5+ years in
                performance marketing and content creation, a wife who creates too, and a proper
                perfectionist (i.e. people pleaser. Probably works to your advantage).
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
                <HeroLink
                  href="https://www.tiktok.com/@dansdailydeals"
                  label="TikTok"
                  handle="@dansdailydeals"
                />
                <HeroLink
                  href="mailto:dan@birdandbear.co.uk?subject=UGC brief"
                  label="Email"
                  handle="dan@birdandbear.co.uk"
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
              <div
                key={b.name}
                className="flex items-center justify-center w-full last:col-span-2 sm:last:col-span-1"
              >
                <BrandLogo name={b.name} logo={b.logo} />
              </div>
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

      <section id="work" className="relative border-t border-[color:var(--border)] bg-[color:var(--bg-elevated)]">
        <div className="mx-auto max-w-6xl px-6 py-14 sm:py-20 lg:py-24">
          <div className="flex items-end justify-between flex-wrap gap-4 mb-12">
            <div>
              <SectionLabel n="01">Work</SectionLabel>
              <h2 className="mt-3 text-3xl sm:text-5xl font-semibold tracking-tight">
                Selected spec + client work.
              </h2>
            </div>
            <p className="text-sm text-[color:var(--text-dim)] max-w-md">
              Hand-picked highlights. Brand-specific case studies and full client deliverables available on request.
            </p>
          </div>
          <WorkCarousel items={WORK} />
        </div>
      </section>

      <section className="relative mx-auto max-w-6xl px-6 py-14 sm:py-20 lg:py-24">
        <SectionLabel n="02">What I do</SectionLabel>
        <h2 className="mt-3 text-3xl sm:text-5xl font-semibold tracking-tight max-w-3xl">
          Full-service UGC - brief in, ad-ready file out.
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

      <section className="relative border-t border-[color:var(--border)] bg-[color:var(--bg-elevated)]">
        <div className="mx-auto max-w-6xl px-6 py-14 sm:py-20 lg:py-24">
          <SectionLabel n="03">Why me</SectionLabel>
          <div className="mt-3 grid lg:grid-cols-2 gap-12 lg:gap-20 items-start">
            <div>
              <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight">
                Most UGC creators are great on camera. Few of them know how an ad actually works.
              </h2>
            </div>
            <div className="space-y-8 lg:pt-4">
              <Reason
                title="Marketing-trained."
                body="5+ years in performance marketing, currently leading creative on a 7-figure UK supplement brand. I think in CTRs, hooks and three-second openers - and the numbers back it up."
              />
              <Reason
                title="Your demographic, not a stand-in."
                body="If your customer is a working male in his late 20s or 30s - fitness, supplements, tech, finance, SaaS, dad-and-business brands - I'm already there."
              />
              <Reason
                title="Husband-wife duo available."
                body="Need couple POV, family demos or his-and-hers content? My wife creates too. Book us together and skip the casting call."
              />
              <Reason
                title="UK-based, fast turnarounds."
                body="48-hour concept turnaround, 3-5 days to delivered cuts. I run a business - I treat your deadlines like one."
              />
            </div>
          </div>
        </div>
      </section>

      <section id="niches" className="relative mx-auto max-w-6xl px-6 py-14 sm:py-20 lg:py-24">
        <SectionLabel n="04">Niches</SectionLabel>
        <h2 className="mt-3 text-3xl sm:text-5xl font-semibold tracking-tight max-w-3xl">
          Where I'm strongest.
        </h2>
        <p className="mt-4 max-w-2xl text-[color:var(--text-muted)]">
          Briefs outside these are welcome - but these are where my background gives you an unfair advantage.
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

      <section id="process" className="relative border-t border-[color:var(--border)] bg-[color:var(--bg-elevated)]">
        <div className="mx-auto max-w-6xl px-6 py-14 sm:py-20 lg:py-24">
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
        </div>
      </section>

      <section id="duo" className="relative mx-auto max-w-6xl px-6 py-14 sm:py-20 lg:py-24">
        <SectionLabel n="06">The Duo</SectionLabel>
        <div className="mt-3 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight">
              Two creators, one brief, half the headache.
            </h2>
            <p className="mt-6 text-lg text-[color:var(--text-muted)] leading-relaxed">
              My wife is a UGC creator too. If your product needs a couple POV, a family demo, his-and-hers, or paired content across two demographics - book us as a duo.
            </p>
            <p className="mt-4 text-[color:var(--text-muted)] leading-relaxed">
              One brief. One invoice. Two creators who actually know each other (and your product by the end of it). Perfect for parenting brands, home goods, fitness, travel, wellness - anywhere a &ldquo;real couple&rdquo; beats two strangers reading from the same script.
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
              <DuoCard label="Dan" tag="Marketing-trained" tagline="Dad / business / fitness / SaaS" photo="/duo/dan.png" />
              <DuoCard label="Lydia" tag="Mum creator" tagline="Mum / beauty / wellness / home" photo="/duo/wife.jpg" />
            </div>
            <div className="absolute -inset-px rounded-2xl border border-[color:var(--accent)] opacity-20 pointer-events-none" />
          </div>
        </div>
      </section>

      <section
        id="contact"
        className="relative border-t border-[color:var(--border)] bg-[color:var(--bg-elevated)]"
      >
        <div className="mx-auto max-w-6xl px-6 py-14 sm:py-20 lg:py-24">
          <SectionLabel n="07">Contact</SectionLabel>
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
                href="mailto:dan@birdandbear.co.uk?subject=UGC brief"
                className="hover-lift block p-6 rounded-2xl bg-white text-[color:var(--bg)] shadow-lg"
              >
                <div className="text-xs uppercase tracking-wider text-black/50 mb-2">
                  Email
                </div>
                <div className="text-lg font-semibold text-black">
                  dan@birdandbear.co.uk
                </div>
                <div className="mt-1 text-sm text-black/60">
                  Best for briefs, quotes and pitches.
                </div>
              </a>
              <SocialCard
                label="TikTok"
                handle="@dansdailydeals"
                href="https://www.tiktok.com/@dansdailydeals"
              />
            </div>
          </div>
        </div>
      </section>

      <footer className="relative border-t border-[color:var(--border)]">
        <div className="mx-auto max-w-6xl px-6 py-10 flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm text-[color:var(--text-dim)]">
            © {new Date().getFullYear()} Dan Nightingale. UK-based UGC creator.
          </div>
          <a
            href="mailto:dan@birdandbear.co.uk?subject=Custom%20web%20or%20app%20design%20enquiry&body=Hi%20Dan%2C%20I%20saw%20your%20portfolio%20and%20I'm%20looking%20for%20help%20with%20a%20custom%20web%20or%20app%20build.%20Here%20are%20the%20details%3A%0A%0A-%20What%20I%20need%3A%0A-%20Timeline%3A%0A-%20Budget%3A%0A%0AThanks%2C"
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

function DuoCard({ label, tag, tagline, photo }: { label: string; tag: string; tagline: string; photo: string }) {
  return (
    <div className="hover-lift relative aspect-[3/4] rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-card)] overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo}
        alt={label}
        className="absolute inset-0 w-full h-full object-cover object-top"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none" />
      <div className="relative h-full p-4 sm:p-5 flex flex-col justify-end sm:justify-between gap-2 sm:gap-0">
        <span className="self-start inline-flex items-center px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-black/55 backdrop-blur-md border border-white/10 text-[10px] sm:text-xs uppercase tracking-wider text-[color:var(--accent)] font-semibold whitespace-nowrap">
          {tag}
        </span>
        <div>
          <div className="text-lg sm:text-2xl font-semibold tracking-tight text-white leading-tight">{label}</div>
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
      <div className="text-xs uppercase tracking-wider text-black/50 mb-1">
        {label}
      </div>
      <div className="text-sm font-semibold text-black">{handle}</div>
    </a>
  );
}

function BrandLogo({ name, logo }: { name: string; logo: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="text-base sm:text-lg font-bold uppercase tracking-wider text-[color:var(--text-muted)] text-center">
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
      className="h-10 sm:h-12 max-w-[140px] object-contain opacity-80 hover:opacity-100 transition-opacity"
      style={{ filter: "brightness(0) invert(1)" }}
    />
  );
}

function WorkCarousel({ items }: { items: WorkItem[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Render the list 3x so there's always content peeking on both sides.
  // Start scrolled into the middle copy on mount.
  const displayItems = [...items, ...items, ...items];

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      // Start scrolled into the middle copy, offset so the previous card peeks on the left
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
      <div className="pointer-events-none absolute left-0 top-0 bottom-3 w-24 bg-gradient-to-r from-[color:var(--bg)] via-[color:var(--bg)]/60 to-transparent hidden lg:block" />
      <div className="pointer-events-none absolute right-0 top-0 bottom-3 w-24 bg-gradient-to-l from-[color:var(--bg)] via-[color:var(--bg)]/60 to-transparent hidden lg:block" />
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
        <div className="text-xs uppercase tracking-wider text-[color:var(--accent)] font-medium">
          {item.category}
        </div>
        <div className="mt-1 text-sm font-medium text-[color:var(--text)] leading-snug">
          {item.title}
        </div>
        {item.stat && (
          <div className="mt-1 text-xs text-[color:var(--text-muted)]">{item.stat}</div>
        )}
      </div>
    </div>
  );
}
