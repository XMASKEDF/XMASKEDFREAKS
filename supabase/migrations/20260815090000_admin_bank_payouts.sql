create table if not exists public.admin_payout_settings (
  id boolean primary key default true check (id),
  provider text not null default 'provider_controlled' check (provider in ('provider_controlled', 'segpay', 'ccbill')),
  automatic_enabled boolean not null default false,
  internal_sweep_hours smallint not null default 1 check (internal_sweep_hours between 1 and 8),
  minimum_payout_minor bigint not null default 10000 check (minimum_payout_minor >= 0),
  destination_label text,
  destination_last4 text check (destination_last4 is null or destination_last4 ~ '^[0-9]{4}$'),
  provider_destination_token text,
  destination_status text not null default 'not_configured' check (destination_status in ('not_configured', 'pending_verification', 'verified', 'disabled')),
  hold_after_destination_change boolean not null default true,
  sandbox_mode boolean not null default true,
  updated_by uuid references public.admin_users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.admin_payout_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.admin_payout_requests (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  provider text not null,
  mode text not null default 'sandbox' check (mode in ('sandbox', 'production')),
  amount_minor bigint not null check (amount_minor > 0),
  fee_minor bigint not null default 0 check (fee_minor >= 0),
  net_amount_minor bigint not null check (net_amount_minor >= 0),
  currency text not null default 'USD',
  destination_last4 text check (destination_last4 is null or destination_last4 ~ '^[0-9]{4}$'),
  status text not null default 'action_required' check (status in ('queued', 'processing', 'action_required', 'submitted', 'confirmed', 'failed', 'cancelled', 'reconciliation_required')),
  provider_reference text,
  failure_reason text,
  requested_by uuid references public.admin_users(id) on delete set null,
  requested_at timestamptz not null default now(),
  submitted_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists admin_payout_requests_status_idx on public.admin_payout_requests(status, created_at desc);
create index if not exists admin_payout_requests_provider_ref_idx on public.admin_payout_requests(provider_reference);

create table if not exists public.admin_payout_events (
  id uuid primary key default gen_random_uuid(),
  payout_request_id uuid not null references public.admin_payout_requests(id) on delete cascade,
  event_type text not null,
  previous_status text,
  next_status text,
  provider_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists admin_payout_events_request_idx on public.admin_payout_events(payout_request_id, created_at desc);

alter table public.admin_payout_settings enable row level security;
alter table public.admin_payout_requests enable row level security;
alter table public.admin_payout_events enable row level security;

revoke all on public.admin_payout_settings from anon, authenticated;
revoke all on public.admin_payout_requests from anon, authenticated;
revoke all on public.admin_payout_events from anon, authenticated;
