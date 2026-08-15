-- Per-user cloud schema. Run this whole file in the Supabase SQL editor
-- before deploying the API. Safe to re-run.
--
-- app_state is rewritten after each merge as a full snapshot backup.

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

-- Whole-document backup. Kept until row-level sync (Phase 2) is proven.
create table if not exists public.app_state (
  user_id bigint primary key references public.app_users(id) on delete cascade,
  version integer not null default 0,
  updated_at timestamptz not null default now(),
  document_json jsonb not null default '{"version":0,"updatedAt":"","tables":{}}'::jsonb
);

create table if not exists public.ai_note_cache (
  user_id bigint not null references public.app_users(id) on delete cascade,
  state_hash text not null,
  note text not null,
  state_summary_json jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, state_hash)
);

alter table public.ai_note_cache
  add column if not exists user_id bigint references public.app_users(id) on delete cascade;

delete from public.ai_note_cache where user_id is null;

alter table public.ai_note_cache drop constraint if exists ai_note_cache_pkey;

create unique index if not exists ai_note_cache_user_hash_idx
  on public.ai_note_cache(user_id, state_hash);

create table if not exists public.schema_migrations (
  id text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists public.sync_meta (
  user_id bigint primary key references public.app_users(id) on delete cascade,
  version integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id bigint primary key references public.app_users(id) on delete cascade,
  name text,
  height_cm double precision,
  birth_year integer,
  start_weight_kg double precision,
  goal_weight_kg double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.settings (
  user_id bigint primary key references public.app_users(id) on delete cascade,
  timezone text not null default 'Asia/Kolkata',
  plan_start_date date,
  onboarding_completed boolean not null default false,
  calorie_floor integer,
  target_loss_per_week_min double precision,
  target_loss_per_week_max double precision,
  fast_loss_per_week_threshold double precision,
  plateau_loss_per_week_threshold double precision,
  plateau_weeks_before_cut integer,
  max_calorie_cuts_per_phase integer,
  phase_hold_days integer,
  min_readings_per_window integer,
  good_compliance_pct double precision,
  manual_phase_override_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.phases (
  user_id bigint not null references public.app_users(id) on delete cascade,
  id text not null,
  sort_order integer not null,
  name text not null,
  start_weight_kg double precision not null,
  target_weight_kg double precision not null,
  target_waist_cm double precision,
  calories integer not null,
  protein_g double precision not null,
  steps integer not null,
  sleep_hours double precision not null,
  meals_per_day integer not null,
  weekly_run_km_target double precision,
  schedule jsonb not null default '[]'::jsonb,
  started_on date,
  ended_on date,
  calorie_cuts_applied integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

create index if not exists phases_user_order_idx
  on public.phases(user_id, sort_order);

create table if not exists public.goal_revisions (
  id bigserial primary key,
  user_id bigint not null references public.app_users(id) on delete cascade,
  phase_id text not null,
  effective_date date not null,
  calories integer,
  protein_g double precision,
  steps integer,
  sleep_hours double precision,
  meals_per_day integer,
  weekly_run_km_target double precision,
  reason text not null default 'migrated_from_phase',
  created_at timestamptz not null default now(),
  unique (user_id, phase_id, effective_date),
  foreign key (user_id, phase_id) references public.phases(user_id, id) on delete cascade
);

create index if not exists goal_revisions_phase_date_idx
  on public.goal_revisions(user_id, phase_id, effective_date);

create table if not exists public.daily_logs (
  user_id bigint not null references public.app_users(id) on delete cascade,
  local_date date not null,
  weight_kg double precision,
  calories double precision,
  protein_g double precision,
  carbs_g double precision,
  fat_g double precision,
  fiber_g double precision,
  sugar_g double precision,
  sat_fat_g double precision,
  micros jsonb,
  water_ml double precision,
  sodium_mg double precision,
  alcohol_units double precision,
  caffeine_mg double precision,
  food_complete boolean,
  steps integer,
  run_km double precision,
  gym_done boolean,
  meals_on_plan integer,
  sleep_hours double precision,
  sleep_quality integer,
  sleep_bedtime text,
  sleep_wake_time text,
  night_awakenings integer,
  energy integer,
  hunger integer,
  soreness integer,
  stress integer,
  training_minutes_available integer,
  training_constraints text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, local_date)
);

create table if not exists public.meals (
  user_id bigint not null references public.app_users(id) on delete cascade,
  id text not null,
  local_date date not null,
  slot text not null,
  name text not null,
  time text,
  quantity double precision,
  unit text,
  calories double precision,
  protein_g double precision,
  carbs_g double precision,
  fat_g double precision,
  fiber_g double precision,
  sugar_g double precision,
  sat_fat_g double precision,
  micros jsonb,
  notes text,
  source text not null default 'manual',
  group_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

create index if not exists meals_user_date_idx
  on public.meals(user_id, local_date);

create index if not exists meals_user_group_idx
  on public.meals(user_id, group_id);

create table if not exists public.saved_foods (
  user_id bigint not null references public.app_users(id) on delete cascade,
  id text not null,
  name text not null,
  default_slot text,
  quantity double precision,
  unit text,
  calories double precision,
  protein_g double precision,
  carbs_g double precision,
  fat_g double precision,
  fiber_g double precision,
  sugar_g double precision,
  sat_fat_g double precision,
  micros jsonb,
  use_count integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

create table if not exists public.measurements (
  user_id bigint not null references public.app_users(id) on delete cascade,
  local_date date not null,
  waist_cm double precision,
  chest_cm double precision,
  hips_cm double precision,
  thigh_cm double precision,
  arm_cm double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, local_date)
);

create table if not exists public.weekly_check_ins (
  user_id bigint not null references public.app_users(id) on delete cascade,
  id text not null,
  week_start date not null,
  win text,
  friction text,
  intent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

create index if not exists weekly_check_ins_user_week_idx
  on public.weekly_check_ins(user_id, week_start);

create table if not exists public.exercises (
  user_id bigint not null references public.app_users(id) on delete cascade,
  id text not null,
  name text not null,
  session_type text not null,
  rep_range_min integer not null,
  rep_range_max integer not null,
  target_sets integer not null,
  target_rir integer not null,
  load_increment_kg double precision not null,
  sort_order integer not null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

create table if not exists public.workouts (
  user_id bigint not null references public.app_users(id) on delete cascade,
  id text not null,
  local_date date not null,
  session_type text not null,
  started_at timestamptz,
  finished_at timestamptz,
  notes text,
  prescription jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

create index if not exists workouts_user_date_idx
  on public.workouts(user_id, local_date);

create table if not exists public.workout_sets (
  user_id bigint not null references public.app_users(id) on delete cascade,
  id text not null,
  workout_id text not null,
  exercise_id text not null,
  set_number integer not null,
  weight_kg double precision,
  reps integer,
  rir double precision,
  is_warmup boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id),
  foreign key (user_id, workout_id) references public.workouts(user_id, id) on delete cascade
);

create table if not exists public.runs (
  user_id bigint not null references public.app_users(id) on delete cascade,
  id text not null,
  local_date date not null,
  type text not null,
  distance_km double precision,
  duration_min double precision,
  rpe double precision,
  avg_hr double precision,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

create index if not exists runs_user_date_idx
  on public.runs(user_id, local_date);

insert into public.schema_migrations (id)
values
  ('2026-08-15-per-user-facts'),
  ('2026-08-16-session-hash-ai-cache')
on conflict (id) do nothing;

alter table public.app_users enable row level security;
alter table public.auth_sessions enable row level security;
alter table public.app_state enable row level security;
alter table public.ai_note_cache enable row level security;
alter table public.schema_migrations enable row level security;
alter table public.sync_meta enable row level security;
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.phases enable row level security;
alter table public.goal_revisions enable row level security;
alter table public.daily_logs enable row level security;
alter table public.meals enable row level security;
alter table public.saved_foods enable row level security;
alter table public.measurements enable row level security;
alter table public.weekly_check_ins enable row level security;
alter table public.exercises enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_sets enable row level security;
alter table public.runs enable row level security;

revoke all on table public.app_users from anon, authenticated;
revoke all on table public.auth_sessions from anon, authenticated;
revoke all on table public.app_state from anon, authenticated;
revoke all on table public.ai_note_cache from anon, authenticated;
revoke all on table public.schema_migrations from anon, authenticated;
revoke all on table public.sync_meta from anon, authenticated;
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.settings from anon, authenticated;
revoke all on table public.phases from anon, authenticated;
revoke all on table public.goal_revisions from anon, authenticated;
revoke all on table public.daily_logs from anon, authenticated;
revoke all on table public.meals from anon, authenticated;
revoke all on table public.saved_foods from anon, authenticated;
revoke all on table public.measurements from anon, authenticated;
revoke all on table public.weekly_check_ins from anon, authenticated;
revoke all on table public.exercises from anon, authenticated;
revoke all on table public.workouts from anon, authenticated;
revoke all on table public.workout_sets from anon, authenticated;
revoke all on table public.runs from anon, authenticated;

-- Phase 2: deletes sync as tombstones. Fact rows are upserted; omitted rows stay.
alter table public.goal_revisions
  add column if not exists deleted_at timestamptz;

create table if not exists public.sync_tombstones (
  user_id bigint not null references public.app_users(id) on delete cascade,
  table_name text not null,
  row_id text not null,
  deleted_at timestamptz not null default now(),
  primary key (user_id, table_name, row_id)
);

insert into public.schema_migrations (id)
values ('2026-08-15-sync-tombstones')
on conflict (id) do nothing;

alter table public.sync_tombstones enable row level security;
revoke all on table public.sync_tombstones from anon, authenticated;
