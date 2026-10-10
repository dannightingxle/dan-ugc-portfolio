-- Trial reels autoposter (app/api/instagram/trial-reels, setup in INSTAGRAM.md).
-- Both tables are server-only: row-level security is on with no policies, so
-- only the secret key can read or write them.

-- The Instagram access token, refreshed weekly so it never reaches its 60-day
-- expiry. Seeded from INSTAGRAM_ACCESS_TOKEN; pasting a new token into Vercel
-- replaces it (seed_hash tells the two apart).
create table public.ig_token (
  id boolean primary key default true check (id),
  access_token text not null,
  seed_hash text not null,
  refreshed_at timestamptz not null default now(),
  expires_at timestamptz
);
alter table public.ig_token enable row level security;

-- One row per repost attempt. Decides which reel goes next (least recently
-- reposted first) and keeps the reposts themselves out of the pool.
create table public.ig_trial_posts (
  id bigint generated always as identity primary key,
  source_media_id text not null,
  source_permalink text,
  container_id text,
  media_id text,
  -- published | failed | timeout
  status text not null,
  error text,
  -- cron (the daily run) or manual (a test from the command line)
  trigger text not null default 'cron',
  created_at timestamptz not null default now()
);
create index ig_trial_posts_created_at on public.ig_trial_posts (created_at desc);
alter table public.ig_trial_posts enable row level security;
