/* Billing shapes shared by the server and the browser. */

export type Billing = {
  /** Stripe is set up; when false everyone signed in has full access. */
  enabled: boolean;
  owner: boolean;
  hasAccess: boolean;
  status: string | null;
  trialEnd: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  founder: boolean;
};

/** What a creator without a subscription is offered. */
export type Offer = {
  price: string | null;
  trialDays: number;
  founder: boolean;
  spotsLeft: number;
  founderSlots: number;
};

export const OPEN_ACCESS: Billing = {
  enabled: false,
  owner: false,
  hasAccess: true,
  status: null,
  trialEnd: null,
  periodEnd: null,
  cancelAtPeriodEnd: false,
  founder: false,
};
