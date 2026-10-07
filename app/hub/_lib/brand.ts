/* Product name and copy in one place. The legal/contact details come from env
   vars so they can be filled in without a code change (see LAUNCH.md). */
export const BRAND = {
  name: "Creator Desk",
  /** The logo splits here: "Creator" plain, "Desk" in the accent colour. */
  logo: ["Creator", "Desk"] as const,
  tagline: "The back office for UGC creators",
  description:
    "Track every brand deal from pitch to paid, keep briefs and contacts in one place, and see how your ads are performing across brand accounts.",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "",
  /** The person or company that runs Creator Desk, for the legal pages. */
  legalName: process.env.NEXT_PUBLIC_LEGAL_NAME ?? "",
};
