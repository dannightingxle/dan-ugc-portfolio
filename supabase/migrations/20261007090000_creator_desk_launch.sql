-- Creator Desk launch: billing (mirrored from Stripe), the paywall enforced in
-- the database, trial history, founder spots, creators' own TrendTrack keys
-- and in-app feedback.

-- ---------------------------------------------------------------------------
-- Billing state, mirrored from Stripe by the server (webhooks + checkout
-- return). Only the server (service role) writes it; a creator can read their
-- own row.
create table public.hub_billing (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text,
  status text,
  price_id text,
  trial_end timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  -- Got the long founder trial.
  founder boolean not null default false,
  -- Has ever started a subscription (no second free trial).
  had_subscription boolean not null default false,
  -- Free access you've given someone (tick it in the Table editor).
  comped boolean not null default false,
  -- An owner (HUB_OWNER_EMAILS with a confirmed email). Set and cleared by the server.
  owner boolean not null default false,
  -- Stripe live or test mode, so test sign-ups never count once you're live.
  livemode boolean,
  updated_at timestamptz not null default now()
);
alter table public.hub_billing enable row level security;
create policy "Read own billing" on public.hub_billing for select to authenticated
  using ((select auth.uid()) = user_id);

-- Whether the paywall applies, and in which Stripe mode. The production
-- deploy keeps this in step with its settings (previews never touch it).
create table public.hub_config (
  id boolean primary key default true check (id),
  enforce_billing boolean not null default false,
  -- Whether production uses Stripe live mode.
  live_mode boolean not null default false
);
insert into public.hub_config default values;
alter table public.hub_config enable row level security;

-- Who has had a free trial, kept even after an account is deleted so a trial
-- can't be claimed twice. Holds a keyed hash of the normalised email only.
-- Kept per Stripe mode, so test sign-ups never use up real trials or founder spots.
create table public.hub_trial_history (
  email_key text not null,
  livemode boolean not null default false,
  founder boolean not null default false,
  first_trial_at timestamptz not null default now(),
  primary key (email_key, livemode)
);
alter table public.hub_trial_history enable row level security;

-- Founder spots held while someone is in checkout (released when the
-- checkout expires), so a launch rush can't hand out more than the cap.
create table public.hub_founder_reservations (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email_key text not null,
  expires_at timestamptz not null
);
alter table public.hub_founder_reservations enable row level security;

-- Founder spots taken = founder trials started (in the Stripe mode production
-- uses) + spots held in checkout. Callable by anyone so the landing page can
-- show "N spots left".
create function public.hub_founder_spots_taken() returns integer
  language sql stable security definer set search_path = ''
as $$
  with mode as (select coalesce((select live_mode from public.hub_config limit 1), false) as live)
  select (
    (select count(*) from public.hub_trial_history h, mode where h.founder and h.livemode = mode.live)
    + (select count(*) from public.hub_founder_reservations r
       where r.expires_at > now()
         and not exists (select 1 from public.hub_trial_history h, mode where h.email_key = r.email_key and h.livemode = mode.live))
  )::integer
$$;
revoke all on function public.hub_founder_spots_taken() from public;
grant execute on function public.hub_founder_spots_taken() to anon, authenticated;

-- Hold a founder spot for someone about to check out. Serialised with a lock
-- so two people can't take the last spot. Server only.
create function public.hub_reserve_founder_spot(p_user uuid, p_email_key text, p_slots integer, p_minutes integer)
  returns boolean
  language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('hub_founder_spots'));
  if exists (
    select 1 from public.hub_trial_history h
    where h.email_key = p_email_key
      and h.livemode = coalesce((select live_mode from public.hub_config limit 1), false)
  ) then
    return false;
  end if;
  if exists (select 1 from public.hub_founder_reservations where user_id = p_user and expires_at > now()) then
    update public.hub_founder_reservations
      set expires_at = now() + make_interval(mins => p_minutes)
      where user_id = p_user;
    return true;
  end if;
  if public.hub_founder_spots_taken() >= p_slots then
    return false;
  end if;
  insert into public.hub_founder_reservations (user_id, email_key, expires_at)
    values (p_user, p_email_key, now() + make_interval(mins => p_minutes))
    on conflict (user_id) do update set email_key = excluded.email_key, expires_at = excluded.expires_at;
  return true;
end;
$$;
revoke all on function public.hub_reserve_founder_spot(uuid, text, integer, integer) from public, anon, authenticated;

-- Can the signed-in creator add or change data? (Reading, exporting and
-- deleting are always allowed.)
create function public.hub_has_access() returns boolean
  language sql stable security definer set search_path = ''
as $$
  select not coalesce((select enforce_billing from public.hub_config limit 1), false)
    or exists (
      select 1 from public.hub_billing b, public.hub_config c
      where b.user_id = auth.uid()
        and (
          b.comped
          or b.owner
          or (b.status in ('trialing', 'active', 'past_due') and b.livemode is not distinct from c.live_mode)
        )
    )
$$;
revoke all on function public.hub_has_access() from public, anon;
grant execute on function public.hub_has_access() to authenticated;

-- ---------------------------------------------------------------------------
-- The paywall, enforced in the database: without an active trial or
-- subscription you can still read, export and delete your data, but not add
-- or change it - even by calling the database directly.
drop policy "Own projects" on public.hub_projects;
create policy "Read own projects" on public.hub_projects for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Delete own projects" on public.hub_projects for delete to authenticated
  using ((select auth.uid()) = user_id);
create policy "Add projects with access" on public.hub_projects for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.hub_has_access()));
create policy "Edit projects with access" on public.hub_projects for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and (select public.hub_has_access()));

drop policy "Own starred ads" on public.hub_starred_ads;
create policy "Read own starred ads" on public.hub_starred_ads for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Delete own starred ads" on public.hub_starred_ads for delete to authenticated
  using ((select auth.uid()) = user_id);
create policy "Add starred ads with access" on public.hub_starred_ads for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.hub_has_access()));
create policy "Edit starred ads with access" on public.hub_starred_ads for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and (select public.hub_has_access()));

-- ---------------------------------------------------------------------------
-- TrendTrack usage is written by the server only (it's the basis for billing
-- shared-key usage), and records whose key paid for each call.
drop policy "Record own usage" on public.hub_usage;
alter table public.hub_usage add column via text;
alter table public.hub_usage add constraint hub_usage_rows_not_negative check (rows >= 0);

-- A creator's own TrendTrack API key. Row-level security with no policies:
-- only the server can read or write it, so the key never reaches a browser.
create table public.hub_trendtrack_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  api_key text not null,
  workspace text,
  created_at timestamptz not null default now()
);
alter table public.hub_trendtrack_keys enable row level security;

-- Feedback sent from inside the app. Creators can send, not read. Who sent it
-- is taken from their session, not from what the browser says.
create table public.hub_feedback (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  email text,
  message text not null check (char_length(message) between 1 and 5000),
  page text check (char_length(page) <= 300),
  created_at timestamptz not null default now()
);
alter table public.hub_feedback enable row level security;
create policy "Send feedback" on public.hub_feedback for insert to authenticated
  with check ((select auth.uid()) = user_id);

create function public.hub_feedback_sender() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  new.user_id := auth.uid();
  new.email := auth.jwt() ->> 'email';
  return new;
end;
$$;
revoke all on function public.hub_feedback_sender() from public, anon, authenticated;
create trigger hub_feedback_sender before insert on public.hub_feedback
  for each row execute function public.hub_feedback_sender();
