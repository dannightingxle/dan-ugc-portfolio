-- Creator Hub: each creator's own projects, starred ads and TrendTrack usage.
-- Row-level security means a signed-in user can only ever see or change their
-- own rows, even though the browser talks to the database directly.

-- Projects. The whole project (brief, payment, contact…) lives in `data`, so new
-- fields don't need a migration.
create table public.hub_projects (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Ads the creator has starred, with the latest numbers we've seen.
create table public.hub_starred_ads (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ad_id text not null,
  data jsonb not null,
  starred_at timestamptz not null default now(),
  primary key (user_id, ad_id)
);

-- One row per live TrendTrack call, for billing each creator for their usage.
create table public.hub_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null,
  rows integer not null,
  at timestamptz not null default now()
);
create index hub_usage_user_at on public.hub_usage (user_id, at);

alter table public.hub_projects enable row level security;
alter table public.hub_starred_ads enable row level security;
alter table public.hub_usage enable row level security;

create policy "Own projects" on public.hub_projects for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Own starred ads" on public.hub_starred_ads for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Creators can see their usage and the server records it as them, but nobody can
-- edit or delete usage rows from the browser.
create policy "Read own usage" on public.hub_usage for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Record own usage" on public.hub_usage for insert to authenticated
  with check ((select auth.uid()) = user_id);
