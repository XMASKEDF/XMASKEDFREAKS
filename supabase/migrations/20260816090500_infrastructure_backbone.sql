-- Provider-neutral infrastructure evidence. This migration is additive and does not
-- alter customer wallets, orders, payments, fulfillment, or existing media records.
create table if not exists public.infrastructure_provider_settings (
  id text primary key,
  environment text not null check (environment in ('LOCAL','SANDBOX','STAGING','PRODUCTION')),
  provider text not null check (provider in ('NONE','LOCAL','CLOUDFLARE','SUPABASE','UPSTASH','CUSTOM')),
  enabled boolean not null default false,
  configuration jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  last_status text not null default 'NOT CONFIGURED' check (last_status in ('NOT CONFIGURED','HEALTHY','DEGRADED','OFFLINE','ACTION REQUIRED','SANDBOX')),
  last_error text,
  updated_by uuid references public.admin_users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.infrastructure_object_metadata (
  id uuid primary key default gen_random_uuid(),
  object_id text not null unique,
  environment text not null check (environment in ('LOCAL','SANDBOX','STAGING','PRODUCTION')),
  provider text not null check (provider in ('NONE','LOCAL','CLOUDFLARE','SUPABASE','UPSTASH','CUSTOM')),
  object_key text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  checksum text not null,
  visibility text not null check (visibility in ('PUBLIC','PRIVATE')),
  owner_id uuid,
  reference text,
  processing_status text not null check (processing_status in ('UPLOADING','QUARANTINED','PROCESSING','SAFE','REJECTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(environment, provider, object_key)
);

create table if not exists public.infrastructure_job_records (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  environment text not null check (environment in ('LOCAL','SANDBOX','STAGING','PRODUCTION')),
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  related_order_id uuid,
  related_user_id uuid,
  status text not null check (status in ('QUEUED','RUNNING','SUCCEEDED','FAILED','RETRYING','CANCELED','ACTION REQUIRED')),
  retry_count integer not null default 0 check (retry_count >= 0),
  error text,
  created_at timestamptz not null default now(),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  unique(environment, idempotency_key)
);

create table if not exists public.infrastructure_processed_events (
  event_id uuid primary key,
  event_name text not null,
  environment text not null check (environment in ('LOCAL','SANDBOX','STAGING','PRODUCTION')),
  correlation_id text,
  payload_hash text not null,
  processed_at timestamptz not null default now(),
  result text not null default 'processed'
);

create table if not exists public.infrastructure_health_checks (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  environment text not null check (environment in ('LOCAL','SANDBOX','STAGING','PRODUCTION')),
  provider text not null,
  status text not null check (status in ('NOT CONFIGURED','HEALTHY','DEGRADED','OFFLINE','ACTION REQUIRED','SANDBOX')),
  latency_ms integer,
  health text not null,
  error_state text,
  checked_at timestamptz not null default now()
);

create index if not exists infrastructure_health_checks_service_time_idx on public.infrastructure_health_checks(service_id, environment, checked_at desc);
create index if not exists infrastructure_job_records_status_time_idx on public.infrastructure_job_records(environment, status, created_at desc);
create index if not exists infrastructure_object_metadata_reference_idx on public.infrastructure_object_metadata(environment, reference);
create index if not exists infrastructure_events_name_time_idx on public.infrastructure_processed_events(environment, event_name, processed_at desc);

alter table public.infrastructure_provider_settings enable row level security;
alter table public.infrastructure_object_metadata enable row level security;
alter table public.infrastructure_job_records enable row level security;
alter table public.infrastructure_processed_events enable row level security;
alter table public.infrastructure_health_checks enable row level security;

comment on table public.infrastructure_job_records is 'Provider-neutral background job evidence; financial and fulfillment jobs remain idempotent and provider-state checked before retry.';
comment on table public.infrastructure_processed_events is 'Durable event idempotency records for high-risk downstream actions.';
comment on table public.infrastructure_object_metadata is 'Metadata and quarantine state for object storage without making private media public.';
