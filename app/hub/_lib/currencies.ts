/* The currencies fees and rates can be in. Kept apart from the store so the
   server can use them too. */

export const CURRENCIES = ["GBP", "USD", "EUR", "AUD", "CAD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export function isCurrency(v: unknown): v is Currency {
  return CURRENCIES.includes(v as Currency);
}

/** Rough rates (per 1 USD) to use until today's load, or if they can't be fetched. */
export const FALLBACK_PER_USD: Record<Currency, number> = { USD: 1, GBP: 0.754, EUR: 0.893, AUD: 1.427, CAD: 1.422 };
