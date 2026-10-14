import { CURRENCIES, type Currency } from "../../../hub/_lib/currencies";

/* Today's exchange rates for turning fees in other currencies into the
   account's currency (ECB rates via Frankfurter, refreshed twice a day). */

export async function GET(request: Request) {
  const base = new URL(request.url).searchParams.get("base") as Currency;
  if (!CURRENCIES.includes(base)) return Response.json({ error: "Unknown currency." }, { status: 400 });
  const symbols = CURRENCIES.filter((c) => c !== base).join(",");
  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${base}&symbols=${symbols}`, { next: { revalidate: 43_200 } });
    if (!res.ok) throw new Error(`rates ${res.status}`);
    const data = (await res.json()) as { date: string; rates: Record<string, number> };
    return Response.json({ base, date: data.date, rates: { ...data.rates, [base]: 1 } });
  } catch (e) {
    console.error("Creator Desk: exchange rates unavailable", e);
    return Response.json({ error: "Exchange rates unavailable." }, { status: 503 });
  }
}
