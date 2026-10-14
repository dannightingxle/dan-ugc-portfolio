import { HOURS, STAGE, STRUGGLES } from "../waitlist/questions";

/* The new-member intro form (/start and the "You're in" pages). The API route
   validates against these lists, and each value is the text stored in the
   Onboarding tab of the waitlist Google Sheet. */

export { HOURS, STAGE };

export const EXPERIENCE = ["Haven't started yet", "Under 3 months", "3-6 months", "6-12 months", "Over a year"] as const;

export const PAID_JOBS = ["None yet", "1-3", "4-10", "More than 10"] as const;

export const HELP_FIRST = [...STRUGGLES, "Tech UGC jobs"] as const;

export type OnboardingEntry = {
  name: string;
  email: string;
  tiktok: string;
  instagram: string;
  otherSocials: string;
  portfolio: string;
  experience: string;
  stage: string;
  paidJobs: string;
  hours: string;
  helpFirst: string[];
  goal: string;
  notes: string;
};
