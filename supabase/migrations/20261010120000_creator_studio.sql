-- Studio: a Claude workspace per job (brief, app notes, references, winners,
-- script bank, project instructions) and the weekly shoot sheets made from it.
-- Who sees Studio is set per feature (see hub_features below), so these tables are server-only: row-level security on,
-- no policies. The server reads and writes them after checking who's asking.

create table public.hub_workspaces (
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, project_id)
);
alter table public.hub_workspaces enable row level security;

create table public.hub_shoot_sheets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id text not null,
  title text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.hub_shoot_sheets enable row level security;
create index hub_shoot_sheets_project on public.hub_shoot_sheets (user_id, project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Rolling features out: each feature is seen by owners only, the beta group
-- (e.g. the mentorship group), or everyone. Set from /hub/admin. Server-only.
create table public.hub_features (
  key text primary key,
  audience text not null default 'owner' check (audience in ('owner', 'beta', 'everyone')),
  updated_at timestamptz not null default now()
);
alter table public.hub_features enable row level security;

-- The beta group, by email (lower case), so people can be added before they sign up.
create table public.hub_beta_members (
  email text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);
alter table public.hub_beta_members enable row level security;
