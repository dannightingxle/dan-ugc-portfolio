# Trial reels autoposter

Every morning at 06:00 UTC (7am UK summer time, 6am in winter) the site reposts
**5 of your existing reels as trial reels**. Trial reels are only shown to people
who don't follow you, so reposting doesn't fill your followers' feeds.

- It cycles through **all** your reels: never-reposted first (most liked first),
  then whichever was reposted longest ago. Once every reel has had a go it starts
  again, so the same reels repeat.
- The original caption is reused.
- By default reposts **stay as trials** (`MANUAL`). If one takes off you can share
  it to your followers from the Instagram app. Set `TRIAL_REELS_GRADUATION=SS_PERFORMANCE`
  to let Instagram share winners to your followers automatically. Bear in mind
  those are repeats of posts your followers have already seen.
- Reels with licensed music are skipped, because Instagram doesn't hand the video
  file over through the API.

Code: `app/api/instagram/trial-reels/route.ts` (the daily run), `app/api/instagram/_lib/instagram.ts`
(Instagram API), `vercel.json` (schedule), `supabase/migrations/20261010120000_instagram_trial_reels.sql`.

Setup takes about **30 minutes**. It needs Supabase (step 3 of [LAUNCH.md](LAUNCH.md)) in Vercel.

## 1. Check you can post trial reels (2 min)

Your Instagram needs to be a **Creator or Business** account (Settings → Account type and tools).
Start posting a reel in the app: if you see a **Trial** toggle, you're good. Not every
account has it yet, and Instagram doesn't say what the follower threshold is.

## 2. Meta app and access token (15 min)

1. [developers.facebook.com](https://developers.facebook.com/apps) → **Create app**.
   - Use case: **Manage messaging & content on Instagram**.
   - Business portfolio: skip / "I don't want to connect a business portfolio yet".
2. In the app: **Instagram → API setup with Instagram login**.
3. Under **Generate access tokens** click **Add account** and log in as your Instagram account.
   Permissions to allow: `instagram_business_basic` and `instagram_business_content_publish`.
4. Click **Generate token** next to your account and copy it. This is a 60-day token. The site
   swaps in a fresh one every week, so you only do this once. If the posts ever stop with
   a token error, generate a new one and paste it in again.

You don't need Meta's app review: the app stays in development mode and only posts to your own account.

## 3. Database (2 min)

Supabase → **SQL Editor → New query** → paste all of
`supabase/migrations/20261010120000_instagram_trial_reels.sql` → **Run**.

## 4. Vercel settings (5 min)

**Vercel → dan-ugc-portfolio → Settings → Environment Variables** (Production):

| Name | Value |
| --- | --- |
| `INSTAGRAM_ACCESS_TOKEN` | the token from step 2 |
| `CRON_SECRET` | a long random string, e.g. from `openssl rand -hex 32`. Vercel sends it with each cron run, and you need it to test by hand. |
| `TRIAL_REELS_PER_DAY` | optional, default `5`, max `25`. `0` pauses it. |
| `TRIAL_REELS_GRADUATION` | optional, `MANUAL` (default) or `SS_PERFORMANCE` |

Then **Deployments → ⋯ → Redeploy**. The cron appears under **Settings → Cron Jobs**.

## 5. Test it (5 min)

See what it would post, without posting anything:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" "https://www.dannightingxle.com/api/instagram/trial-reels?dry=1"
```

Post a single trial reel now, to check the whole flow:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" "https://www.dannightingxle.com/api/instagram/trial-reels?count=1"
```

It takes up to a minute while Instagram processes the video. You should then see the reel under
**Professional dashboard → Trial reels**. Test runs don't stop the morning run.

Every attempt is logged in Supabase → **Table editor → `ig_trial_posts`**, with the error if one failed.

## Good to know

- Instagram allows 50 posts a day through the API. The run checks how much of that is left before posting.
- If one reel keeps failing (for example Instagram rejects its format), it just goes to the back of the queue like the others.
- Watch the views for the first week. Instagram may give exact repeats less reach over time.
  If that happens, lower `TRIAL_REELS_PER_DAY` or space out the repeats.
