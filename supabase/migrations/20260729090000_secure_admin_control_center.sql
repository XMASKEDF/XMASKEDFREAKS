-- Secure ADMIN gateway, first-login setup, email 2FA, revocable sessions, and future role permissions.
alter table public.admin_users
  add column if not exists display_name text,
  add column if not exists recovery_email text,
  add column if not exists is_super_admin boolean not null default false,
  add column if not exists permissions text[] not null default '{}',
  add column if not exists first_setup_completed boolean not null default false,
  add column if not exists password_changed_at timestamptz;

alter table public.admin_sessions
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists device_hash text,
  add column if not exists remember_device boolean not null default false,
  add column if not exists revoke_reason text;

alter table public.admin_password_reset_events
  add column if not exists token_hash text,
  add column if not exists expires_at timestamptz;

create unique index if not exists admin_password_reset_token_lookup
  on public.admin_password_reset_events(token_hash)
  where token_hash is not null and completed = false;

create index if not exists admin_sessions_active_lookup
  on public.admin_sessions(session_token_hash, expires_at)
  where revoked_at is null;

create table if not exists public.admin_security_settings (
  id text primary key default 'primary' check (id = 'primary'),
  email_two_factor_enabled boolean not null default false,
  session_timeout_minutes integer not null default 720 check (session_timeout_minutes between 15 and 1440),
  inactivity_timeout_minutes integer not null default 30 check (inactivity_timeout_minutes between 5 and 240),
  remember_device_days integer not null default 30 check (remember_device_days between 1 and 90),
  updated_by uuid references public.admin_users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.admin_security_settings (id) values ('primary')
on conflict (id) do nothing;

create table if not exists public.admin_login_challenges (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_users(id) on delete cascade,
  challenge_token_hash text unique not null,
  code_hash text not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  remember_device boolean not null default false,
  ip_address text,
  user_agent text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists admin_login_challenges_active_lookup
  on public.admin_login_challenges(challenge_token_hash, expires_at)
  where used_at is null;

create table if not exists public.admin_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_login_history (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references public.admin_users(id) on delete set null,
  ip_address text,
  user_agent text,
  device_hash text,
  result text not null check (result in ('success', 'failed', 'locked')),
  failure_reason text,
  created_at timestamptz not null default now()
);

alter table public.admin_security_settings enable row level security;
alter table public.admin_login_challenges enable row level security;
alter table public.admin_recovery_codes enable row level security;
alter table public.admin_login_history enable row level security;

revoke all on public.admin_security_settings from anon, authenticated;
revoke all on public.admin_login_challenges from anon, authenticated;
revoke all on public.admin_recovery_codes from anon, authenticated;
revoke all on public.admin_login_history from anon, authenticated;

comment on table public.admin_login_challenges is 'Server-only, hashed, expiring, single-use administrator email 2FA challenges.';
comment on table public.admin_recovery_codes is 'Server-only bcrypt hashes; plaintext recovery codes are shown exactly once.';
comment on table public.admin_login_history is 'Restricted administrator device and login evidence. Raw values never appear on public pages.';
