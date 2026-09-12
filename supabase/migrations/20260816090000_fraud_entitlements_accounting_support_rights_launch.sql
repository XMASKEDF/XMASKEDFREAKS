-- Additive operational backbone tables. Existing wallets, orders, payments,
-- fulfillment records, and purchase_entitlements are preserved unchanged.
create table if not exists public.risk_events (
  id uuid primary key default gen_random_uuid(),
  action_type text not null,
  environment text not null default 'LOCAL' check (environment in ('LOCAL','SANDBOX','STAGING','PRODUCTION')),
  user_id uuid,
  order_id uuid,
  transaction_id text,
  risk_score integer not null check (risk_score between 0 and 100),
  risk_level text not null check (risk_level in ('LOW','MEDIUM','HIGH','CRITICAL')),
  reasons jsonb not null default '[]'::jsonb,
  decision text not null,
  requires_review boolean not null default false,
  review_status text not null default 'UNREVIEWED' check (review_status in ('UNREVIEWED','APPROVED','DENIED','MONITORING','RESTRICTED','UNRESTRICTED')),
  review_reason text,
  reviewed_by uuid references public.admin_users(id) on delete set null,
  reviewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(id)
);

create index if not exists risk_events_review_idx on public.risk_events(review_status, risk_level, created_at desc);
create index if not exists risk_events_user_idx on public.risk_events(user_id, created_at desc);

create table if not exists public.platform_entitlements (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  resource_type text not null,
  resource_id text not null,
  source_order_id uuid,
  source_transaction_id text,
  status text not null default 'ACTIVE' check (status in ('PENDING','ACTIVE','EXPIRED','REVOKED','REFUNDED','CHARGEBACK_HOLD','ADMIN_HOLD')),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  download_count integer not null default 0 check (download_count >= 0),
  last_downloaded_at timestamptz,
  environment text not null default 'LOCAL' check (environment in ('LOCAL','SANDBOX','STAGING','PRODUCTION')),
  granted_by uuid references public.admin_users(id) on delete set null,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(environment, customer_id, resource_type, resource_id)
);

create index if not exists platform_entitlements_customer_idx on public.platform_entitlements(customer_id, status, granted_at desc);
alter table public.platform_entitlements add column if not exists download_count integer not null default 0;
alter table public.platform_entitlements add column if not exists last_downloaded_at timestamptz;

create table if not exists public.support_cases (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid,
  guest_reference text,
  category text not null check (category in ('ACCOUNT','BILLING','DOWNLOAD','LIVE','MERCHANDISE','PAINTING','SUBSCRIPTION','WALLET','OTHER')),
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH','URGENT')),
  status text not null default 'NEW' check (status in ('NEW','OPEN','WAITING FOR CUSTOMER','WAITING FOR PROVIDER','IN REVIEW','RESOLVED','CLOSED')),
  subject text not null,
  description text not null,
  original_language text not null default 'en',
  english_translation text,
  related_order_id uuid,
  related_payment_id text,
  related_product_id text,
  related_entitlement_id uuid,
  related_fulfillment_id uuid,
  assigned_admin_id uuid references public.admin_users(id) on delete set null,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  first_response_at timestamptz,
  resolved_at timestamptz
);

create table if not exists public.support_case_messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.support_cases(id) on delete cascade,
  author_user_id uuid,
  author_admin_id uuid references public.admin_users(id) on delete set null,
  body text not null,
  language text not null default 'en',
  english_translation text,
  customer_visible boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists support_cases_queue_idx on public.support_cases(status, priority, updated_at desc);
create index if not exists support_cases_customer_idx on public.support_cases(customer_id, updated_at desc);

create table if not exists public.media_rights (
  media_id text primary key,
  title text not null,
  object_reference text,
  creator text,
  rights_holder text,
  rights_type text not null default 'UNKNOWN' check (rights_type in ('OWNED','LICENSED','COMMISSIONED','ROYALTY FREE','PUBLIC DOMAIN','THIRD PARTY','UNKNOWN','REVIEW REQUIRED')),
  license_type text,
  acquisition_source text,
  usage_scope text,
  commercial_use_allowed boolean,
  modification_allowed boolean,
  attribution_required boolean not null default false,
  geographic_restriction text,
  starts_at timestamptz,
  expires_at timestamptz,
  documentation_reference text,
  status text not null default 'REVIEW REQUIRED' check (status in ('CLEARED','RESTRICTED','EXPIRING','EXPIRED','REVIEW REQUIRED')),
  notes text,
  updated_by uuid references public.admin_users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.accounting_tax_records (
  id uuid primary key default gen_random_uuid(),
  order_id uuid,
  jurisdiction text,
  taxable_amount_minor bigint not null default 0,
  tax_amount_minor bigint not null default 0,
  tax_type text,
  tax_rate numeric,
  provider text not null default 'NONE' check (provider in ('NONE','MANUAL','PROVIDER')),
  provider_reference text,
  exemption_status text,
  transaction_date timestamptz not null default now(),
  environment text not null default 'LOCAL' check (environment in ('LOCAL','SANDBOX','STAGING','PRODUCTION'))
);

create table if not exists public.accounting_adjustments (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id text not null,
  previous_value jsonb not null default '{}'::jsonb,
  corrected_value jsonb not null default '{}'::jsonb,
  reason text not null,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.cost_entries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  provider text not null,
  category text not null,
  feature text not null default 'OTHER',
  amount numeric not null check (amount >= 0),
  frequency text not null check (frequency in ('ONE_TIME','DAILY','WEEKLY','MONTHLY','YEARLY','USAGE_BASED')),
  source text not null default 'MANUAL' check (source in ('MANUAL','ESTIMATED','PROVIDER_API')),
  active boolean not null default true,
  period_start date not null default current_date,
  notes text,
  environment text not null default 'LOCAL' check (environment in ('LOCAL','SANDBOX','STAGING','PRODUCTION')),
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.launch_readiness_runs (
  id uuid primary key default gen_random_uuid(),
  environment text not null,
  release_version text not null,
  overall_status text not null check (overall_status in ('GREEN','YELLOW','RED')),
  green_count integer not null default 0,
  yellow_count integer not null default 0,
  red_count integer not null default 0,
  blockers jsonb not null default '[]'::jsonb,
  checks jsonb not null default '[]'::jsonb,
  run_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists cost_entries_feature_time_idx on public.cost_entries(environment, feature, period_start desc);
create index if not exists launch_readiness_time_idx on public.launch_readiness_runs(environment, created_at desc);

alter table public.risk_events enable row level security;
alter table public.platform_entitlements enable row level security;
alter table public.support_cases enable row level security;
alter table public.support_case_messages enable row level security;
alter table public.media_rights enable row level security;
alter table public.accounting_tax_records enable row level security;
alter table public.accounting_adjustments enable row level security;
alter table public.cost_entries enable row level security;
alter table public.launch_readiness_runs enable row level security;

comment on table public.platform_entitlements is 'Central entitlement authority for protected digital, subscription, promotional, and admin-granted access.';
comment on table public.risk_events is 'Normalized privacy-conscious fraud/risk decisions; protected personal traits are never stored as scoring inputs.';
comment on table public.media_rights is 'Rights and publishing status for uploaded creative assets; upload alone never implies ownership.';
