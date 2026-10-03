import type { Metadata } from "next";

/* Link-in-bio page (/links) - the one URL for TikTok/Instagram bios.
   Fill in the empty hrefs as each piece goes live; links with no href are hidden. */

export const metadata: Metadata = {
  title: "Dan Nightingale — Links",
  description: "UGC creator. Free A-Z of UGC, the 0 to £1k course, mentorship and my portfolio.",
  openGraph: {
    title: "Dan Nightingale — Links",
    description: "Free A-Z of UGC, the 0 to £1k course, mentorship and my portfolio.",
    type: "website",
  },
};

type LinkItem = { label: string; note: string; href: string; tag?: string; featured?: boolean };

const LINKS: LinkItem[] = [
  {
    label: "Free: The A-Z of UGC",
    note: "30-minute masterclass - everything I'd tell you if you were starting today",
    href: "", // Skool free group invite link
    tag: "Free",
    featured: true,
  },
  {
    label: "0 to £1k a month in UGC",
    note: "The step-by-step course - one payment, lifetime access",
    href: "", // Skool course link
    tag: "£147",
  },
  {
    label: "UGC Mentorship",
    note: "The course + 90 days of direct help from me. Limited places",
    href: "/waitlist",
    tag: "Apply",
  },
  {
    label: "Brands: work with me",
    note: "Portfolio, past work and rates",
    href: "/",
  },
];

const SOCIALS = [
  { label: "TikTok", href: "https://www.tiktok.com/@dannightingxle.ugc", icon: <TikTokIcon /> },
  { label: "Instagram", href: "https://www.instagram.com/dannightingxle.ugc", icon: <InstagramIcon /> },
  { label: "Email", href: "mailto:hello@dannightingxle.com", icon: <MailIcon /> },
];

export default function LinksPage() {
  return (
    <>
      <div className="aurora" />
      <main className="relative z-10 mx-auto w-full max-w-[480px] px-5 pt-14 pb-16 flex flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/dan-hero.jpg"
          alt="Dan Nightingale"
          className="size-24 rounded-full object-cover border-2 border-[color:var(--accent)] shadow-xl"
          style={{ objectPosition: "center 30%" }}
        />
        <h1 className="mt-5 font-display text-4xl">
          Dan Nightingale<span className="text-[color:var(--accent)]">.</span>
        </h1>
        <p className="mt-2 text-center text-[color:var(--text-muted)]">
          UGC creator · Teaching you to make it a second income
        </p>

        <div className="mt-5 flex items-center gap-3">
          {SOCIALS.map((s) => (
            <a
              key={s.label}
              href={s.href}
              aria-label={s.label}
              target={s.href.startsWith("http") ? "_blank" : undefined}
              rel="noopener noreferrer"
              className="grid place-items-center size-11 rounded-full border border-[color:var(--border)] bg-[color:var(--bg-card)] text-[color:var(--text)] transition-colors hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
            >
              {s.icon}
            </a>
          ))}
        </div>

        <ul className="mt-9 w-full flex flex-col gap-3">
          {LINKS.filter((l) => l.href).map((l) => (
            <li key={l.label}>
              <a
                href={l.href}
                className={`hover-lift group flex items-center gap-4 rounded-2xl border px-5 py-4 transition-colors ${
                  l.featured
                    ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)]"
                    : "border-[color:var(--border)] bg-[color:var(--bg-card)] hover:border-[color:var(--border-strong)]"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[color:var(--text)]">{l.label}</p>
                  <p className="mt-0.5 text-sm leading-snug text-[color:var(--text-muted)]">{l.note}</p>
                </div>
                {l.tag && (
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                      l.featured
                        ? "bg-[color:var(--accent)] text-[color:var(--bg)]"
                        : "border border-[color:var(--border-strong)] text-[color:var(--text)]"
                    }`}
                  >
                    {l.tag}
                  </span>
                )}
              </a>
            </li>
          ))}
        </ul>

        <p className="mt-12 text-xs text-[color:var(--text-dim)]">© {new Date().getFullYear()} Dan Nightingale</p>
      </main>
    </>
  );
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.59 2.59 0 0 1-2.59-2.59 2.6 2.6 0 0 1 3.4-2.47V9.68a5.69 5.69 0 0 0-6.5 5.63A5.7 5.7 0 0 0 9.86 21a5.69 5.69 0 0 0 5.68-5.69V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.3 4.3 0 0 1-3.24-1.48Z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}
