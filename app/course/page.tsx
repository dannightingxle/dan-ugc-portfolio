import type { Metadata } from "next";
import Link from "next/link";
import { OFFER } from "../mentorship/offer";
import { CheckoutButton, Dot, ModuleGrid, Shell } from "../mentorship/parts";

/* Course-only page. Deliberately unlisted: not in any nav, not indexed, and
   only reached through links you send (emails, DMs). The mentorship at
   /mentorship is the main offer. */

export const metadata: Metadata = {
  title: "Anyone Can Create: the course — Dan Nightingale",
  description: "The full Anyone Can Create UGC course, on its own.",
  robots: { index: false, follow: false },
};

const { course, mentorship } = OFFER;

const POINTS = [
  "All eight modules, from your first video to retainers",
  "New lessons every Monday",
  "Templates: pitch emails, brand lists, scripts and rate cards",
  "The Skool group for announcements and questions",
];

export default function CoursePage() {
  return (
    <Shell>
      <div className="max-w-3xl">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
          <span className="size-1.5 rounded-full bg-[color:var(--accent)]" />
          The course on its own
        </div>
        <h1 className="mt-6 font-display text-6xl sm:text-7xl leading-[0.92] tracking-[-0.02em]">
          Anyone <em className="text-[color:var(--accent)]">Can Create.</em>
        </h1>
        <p className="mt-6 text-lg sm:text-xl font-medium tracking-tight leading-snug text-[color:var(--text-muted)] max-w-2xl">
          The full course: the exact system I use to land paid UGC deals around a 9-5, to work through at your own pace.
        </p>
      </div>

      <div className="mt-12 grid lg:grid-cols-[1fr_1fr] gap-6 items-start">
        <div className="rounded-2xl border border-[color:var(--accent)] bg-[color:var(--accent-soft)] p-6 sm:p-8">
          <ul className="flex flex-col gap-3">
            {POINTS.map((p) => (
              <li key={p} className="flex gap-3">
                <Dot />
                <span className="text-[color:var(--text)]">{p}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            {course.price && <span className="font-display text-5xl">{course.price}</span>}
            <CheckoutButton url={course.checkoutUrl} label="Get the course" />
          </div>
          <p className="mt-3 text-sm text-[color:var(--text-dim)]">One-time payment. Access within 24 hours.</p>
        </div>

        <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-card)] p-6 sm:p-8">
          <p className="font-semibold text-[color:var(--text)]">Want me in your corner too?</p>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--text-muted)]">
            The course doesn&apos;t include feedback from me, the mentorship WhatsApp group, referrals to paid tech UGC
            work or the 30-day guarantee. Those come with the mentorship ({mentorship.price}), which includes this course.
          </p>
          <Link href="/mentorship" className="mt-4 inline-block text-sm font-medium text-[color:var(--accent)] underline underline-offset-4">
            See the mentorship
          </Link>
        </div>
      </div>

      <section className="mt-20">
        <h2 className="font-display text-4xl sm:text-5xl">
          What&apos;s <em className="text-[color:var(--accent)]">inside.</em>
        </h2>
        <div className="mt-8">
          <ModuleGrid />
        </div>
      </section>
    </Shell>
  );
}
