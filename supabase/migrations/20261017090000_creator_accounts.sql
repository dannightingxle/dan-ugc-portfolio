-- Accounts: a daily snapshot of each TikTok / Instagram account a creator
-- tracks (their personal accounts and each tech UGC job's account), from the
-- public stats Apify reads. One row per account per day, so follower and view
-- growth can be shown over time. Server-only: row-level security on, no policies.

create table public.hub_account_stats (
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('tiktok', 'instagram')),
  handle text not null,
  day date not null,
  followers integer,
  -- The latest posts that day: url, caption, views, likes, comments, shares, seconds, postedAt.
  posts jsonb not null default '[]'::jsonb,
  pulled_at timestamptz not null default now(),
  primary key (user_id, platform, handle, day)
);
alter table public.hub_account_stats enable row level security;
create index hub_account_stats_recent on public.hub_account_stats (user_id, day desc);
