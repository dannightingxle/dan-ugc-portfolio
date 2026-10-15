-- Edits: a card per video to edit, run on the creator's own Mac by the
-- Creator Desk Helper (which drives their Claude Code + CapCut). The web app
-- queues work here; the helper polls for it with a device token and reports
-- progress back. Server-only tables: row-level security on, no policies.

-- A Mac that's been connected. Only a hash of its token is kept.
create table public.hub_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'Mac',
  token_hash text unique,
  pair_code_hash text unique,
  pair_expires_at timestamptz,
  info jsonb not null default '{}'::jsonb,
  last_seen timestamptz,
  created_at timestamptz not null default now()
);
alter table public.hub_devices enable row level security;
create index hub_devices_user on public.hub_devices (user_id);

-- Recent video files the helper can see on that Mac (name, path, length, small thumbnail).
create table public.hub_device_files (
  device_id uuid not null references public.hub_devices (id) on delete cascade,
  path text not null,
  name text not null,
  folder text not null default '',
  size bigint,
  modified_at timestamptz,
  duration real,
  thumb text,
  primary key (device_id, path)
);
alter table public.hub_device_files enable row level security;

-- One card per video (video_code 'ALL' = a whole shoot sheet edited in one go): its brief,
-- the clips picked for it, and where the edit is up to.
create table public.hub_edits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id text not null,
  sheet_id uuid,
  video_code text not null default '',
  title text not null default '',
  brief text not null default '',
  status text not null default 'todo' check (status in ('todo', 'queued', 'editing', 'needs_you', 'ready', 'done', 'failed')),
  files jsonb not null default '[]'::jsonb,
  device_id uuid references public.hub_devices (id) on delete set null,
  pick_requested_at timestamptz,
  pick_mode text not null default 'files' check (pick_mode in ('files', 'folder')),
  cancel_requested boolean not null default false,
  session_id text,
  draft_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.hub_edits enable row level security;
create index hub_edits_project on public.hub_edits (user_id, project_id, created_at);
-- Pasted cards have no sheet; NULLs never clash, so they can repeat.
create unique index hub_edits_sheet_video on public.hub_edits (user_id, sheet_id, video_code);

-- The running conversation for an edit: what Claude said and did, and what the creator replied.
-- A reply is 'delivered' once the helper has passed it to Claude.
create table public.hub_edit_events (
  id bigint generated always as identity primary key,
  edit_id uuid not null references public.hub_edits (id) on delete cascade,
  kind text not null check (kind in ('status', 'assistant', 'tool', 'user', 'error', 'done')),
  text text not null,
  delivered boolean not null default true,
  at timestamptz not null default now()
);
alter table public.hub_edit_events enable row level security;
create index hub_edit_events_edit on public.hub_edit_events (edit_id, id);
