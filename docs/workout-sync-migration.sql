-- Run against the cloud database before deploying the updated backend.
begin;
alter table public.exercises add column if not exists split_day_key text;
alter table public.exercises add column if not exists equipment_id text;
alter table public.exercises add column if not exists is_timed boolean;
alter table public.exercises add column if not exists rest_sec double precision;
alter table public.exercises add column if not exists superset_group_id text;
alter table public.workout_sets add column if not exists rpe double precision;
alter table public.workout_sets add column if not exists duration_sec double precision;
create table if not exists public.schedule_overrides (
  user_id bigint not null references public.app_users(id) on delete cascade,
  id text not null,
  source_date date not null,
  target_date date,
  action text not null,
  reason text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);
alter table public.schedule_overrides enable row level security;
revoke all on table public.schedule_overrides from anon, authenticated;
commit;
