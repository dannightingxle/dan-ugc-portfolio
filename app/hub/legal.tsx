import Link from "next/link";
import { BRAND } from "./_lib/brand";

/* Shared shell and details for the privacy policy and terms. */

export const LAST_UPDATED = "7 October 2026";

/** Who runs Creator Desk, for the legal pages (NEXT_PUBLIC_LEGAL_NAME). */
export const operator = BRAND.legalName || BRAND.name;

export function Contact() {
  return BRAND.supportEmail ? (
    <a href={`mailto:${BRAND.supportEmail}`} className="text-accent underline">
      {BRAND.supportEmail}
    </a>
  ) : (
    <>the Feedback button in the app</>
  );
}

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-2xl py-8 leading-relaxed text-text-muted [&_a]:text-accent [&_h2]:mb-2 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-text [&_li]:mt-1.5 [&_p]:mt-3 [&_strong]:text-text [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
      <h1 className="font-serif text-4xl text-text">{title}</h1>
      <p className="text-sm text-text-dim">Last updated {LAST_UPDATED}</p>
      {children}
      <p className="mt-12 border-t border-border pt-6 text-sm">
        <Link href="/hub/welcome">← {BRAND.name}</Link>
      </p>
    </article>
  );
}
