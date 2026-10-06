# Creator Hub (demo)

A private section of the site at **`/hub`** for tracking the ads you're in,
your brand projects and your scripts. Not in the site nav and set to `noindex`.

| Page | What it does |
| --- | --- |
| `/hub` | Your starred ads: reach, days running, trend line, still running or not. Plus a project summary. |
| `/hub/find` | Search a brand (name, website or @handle), browse its Meta ads, star the ones you're in. "Creator / partnership ads" filters to ads run with a creator's handle. |
| `/hub/ads/[id]` | One ad: numbers, daily reach chart, a screenshot-ready share card, and the transcript, which you can save into a project. |
| `/hub/projects` | Board from Pitched to Paid. Each project has fee, due date, a hook/body/CTA script editor with spoken-length estimate, and linked ads. |

## Demo vs live data

With no setup it runs on **made-up brands** (badge says "Demo data").
To switch to real TrendTrack data, add both of these in Vercel →
Project → Settings → Environment Variables, then redeploy:

- `TRENDTRACK_API_KEY` - your TrendTrack Public API key (Pro plan or above)
- `HUB_PASSWORD` - any password; `/hub` then asks for it

Live mode needs both, so your key can't be used by strangers hitting the API.
TrendTrack responses are cached (1h for lists, 6h for ad detail) to save credits.

## How it's built

- `app/hub/_lib/trendtrack.ts` - server-only TrendTrack client (lookup, advertiser ads,
  ad detail + reach history). Spec: https://api.trendtrack.io/v1/openapi.json
- `app/hub/_lib/demo-data.ts` - the fake brands.
- `app/api/hub/*` - routes the pages call; the key never reaches the browser.
- `app/hub/_lib/meter.ts` - logs each live call per user and rows returned: the hook
  for billing each creator for their own usage.
- `app/hub/_lib/store.ts` - stars and projects saved in **this browser's localStorage**.
- `proxy.ts` - the password gate.

## Not built yet (needed before other creators use it)

1. Accounts and a database (e.g. Supabase) in place of localStorage, so data follows you
   across devices and each creator has their own.
2. Usage metering into that database + Stripe billing per creator.
3. Written OK from TrendTrack to serve their data to other users (their terms limit it
   to personal/internal use otherwise).
4. Moving it into its own repo/app once it outgrows the portfolio site.
