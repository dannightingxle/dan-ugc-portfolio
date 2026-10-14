import Link from "next/link";
import { MODULES } from "./offer";

/* Shared pieces for the mentorship and course pages, in the waitlist page's style. */

export function Shell({ cta, children }: { cta?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <>
      <div className="aurora" />
      <header className="relative z-10 border-b border-[color:var(--border)]">
        <div className="mx-auto max-w-[1200px] flex items-center justify-between px-6 lg:px-10 py-4">
          <Link href="/" className="font-semibold tracking-tight text-[color:var(--text)]">
            Dan Nightingale<span className="text-[color:var(--accent)]">.</span>
          </Link>
          {cta && (
            <a
              href={cta.href}
              className="text-sm font-medium px-4 py-2 rounded-full bg-[color:var(--accent)] text-[color:var(--bg)] hover:bg-[color:var(--accent-hover)] transition-colors"
            >
              {cta.label}
            </a>
          )}
        </div>
      </header>
      <main className="relative z-10 mx-auto w-full max-w-[1200px] px-6 lg:px-10 pt-12 sm:pt-20 pb-24">{children}</main>
      <footer className="relative z-10 border-t border-[color:var(--border)]">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-10 py-8 text-xs text-[color:var(--text-dim)]">
          © {new Date().getFullYear()} Dan Nightingale. Payments are handled securely by Stripe.
        </div>
      </footer>
    </>
  );
}

/* Goes to the Stripe payment link, or shows "Opening soon" until one is set in offer.ts. */
export function CheckoutButton({ url, label, className = "" }: { url: string; label: string; className?: string }) {
  const base =
    "inline-flex items-center justify-center gap-2 text-sm font-semibold px-6 py-3.5 rounded-full transition-colors " + className;
  if (!url) {
    return (
      <span aria-disabled="true" className={base + " bg-[color:var(--bg-card)] border border-[color:var(--border-strong)] text-[color:var(--text-muted)] cursor-not-allowed"}>
        Opening soon
      </span>
    );
  }
  return (
    <a href={url} className={base + " bg-[color:var(--accent)] text-[color:var(--bg)] hover:bg-[color:var(--accent-hover)]"}>
      {label}
      <span aria-hidden="true">→</span>
    </a>
  );
}

export function Dot() {
  return <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[color:var(--accent)]" />;
}

export function ModuleGrid() {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {MODULES.map((m, i) => (
        <div key={m.title} className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-card)] p-6 flex flex-col">
          <span className="font-display text-4xl text-[color:var(--accent)]">{String(i + 1).padStart(2, "0")}</span>
          <h3 className="mt-3 font-semibold text-[color:var(--text)]">{m.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--text-muted)]">{m.body}</p>
          {m.tag && (
            <span className="mt-4 self-start rounded-full border border-[color:var(--accent)] px-3 py-1 text-xs text-[color:var(--accent)]">
              {m.tag}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/* Numbered next steps on the thank-you pages. */
export function Steps({ steps }: { steps: { title: string; body: React.ReactNode }[] }) {
  return (
    <ol className="flex flex-col gap-4">
      {steps.map((s, i) => (
        <li key={s.title} className="flex gap-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-card)] p-6">
          <span className="font-display text-3xl leading-none text-[color:var(--accent)]">{i + 1}</span>
          <div>
            <p className="font-semibold text-[color:var(--text)]">{s.title}</p>
            <div className="mt-1 text-sm leading-relaxed text-[color:var(--text-muted)]">{s.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
