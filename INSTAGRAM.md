# Trial reels autoposter

Every morning at about 7am UK time (6am in winter), a GitHub Action reposts
**5 of your existing reels as trial reels**. Trial reels are only shown to people
who don't follow you, so your followers' feeds stay clean.

Each repost is a **slightly different copy** of the original, freshly randomised every time:

| Change | Amount |
| --- | --- |
| Speed | 1.02x - 1.06x (audio too) |
| Zoom and position | 2-5% zoom, nudged off-centre |
| Colour | brightness ±2%, saturation -3% to +5% |
| Start | 0 - 0.3s trimmed off |
| Hidden caption | the post's caption burned in tiny and ~85% transparent, somewhere random |
| File | re-encoded at 1080x1920, 30fps, metadata stripped |

So the same reel can go out again and again. Never-reposted reels go first (most liked first), then
whichever was reposted longest ago, so the whole catalogue cycles round. If you have fewer
reels than posts per day, a reel goes out more than once that day, as differently altered copies.
Each post reuses the original caption.

By default reposts **stay as trials** (`MANUAL`): if one takes off, you can share it to your
followers from the Instagram app. Set `TRIAL_REELS_GRADUATION` to `SS_PERFORMANCE` to let
Instagram share winners to your followers automatically. Bear in mind those are repeats
your followers may have seen.

**Reels with licensed music are skipped.** Instagram doesn't hand those video files out
through the API (and business accounts can't post licensed music through it anyway).
Reels with original audio or sounds you made are fine.

Code: `scripts/trial-reels.mts`, `.github/workflows/trial-reels.yml`,
`supabase/migrations/20261010120000_instagram_trial_reels.sql`.

Setup takes about **30 minutes** and needs the Supabase project from step 3 of [LAUNCH.md](LAUNCH.md).

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
4. Click **Generate token** next to your account and copy it. This is a 60-day token. The script
   swaps in a fresh one every week, so you only do this once. If posts ever stop with a
   token error, generate a new one and paste it in again.

You don't need Meta's app review: the app stays in development mode and only posts to your own account.

## 3. Database (2 min)

Supabase → **SQL Editor → New query** → paste all of
`supabase/migrations/20261010120000_instagram_trial_reels.sql` → **Run**.
This adds the log, the token store and a `trial-reels` storage bucket. Each altered video
sits there for a minute while Instagram downloads it, then gets deleted.

## 4. GitHub settings (5 min)

**GitHub → dan-ugc-portfolio → Settings → Secrets and variables → Actions**

*Secrets* tab → **New repository secret**, three times:

| Name | Value |
| --- | --- |
| `INSTAGRAM_ACCESS_TOKEN` | the token from step 2 |
| `SUPABASE_URL` | Supabase → Project Settings → API Keys → Project URL |
| `SUPABASE_SECRET_KEY` | a Supabase **Secret key** (same place) |

*Variables* tab (optional):

| Name | Value |
| --- | --- |
| `TRIAL_REELS_PER_DAY` | default `5`, max `25`. `0` pauses it. |
| `TRIAL_REELS_GRADUATION` | `MANUAL` (default) or `SS_PERFORMANCE` |

## 5. Test it (5 min)

**GitHub → Actions → Trial reels → Run workflow**:

1. Tick **Only list what would be posted** → Run. Open the run to see which reels are in the
   rotation and which would go next.
2. Run it again with **How many to post now** = `1`. Rendering and Instagram's processing take a
   few minutes. Then check **Professional dashboard → Trial reels** in the app.

After that it runs by itself every morning. **If a run fails, GitHub emails you**: open the run to
see why. Every attempt (and exactly how that copy was altered) is logged in Supabase →
**Table editor → `ig_trial_posts`**.

## Good to know

- Instagram allows 50 posts a day through the API. The script checks how much is left before posting.
- Each video takes about a minute to render, so 5 a day is roughly 10 minutes of GitHub Actions
  time. That's well inside the free allowance.
- GitHub pauses scheduled workflows in public repos after 60 days without a commit. If that
  happens, it emails you and you can switch it back on under Actions.
- The edits make each copy a different file with different pixels, but there's no guarantee
  Instagram won't recognise it as the same video. Watch the views on repeats for the first
  couple of weeks before turning the volume up.
