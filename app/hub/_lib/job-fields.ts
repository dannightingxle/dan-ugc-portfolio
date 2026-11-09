/* A job's fixed choices, in a file the server can use too (store.ts is
   browser-only and re-exports these). */

export const STAGES = ["Pitched", "Briefed", "Scripting", "Filming", "Delivered", "Paid", "Lost"] as const;
export type Stage = (typeof STAGES)[number];

export const PAYMENT_STATUSES = ["Not invoiced", "Invoiced", "Paid"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const SHIPPING = ["Not needed", "Waiting", "On its way", "Received"] as const;

/** Tech UGC jobs (a dedicated account posting for an app) move through these instead. */
export const TECH_STAGES = ["Negotiating", "Account creation", "Setup", "Warm-up", "Active", "On hold", "Ended", "Lost"] as const;
export type TechStage = (typeof TECH_STAGES)[number];

/** Where a job came from: a brand's inbound message, a UGC platform (Twirl, Insense…) or your own outreach. */
export const SOURCES = ["Inbound", "Platform", "Outreach"] as const;
