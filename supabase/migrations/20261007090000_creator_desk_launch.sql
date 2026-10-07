-- Creator Desk launch: billing (mirrored from Stripe), creators' own TrendTrack
-- keys, in-app feedback, and deleting your own account.

-- Billing state, mirrored from Stripe by the server (webhooks + checkout return).
-- Only the server (service role) writes it; a creator can read their own row.
create table public.hub_billing (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text,
  status text,
  price_id text,
  trial_end timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  -- One of the first sign-ups who got the long founder trial.
  founder boolean not null default false,
  -- Has ever started a subscription, so cancelling and re-joining doesn't get a second trial.
  had_subscription boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.hub_billing enable row level security;
create policy "Read own billing" on public.hub_billing for select to authenticated
  using ((select auth.uid()) = user_id);

-- How many founder trials have been taken. Callable by anyone so the landing
-- page can show "N spots left"; it reveals a number and nothing else.
create function public.hub_founder_spots_taken() returns integer
  language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from public.hub_billing where founder
$$;
revoke all on function public.hub_founder_spots_taken() from public;
grant execute on function public.hub_founder_spots_taken() to anon, authenticated;

-- A creator's own TrendTrack API key. Row-level security with no policies:
-- only the server can read or write it, so the key never reaches a browser.
create table public.hub_trendtrack_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  api_key text not null,
  workspace text,
  created_at timestamptz not null default now()
);
alter table public.hub_trendtrack_keys enable row level security;

-- Feedback sent from inside the app. Creators can send, not read.
create table public.hub_feedback (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  email text,
  message text not null check (char_length(message) between 1 and 5000),
  page text,
  created_at timestamptz not null default now()
);
alter table public.hub_feedback enable row level security;
create policy "Send feedback" on public.hub_feedback for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Which key paid for a TrendTrack call: the creator's own, the owner's, or shared.
alter table public.hub_usage add column via text;

-- Delete your own account. Everything of yours cascades with it.
create function public.hub_delete_account() returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.hub_delete_account() from public, anon;
grant execute on function public.hub_delete_account() to authenticated;
