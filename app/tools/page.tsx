import type { Metadata } from "next";
import Link from "next/link";

/* My tools (/tools) - every tool I use to find, make and keep track of UGC work, with a link to each.
   Linked from /links, and the page to point people to from videos about my tech stack.

   To swap in an affiliate link once it's approved: paste it into `href` and add `affiliate: true`.
   That shows the "Affiliate" label on the row and tells search engines it's a paid link. */

export const metadata: Metadata = {
  title: "Dan Nightingale — My tools",
  description: "Every tool I use to find UGC work, make the videos and keep track of the money, with a link to each.",
  openGraph: {
    title: "Dan Nightingale — My tools",
    description: "Every tool I use to find UGC work, make the videos and keep track of the money.",
    type: "website",
  },
};

type Tool = {
  name: string;
  note: string;
  href: string;
  /** True when the link pays me if someone signs up through it. */
  affiliate?: boolean;
  /** Shown on the right in place of "Visit", e.g. "Waitlist". */
  cta?: string;
};

type Section = { step: string; title: string; intro: string; tools: Tool[] };

const SECTIONS: Section[] = [
  {
    step: "1",
    title: "Finding work",
    intro: "Where the brand deals come from, and what my portfolio and outreach run on.",
    tools: [
      { name: "Claude", note: "My AI assistant. It built my portfolio site and helps with research and outreach.", href: "https://claude.com/pricing" },
      { name: "Vercel", note: "Where my portfolio website is hosted.", href: "https://vercel.com" },
      { name: "Namecheap", note: "Where I buy my domain names.", href: "https://www.namecheap.com" },
      { name: "Twirl", note: "UGC platform where brands post paid briefs.", href: "https://www.usetwirl.com" },
      { name: "Influee", note: "UGC platform for paid brand jobs.", href: "https://influee.co" },
      { name: "Insense", note: "UGC platform that connects creators with brands.", href: "https://insense.pro" },
      { name: "Backstage", note: "Casting site with paid UGC and on-camera jobs.", href: "https://www.backstage.com" },
      { name: "Apify", note: "Pulls together lists of brands to pitch.", href: "https://apify.com" },
      { name: "Notion", note: "Where I plan and keep my notes.", href: "https://www.notion.com" },
      {
        name: "Google Workspace",
        note: "A professional email address on my own domain.",
        href: "https://sharegoogleworkspace.advocate.impact.com/mzZqa7S",
        affiliate: true,
      },
    ],
  },
  {
    step: "2",
    title: "Producing work",
    intro: "Scripting, editing and posting the videos.",
    tools: [
      { name: "CapCut", note: "What I edit my videos in.", href: "https://www.capcut.com" },
      { name: "Wispr Flow", note: "I talk, it types. How I write scripts and messages quickly.", href: "https://wisprflow.ai" },
      { name: "Buffer", note: "Schedules my posts to every platform at once.", href: "https://join.buffer.com/daniel-nightingale", affiliate: true },
    ],
  },
  {
    step: "3",
    title: "Tracking work",
    intro: "Keeping on top of the money and what's due.",
    tools: [
      // Plain links for now: swap in the referral links from the Tide app and the Capital on Tap portal.
      { name: "Tide", note: "My business bank account.", href: "https://www.tide.co" },
      { name: "Capital on Tap", note: "My business credit card.", href: "https://www.capitalontap.com" },
      {
        name: "Creator Desk",
        note: "The app I built to run my UGC business: brand deals, what you're owed, shoot sheets and edits.",
        href: "/creatordesk",
        cta: "Waitlist",
      },
    ],
  },
];

const hasAffiliate = SECTIONS.some((s) => s.tools.some((t) => t.affiliate));

export default function ToolsPage() {
  return (
    <>
      <div className="aurora" />
      <main className="relative z-10 mx-auto w-full max-w-[480px] px-5 pt-10 pb-16">
        <Link
          href="/links"
          className="inline-flex items-center gap-1.5 py-2 text-sm text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--text)]"
        >
          <span aria-hidden="true">←</span> All my links
        </Link>

        <h1 className="mt-4 font-display text-4xl">
          My tools<span className="text-[color:var(--accent)]">.</span>
        </h1>
        <p className="mt-2 text-[color:var(--text-muted)]">
          Everything I use to find UGC work, make the videos and keep track of the money. Tap any tool to open it.
        </p>

        <nav aria-label="Sections" className="mt-5 flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <a
              key={s.step}
              href={`#step-${s.step}`}
              className="rounded-full border border-[color:var(--border)] bg-[color:var(--bg-card)] px-3.5 py-2 text-sm text-[color:var(--text)] transition-colors hover:border-[color:var(--accent)]"
            >
              <span className="text-[color:var(--accent)]">{s.step}.</span> {s.title}
            </a>
          ))}
        </nav>

        {SECTIONS.map((s) => (
          <section key={s.step} id={`step-${s.step}`} className="mt-10 scroll-mt-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-[color:var(--accent)]">Step {s.step}</p>
            <h2 className="mt-1 font-display text-2xl">{s.title}</h2>
            <p className="mt-1 text-sm text-[color:var(--text-muted)]">{s.intro}</p>

            <ul className="mt-4 flex flex-col gap-2.5">
              {s.tools
                .filter((t) => t.href)
                .map((t) => {
                  const external = t.href.startsWith("http");
                  return (
                    <li key={t.name}>
                      <a
                        href={t.href}
                        target={external ? "_blank" : undefined}
                        rel={external ? (t.affiliate ? "sponsored noopener noreferrer" : "noopener noreferrer") : undefined}
                        className="hover-lift flex items-center gap-3.5 rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-card)] p-3.5 transition-colors hover:border-[color:var(--border-strong)]"
                      >
                        <span
                          aria-hidden="true"
                          className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-lg font-black tracking-tighter text-black"
                        >
                          {t.name[0]}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-semibold text-[color:var(--text)]">{t.name}</span>
                            {t.affiliate && (
                              <span className="rounded-full bg-[color:var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--accent)]">
                                Affiliate
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-sm leading-snug text-[color:var(--text-muted)]">{t.note}</span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold text-[color:var(--text)]">
                          {t.cta ?? "Visit"} <span aria-hidden="true">{external ? "↗" : "→"}</span>
                        </span>
                      </a>
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}

        {hasAffiliate && (
          <p className="mt-10 rounded-2xl border border-[color:var(--border)] p-4 text-sm leading-relaxed text-[color:var(--text-muted)]">
            Links marked <span className="font-semibold text-[color:var(--accent)]">Affiliate</span> pay me a small commission if you sign up
            through them, at no extra cost to you. I only list tools I actually use.
          </p>
        )}

        <p className="mt-10 text-center text-xs text-[color:var(--text-dim)]">© {new Date().getFullYear()} Dan Nightingale</p>
      </main>
    </>
  );
}
