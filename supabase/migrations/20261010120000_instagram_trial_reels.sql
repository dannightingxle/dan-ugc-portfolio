-- Trial reels autoposter (scripts/trial-reels.mts, setup in INSTAGRAM.md).
-- Both tables are server-only: row-level security is on with no policies, so
-- only the secret key can read or write them.

-- The Instagram access token, refreshed weekly so it never reaches its 60-day
-- expiry. Seeded from INSTAGRAM_ACCESS_TOKEN; pasting a new token into GitHub
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
  -- published | failed
  status text not null,
  error text,
  -- How this copy was altered: speed, zoom, colour, trim, hidden caption position.
  variant jsonb,
  created_at timestamptz not null default now()
);
create index ig_trial_posts_created_at on public.ig_trial_posts (created_at desc);
alter table public.ig_trial_posts enable row level security;

-- Where each altered copy waits while Instagram downloads it. Public so
-- Instagram can fetch it; files have random names and are deleted straight
-- after posting.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trial-reels', 'trial-reels', true, 52428800, array['video/mp4'])
on conflict (id) do nothing;
