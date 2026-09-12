-- Additive Admin operational state. This stores configuration and bounded
-- operational events without replacing existing audit, analytics, commerce,
-- wallet, support, media, or moderation tables.
create table if not exists public.admin_operational_state (
  state_key text primary key check (state_key = 'platform'),
  payload jsonb not null default '{}'::jsonb,
  updated_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_operational_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists admin_operational_events_type_time_idx
  on public.admin_operational_events(event_type, created_at desc);

alter table public.admin_operational_state enable row level security;
alter table public.admin_operational_events enable row level security;
revoke all on public.admin_operational_state, public.admin_operational_events from anon, authenticated;

comment on table public.admin_operational_state is 'Durable, server-authoritative Admin configuration for operational tools. Secrets and provider credentials are excluded.';
comment on table public.admin_operational_events is 'Bounded operational change records. Security history remains in the established Admin Audit Log.';
