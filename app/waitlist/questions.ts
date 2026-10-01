/* Single source of truth for the waitlist survey. The form renders from these
   lists and the API route validates against them, so editing an option here
   updates both. Each `value` becomes the text stored in the Google Sheet. */

export const STAGE = [
  "Haven't started yet",
  "Made some content, no paid deals yet",
  "Landed my first few paid deals",
  "Doing it regularly - want to scale",
] as const;

export const GOAL = [
  "An extra £500-£1k a month",
  "An extra £1k-£3k a month",
  "Replace my 9-5 income",
  "Not sure yet - just curious",
] as const;

export const HOURS = ["Under 2 hours", "2-5 hours", "5-10 hours", "10+ hours"] as const;

export const STRUGGLES = [
  "Knowing where to start",
  "Finding and pitching brands",
  "Knowing what to charge",
  "Confidence on camera",
  "Scripts and hooks",
  "Filming and editing",
  "Building a portfolio",
  "Fitting it around a full-time job",
  "Getting repeat clients",
] as const;

export const FORMATS = [
  "Short video lessons",
  "Live group calls",
  "1:1 feedback on my content",
  "Templates and scripts",
  "Pitch emails and brand lists",
] as const;

export const PRICE = [
  "Under £200",
  "£200-£350",
  "£350-£500",
  "£500-£750",
  "£750-£1,000",
  "£1,000+",
] as const;

export const GUARANTEE = [
  "It would be the deciding factor",
  "Nice to have",
  "Wouldn't change my decision",
] as const;

export const COMMUNITY = ["WhatsApp", "Discord", "Slack", "No preference"] as const;

export type WaitlistEntry = {
  name: string;
  email: string;
  handle: string;
  stage: string;
  goal: string;
  hours: string;
  struggles: string[];
  wishlist: string;
  formats: string[];
  price: string;
  guarantee: string;
  community: string;
  notes: string;
};
