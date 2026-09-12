create table if not exists public.privacy_consent_settings (
  id text primary key,
  enabled boolean not null default true,
  popup_delay_seconds integer not null default 46,
  consent_version text not null default '1.0',
  consent_lifetime_days integer not null default 180,
  privacy_policy_url text not null default '/policies#privacy',
  cookie_policy_url text not null default '/policies#cookies',
  gpc_support boolean not null default true,
  updated_by uuid references public.admin_users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.privacy_consent_settings (id) values ('primary') on conflict (id) do nothing;

create table if not exists public.privacy_consent_events (
  id uuid primary key default gen_random_uuid(),
  consent_version text not null,
  necessary boolean not null default true,
  analytics boolean not null default false,
  functional boolean not null default false,
  marketing boolean not null default false,
  advertising boolean not null default false,
  gpc boolean not null default false,
  anonymous_session_hash text not null,
  environment text not null default 'production' check (environment in ('production', 'sandbox')),
  created_at timestamptz not null default now()
);

create index if not exists privacy_consent_events_created_at_idx on public.privacy_consent_events (created_at desc);
create index if not exists privacy_consent_events_environment_idx on public.privacy_consent_events (environment);
alter table public.privacy_consent_settings enable row level security;
alter table public.privacy_consent_events enable row level security;
