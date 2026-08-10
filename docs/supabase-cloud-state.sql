create table if not exists public.app_users (
  id bigserial primary key,
  google_sub text not null unique,
  email text not null,
  name text,
  picture text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.auth_sessions (
  token text primary key,
  user_id bigint not null references public.app_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists auth_sessions_user_id_idx
  on public.auth_sessions(user_id);

create index if not exists auth_sessions_expires_at_idx
  on public.auth_sessions(expires_at);

create table if not exists public.app_state (
  user_id bigint primary key references public.app_users(id) on delete cascade,
  version integer not null default 0,
  updated_at timestamptz not null default now(),
  document_json jsonb not null default '{"version":0,"updatedAt":"","tables":{}}'::jsonb
);

create table if not exists public.ai_note_cache (
  state_hash text primary key,
  note text not null,
  state_summary_json jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.app_users enable row level security;
alter table public.auth_sessions enable row level security;
alter table public.app_state enable row level security;
alter table public.ai_note_cache enable row level security;

revoke all on table public.app_users from anon, authenticated;
revoke all on table public.auth_sessions from anon, authenticated;
revoke all on table public.app_state from anon, authenticated;
revoke all on table public.ai_note_cache from anon, authenticated;
