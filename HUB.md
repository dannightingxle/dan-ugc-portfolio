# Creator Desk (developer notes)

Creator Desk is a paid web app for UGC creators that lives under `/hub` in this
repo (optionally on its own domain - see `HUB_APP_HOST`). **To set it up or
launch it, follow [LAUNCH.md](LAUNCH.md).** This file explains how it's built.

## Pages

| Path | What it is |
| --- | --- |
| `/hub/welcome` | Public landing page with pricing, founding offer counter and share image. Signed-out visitors to `/hub` land here. |
| `/hub/login` | Sign in / create account / forgot password (`?mode=signup` opens sign-up). |
| `/hub/billing` | Paywall: add a card to start the trial (or restart a subscription). New sign-ups arrive with `?start=1` and go straight to Stripe Checkout. |
| `/hub` | Home: earnings, coming up, tracked ads. `?welcome=1` shows the first-steps banner after checkout. |
| `/hub/projects`, `/hub/projects/[id]` | Deal board and full project page (payment, contact, brief, deliverables, links, notes, script). |
| `/hub/find`, `/hub/ads/[id]` | Find and track ads via TrendTrack; sample data for creators without it. |
| `/hub/account` | Plan & billing (Stripe portal), profile, TrendTrack connection, password, CSV/JSON export, feedback, delete account. |
| `/hub/admin` | Owners only: sign-ups, trials, paying, founder spots, feedback, and who sees which feature. |
| `/hub/projects/[id]/studio` | The job's Studio (staged feature - see Rollout). |
| `/hub/studio/sheets/[id]` | A shoot sheet as its own page, for the phone on set. |
| `/hub/privacy`, `/hub/terms` | Legal pages. |
| `/hub/scripts` | "Coming soon". |

## How it fits together

- **Modes.** No env vars: single-user, data in the browser, demo ad data. Supabase vars: accounts. Plus Stripe vars and `SUPABASE_SECRET_KEY`: paid accounts with trials. Every feature checks which mode it's in, so partial setups degrade gracefully.
- **Auth** - Supabase email + password (`app/hub/_lib/supabase/`). `proxy.ts` refreshes sessions and sends signed-out visitors to the landing page or login.
- **Data** - `app/hub/_lib/store.ts`: the browser talks to Supabase directly, protected by row-level security (each creator only sees their own rows). Edits save in the background, debounced while typing and flushed when the page is hidden.
- **Billing** - `app/hub/_lib/billing/stripe.ts`. Checkout (`/api/hub/billing/checkout`) takes a card and starts the trial; the webhook (`/api/hub/stripe/webhook`) and the checkout return (`/hub/billing/success`) both re-read the subscription from Stripe into `hub_billing`, which creators can read but only the server can write. Access = a `trialing`, `active` or `past_due` subscription in the Stripe mode this deploy uses (test-mode sign-ups stop counting once you're live), `comped`, or an owner email (`_lib/owners.ts` - only honoured while Supabase requires email confirmation). Pages are gated by `AccessGate` (`account-provider.tsx`); API routes by `apiUser()` (`_lib/api-auth.ts`); writes by row-level security via `hub_has_access()`, which reads `hub_config` (paywall on/off and Stripe mode, kept in step by the production deploy). Trial history (`hub_trial_history`) is a keyed hash of the email (`HUB_HASH_SECRET`), per Stripe mode.
- **TrendTrack** - `_lib/trendtrack-access.ts` decides whose key a request uses: the creator's own (stored in `hub_trendtrack_keys`, which only the server can read), the owner's, or a shared key once TrendTrack allows it (`TRENDTRACK_SHARED=true`). `_lib/trendtrack.ts` calls the API with that key; responses are cached per key. Live calls are logged in `hub_usage`.
- **Rollout** - features that aren't for everyone yet are listed in `_lib/features-list.ts`. Each one is seen by owners only, the beta group (`hub_beta_members`, e.g. the mentorship group) or everyone, set on `/hub/admin` (`hub_features`; new features default to owners). Check with `canUse(user, key)` on the server and `useFeature(key)` in pages. So there's one app and one deploy: the public sees the finished basics, owners see everything in progress.
- **Studio** (a staged feature) - `app/hub/_lib/studio/`. One Claude workspace per job, replacing a Claude Project per job: project instructions plus brief, app-notes, references, winners and script-bank files (`hub_workspaces`, server-only). Three Claude actions, each a single structured-output call to `claude-opus-5-5` with the method text and the job's workspace as cached system blocks (`claude.ts`, `prompts.ts`): **set up** a job from pasted material, PDFs and public links (web fetch); **make this week's shoot sheet**, which fills Dan's own template (`shoot-sheet-template.ts`, generated from his HTML - only the WEEK DATA block, header text and tick key are slots) and prepends the batch's hooks to the script bank; and the **Friday review**, which rewrites winners. Shoot sheets live in `hub_shoot_sheets`. Needs `ANTHROPIC_API_KEY`. Projects also gained tech UGC stages, "waiting on" and chase dates (shown to owners).
- **Personal brand plan** (staged feature `brand`) - `/hub/studio/brand`, `_lib/studio/brand*.ts`. Your accounts and the creators you track (stored as the `personal-brand` workspace row). `apify.ts` pulls each account's latest 20 public posts via Apify (`clockworks/tiktok-profile-scraper`, `apify/instagram-reel-scraper`; needs `APIFY_TOKEN`); `summarise()` scores each post against that account's median. Claude turns that into the week's plan and a shoot sheet. The **ideas inbox** (`/api/hub/studio/brand/ideas`, the Ideas tab) looks at the tracked creators' posts that beat their median and the latest from "content idea accounts", plus the sounds they share (`ideaCandidates()`, `soundsInUse()`); Claude watches the best six as frames (`videos.ts`) and writes idea cards (`SYSTEM_IDEAS`), marking the no-filming ones (sound + clips you have + text). Cards are saved, picked for this week or turned down with a reason; the next scan reads that feedback, and the weekly plan uses picked, saved and new ideas first and marks the ones it used as planned. Posts already looked at are remembered in `seen`. With "Plan my week automatically" or "Find ideas twice a week" on, `vercel.json` crons call `/api/hub/cron/weekly` (stats at 05:00 UTC on Mondays and Thursdays, ideas at 05:15, the plan at 05:30 on Mondays; needs `CRON_SECRET`).
- **Ideas into drafts** - "Make it on my Mac" on an idea card makes an edit card for the personal brand (the brand page has its own Edits tab; `editableProject()` lets edit cards use `BRAND_ID`). A brief with a `LIBRARY SEARCH:` line needs no picked clips: the Mac helper (0.2.0+) searches Apple Photos with its own search (`search for` via osascript, exported as originals into ~/Movies/Creator Desk/B-roll) and an index of every video on the external drives (`~/.creator-desk/library.txt`), adds what it finds to the card and gives Claude Code the list. The sound is left out of the draft, to be added in the app when posting. The helper updates itself between edits; older ones get an update notice.
- **Trial reels** (Trial reels tab, `_lib/studio/trials.ts`, `/api/hub/studio/brand/trials`) - Claude writes 5 versions of a reel with different openings (`SYSTEM_TRIALS`), from one of your posts (watched as frames), a finished personal-brand edit card ("Make 5 trial versions", which starts the Mac from that CapCut draft via a `CapCut draft to start from:` line) or pasted text. The Mac makes a draft per version (`TRIAL VERSIONS:` cards). You enter each version's views; the winner is written into the winners file, which plans and idea scans read.
- **Studio home** - `/hub/studio` lists the personal brand and tech jobs; for people with Studio the nav's "Scripts" tab becomes "Studio".
- **Database** - `supabase/migrations/` (apply in order). `supabase/config.toml` and `supabase/templates/` are for local development and the email templates.

## Running it locally with accounts and billing

```sh
npx supabase start            # local Postgres, auth and a test inbox (needs Docker)
# then set NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY / SUPABASE_SECRET_KEY from `npx supabase status`,
# and Stripe test keys, then:
npm run build && npm start
```

Production (or any server outside Vercel) keeps `hub_config` in step with its env; Vercel previews never touch it.
`STRIPE_API_HOST` points the Stripe client at a local mock - it's only for automated tests; never set it in Vercel.

## Style

The "Sky" look - cool white, slate text, blue accent, Plus Jakarta Sans. Colours, font
and corner radii all live in one block in `app/hub/hub.css`; product name and copy in
`app/hub/_lib/brand.ts`.
