# Launching Creator Desk

Everything in the app is built and tested. What's left is setting up the accounts
it runs on and pasting their keys into Vercel. Do the steps in order - about
**2 hours** in total, most of it waiting for verification emails and DNS.

> Until the Supabase and Stripe keys are in Vercel, the live site keeps working
> exactly as it does now (single user, no sign-ups), so nothing breaks while you
> set things up.

---

## 1. Plans you'll need (15 min)

| Service | Plan | Why |
| --- | --- | --- |
| **Vercel** | **Pro ($20/mo)** | The free Hobby plan is for non-commercial use only - taking payments needs Pro. Upgrade the team that owns `dan-ugc-portfolio`. |
| **Supabase** | Free to start, **Pro ($25/mo) recommended** | Free projects pause after a week without traffic and don't come with daily backups. For a product people pay for, Pro is worth it. |
| **Stripe** | Pay as you go | Standard UK card fees per payment. |
| **Resend** | Free (3,000 emails/mo) | Sends sign-up and password-reset emails. |

## 2. Domain (optional, 15 min + DNS time)

The app works at `www.dannightingxle.com/hub` with no extra setup. For its own
address: `creatordesk.co.uk` and `getcreatordesk.com` looked unregistered on
7 Oct 2026 (`.com` and `.app` are taken).

1. Buy the domain, then in **Vercel → dan-ugc-portfolio → Settings → Domains**, add it (and `www.` too) and follow the DNS instructions.
2. Add env var `HUB_APP_HOST` = `creatordesk.co.uk` (no `https://`). Every page on that domain then opens Creator Desk.

Below, **`APP`** means your app address - either `https://www.dannightingxle.com`
or `https://creatordesk.co.uk`.

## 3. Supabase - accounts and database (20 min)

1. [supabase.com](https://supabase.com) → **New project**. Region: **London (eu-west-2)**. Save the database password somewhere safe.
2. **SQL Editor → New query** → paste all of `supabase/migrations/20261006120000_creator_hub.sql` → **Run**. Then do the same with `supabase/migrations/20261007090000_creator_desk_launch.sql`. (Order matters.)
3. **Authentication → URL Configuration**
   - Site URL: `APP/hub`
   - Redirect URLs: add `APP/hub/**` (and `https://*-daniels-projects-05fa8574.vercel.app/**` if you want preview links to work)
4. **Authentication → Sign In / Providers → Email** - choose:
   - **Confirm email OFF** (recommended for launch): people go straight from sign-up to card details. The card is the real check.
   - **Confirm email ON**: an extra step for creators, and needs step 5 done first.
5. **Authentication → Emails → Templates**: paste `supabase/templates/confirmation.html` into "Confirm signup" (subject *Confirm your Creator Desk email*) and `supabase/templates/recovery.html` into "Reset password" (subject *Reset your Creator Desk password*).
6. **Project Settings → API Keys**: copy the **Project URL**, the **Publishable key** and a **Secret key** (keep the secret one private - it goes only in Vercel).

## 4. Email - Resend (15 min + DNS time)

Supabase's built-in email only sends a handful an hour - not enough for a launch.

1. [resend.com](https://resend.com) → add your domain → add the DNS records it shows → wait for "Verified".
2. Create an API key.
3. Supabase → **Authentication → Emails → SMTP Settings** → enable custom SMTP:
   host `smtp.resend.com`, port `465`, username `resend`, password = the Resend API key,
   sender e.g. `hello@yourdomain` with name `Creator Desk`.

## 5. Stripe - payments (30 min, do it in **Test mode** first)

1. **Product catalogue → Add product**: "Creator Desk", **recurring monthly price in GBP** (whatever you decide - £9.99? £14.99?). Copy the price ID (`price_...`). The site shows whatever price this is.
2. **Settings → Billing → Subscriptions and emails**: turn on **reminder emails before free trials end**, plus receipts and failed-payment emails. (Card networks expect a reminder before a free trial turns into a paid subscription, and the FAQ promises one.)
3. **Settings → Billing → Customer portal**: allow updating payment methods, viewing invoices, and **cancelling subscriptions (at the end of the billing period)**. Add your terms and privacy links (`APP/hub/terms`, `APP/hub/privacy`). Save.
4. **Developers → Webhooks → Add endpoint**: `APP/api/hub/stripe/webhook`, with events
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`.
   Copy the **signing secret** (`whsec_...`).
5. **Developers → API keys**: copy the **Secret key** (`sk_test_...` for now).
6. Optional: **Product catalogue → Coupons → Promotion codes** for creator or affiliate codes - checkout already accepts them.

## 6. Vercel - environment variables (10 min)

**Vercel → dan-ugc-portfolio → Settings → Environment Variables** (Production, and Preview if you want previews to work):

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase Publishable key |
| `SUPABASE_SECRET_KEY` | Supabase Secret key |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_PRICE_ID` | `price_...` from step 5.1 |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` from step 5.4 |
| `HUB_OWNER_EMAILS` | your email - you never pay, get the admin page and use your own TrendTrack key |
| `TRENDTRACK_API_KEY` | your TrendTrack key (only owners use it) |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | where creators can reach you (shown on legal pages) |
| `NEXT_PUBLIC_LEGAL_NAME` | who runs Creator Desk, e.g. your business name |
| `HUB_APP_HOST` | optional, see step 2 |

Optional: `FOUNDER_SLOTS` (default 50), `FOUNDER_TRIAL_DAYS` (90), `TRIAL_DAYS` (7),
`NEXT_PUBLIC_TRENDTRACK_URL` (e.g. a TrendTrack affiliate link), `HUB_ALLOWED_EMAILS`
(comma-separated - makes it invite-only; leave unset for open sign-up). **Delete
`HUB_PASSWORD`** if it's set. Leave `TRENDTRACK_SHARED` unset (see step 9).

Then **Deployments → ⋯ → Redeploy**, and turn on **Analytics** in the project (page views only, no cookies).

## 7. Test it yourself (20 min, still in Stripe test mode)

1. In a private window, open `APP/hub` → you should see the landing page with the founding offer.
2. Sign up with a second email address of yours → card `4242 4242 4242 4242`, any future date, any CVC → you land on "welcome to your desk" with **Founder trial · 90 days left**.
3. Account → **Manage billing** → cancel → back in the app, the plan says you won't be charged.
4. Stripe → Webhooks → your endpoint should show green deliveries.
5. Sign in with your owner email → no card asked, and `/hub/admin` shows the numbers.
6. Delete the test account from Account → Delete account.

## 8. Go live

1. Stripe: switch to **Live mode**, recreate the product/price, webhook and customer-portal settings there (they don't copy over), and complete Stripe's business verification.
2. Update `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` and `STRIPE_WEBHOOK_SECRET` in Vercel to the live ones → Redeploy.
3. Do step 7.2 once with a real card and refund yourself in Stripe, or just check the first real sign-up in `/hub/admin`.
4. Share `APP/hub` 🎉 - the share preview image is built in.

## 9. TrendTrack

TrendTrack's terms only allow personal or internal use of their data, so at launch
**each creator connects their own TrendTrack key** (Account → TrendTrack). Creators
without TrendTrack can use everything else and explore ads with sample data.
Email TrendTrack about a partnership: if they agree in writing to you serving
their data to your members, set `TRENDTRACK_SHARED=true` and every member gets
live ad data through your key (each call is logged per member in `hub_usage`).

## 10. Legal

`/hub/privacy` and `/hub/terms` are written for a UK business and fill in your name
and email from the env vars above. They're a solid starting point, not legal
advice - have someone check them, in particular how UK consumer rules on
subscriptions and free trials apply to you.

---

## Launch day

- **`/hub/admin`** (owners only): accounts, trials, paying members, failed payments, founder spots left, newest sign-ups and feedback.
- **Feedback** from the in-app button also lands in Supabase → Table editor → `hub_feedback`.
- **Money**: Stripe dashboard. **Errors**: Vercel → Logs.

## How the trial works

- Card required at sign-up; the trial starts straight away. First `FOUNDER_SLOTS` (50) creators to add a card get `FOUNDER_TRIAL_DAYS` (90); after that `TRIAL_DAYS` (7). The landing page counts the spots down.
- No second free trial: anyone who's subscribed before goes straight to paid.
- Cancel any time in the Stripe portal; access continues to the end of what's paid. A failed payment keeps the desk open (with a warning) while Stripe retries.
- Owners (`HUB_OWNER_EMAILS`) never need a subscription.
