"use client";

import { useCallback } from "react";
import { useAccount } from "../account-provider";
import { FALLBACK_PER_USD, type Currency } from "./currencies";
import { money, useApi } from "./ui";

/* Totals in the account's currency: each amount is converted from its own
   currency at today's rates (rough built-in rates until those load). */

export function useMoney() {
  const base: Currency = useAccount().user?.currency ?? "GBP";
  const { data } = useApi<{ rates: Record<Currency, number> }>(`/api/hub/fx?base=${base}`);
  const convert = useCallback(
    (amount: number, from: Currency) => {
      if (from === base) return amount;
      // rates are "1 base = x from"; the fallback goes via USD.
      const rate = data?.rates?.[from] ?? FALLBACK_PER_USD[from] / FALLBACK_PER_USD[base];
      return amount / rate;
    },
    [base, data],
  );
  // Converted totals are rounded to whole units - pence after a conversion are just noise.
  const format = useCallback((n: number | null | undefined) => money(n == null ? n : Math.round(n), base), [base]);
  return { base, convert, format };
}
