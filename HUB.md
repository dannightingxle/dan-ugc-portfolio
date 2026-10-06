# Creator Hub (demo)

A private section of the site at **`/hub`** for tracking the ads you're in,
your brand projects and your scripts. Not in the site nav and set to `noindex`.

| Page | What it does |
| --- | --- |
| `/hub` | Home: money (earned, awaiting payment, pipeline), projects coming up, then your starred ads with reach, days running and trend line. |
| `/hub/projects` | Board from Pitched to Paid. **+ New project** asks for the basics (brand, job, fee, delivery date) then opens the project page. |
| `/hub/projects/[id]` | Everything about one job, saved as you type: payment (fee, invoiced/paid, invoice no., terms, due/overdue), dates, contact (with email/call/WhatsApp/Instagram buttons), deliverables checklist with quick-add presets, the brief (product, shipping, key messages, do's and don'ts, usage rights, exclusivity, revisions), links (Notion, Drive… auto-labelled), notes, a script box and the live ads it produced. |
| `/hub/find` | Search a brand (name, website or @handle), browse its Meta ads, star the ones you're in. "Creator / partnership ads" filters to ads run with a creator's handle. |
| `/hub/ads/[id]` | One ad: numbers, daily reach chart, a screenshot-ready share card, and the transcript, which you can save into a project. |
| `/hub/scripts` | "Coming soon" page for the scripting and shot-list tool. |
| `/hub/login`, `/hub/account` | Sign in / create account / forgot password, and the account page (name, password, sign out). Only when accounts are set up. |

## Accounts (Supabase)

Each creator signs up with email + password and gets their own projects, starred ads and
usage history. Data lives in Supabase with row-level security, so nobody can see anyone
else's data - even by calling the database directly. Without Supabase set up, the hub
runs single-user and saves to the browser like before.

**One-off setup (~10 minutes):**

1. Create a free project at [supabase.com](https://supabase.com) (pick a London/EU region).
2. In the project: **SQL Editor → New query**, paste everything from
   `supabase/migrations/20261006120000_creator_hub.sql`, and **Run**.
3. **Authentication → URL Configuration**:
   - Site URL: `https://www.dannightingxle.com/hub`
   - Redirect URLs: add `https://www.dannightingxle.com/hub/**` and `https://*-daniels-projects-05fa8574.vercel.app/**` (previews)
4. **Project Settings → API Keys**: copy the **Project URL** and the **Publishable key**.
5. In Vercel → Project → Settings → Environment Variables, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = the Project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the Publishable key
   - optional `HUB_ALLOWED_EMAILS` = `you@example.com,friend@example.com` to make it
     invite-only (unset = anyone with the link can sign up)
6. Redeploy. `/hub` now shows sign in / create account. Anything you'd saved in your
   browser before shows a one-click "Add to my account" banner.

**Emails:** Supabase's built-in email sender only allows a few emails an hour - fine for
testing. Before inviting other creators, connect a proper sender (e.g. Resend) under
**Authentication → Emails → SMTP Settings**, and edit the email templates there.

## Demo vs live data

With no TrendTrack key it runs on **made-up brands** (badge says "Demo data"). To switch to
real data add `TRENDTRACK_API_KEY` in Vercel and redeploy. Live data only switches on when
`/hub` is protected - by accounts (above) or, without accounts, a single `HUB_PASSWORD` -
so strangers can't spend your credits. Every live call is recorded per user in the
`hub_usage` table (the basis for billing). Responses are cached (1h lists, 6h ad detail).

## How it's built

- `app/hub/_lib/trendtrack.ts` - server-only TrendTrack client (lookup, advertiser ads,
  ad detail + reach history). Spec: https://api.trendtrack.io/v1/openapi.json
- `app/hub/_lib/demo-data.ts` - the fake brands.
- `app/api/hub/*` - routes the pages call; the key never reaches the browser.
- `app/hub/_lib/meter.ts` - logs each live call per user and rows returned: the hook
  for billing each creator for their own usage.
- `app/hub/_lib/store.ts` - stars and projects; saves to the user's Supabase rows when
  signed in, otherwise to this browser.
- `app/hub/_lib/supabase/` - Supabase clients and the accounts on/off switch.
- `app/hub/account-provider.tsx`, `app/hub/login`, `app/hub/account`, `app/hub/auth/confirm` -
  sign in/up, account page, and where email links land.
- `supabase/` - database migration (tables + security rules) and local dev config.
- `proxy.ts` - sends signed-out visitors to the login page (or checks `HUB_PASSWORD`).

## Not built yet (needed before other creators pay for it)

1. Stripe billing per creator, reading from `hub_usage`.
2. Written OK from TrendTrack to serve their data to other users (their terms limit it
   to personal/internal use otherwise).
3. A proper email sender (see Accounts above) and its own domain/brand, which is also
   the natural point to move it into its own repo.

## Style

The "Sky" look - cool white, slate text, blue accent, Plus Jakarta Sans. Colours, font
and corner radii all live in one block in `app/hub/hub.css`; change values there to
restyle the whole hub.
