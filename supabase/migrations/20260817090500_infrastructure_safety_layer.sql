-- Additive infrastructure safety evidence. This migration never drops, truncates,
-- rewrites, or resets customer, wallet, order, payment, fulfillment, or media data.

do $$
begin
  if to_regclass('public.infrastructure_provider_settings') is not null then
    alter table public.infrastructure_provider_settings drop constraint if exists infrastructure_provider_settings_provider_check;
    alter table public.infrastructure_provider_settings add constraint infrastructure_provider_settings_provider_check
      check (provider in ('NONE','LOCAL','CLOUDFLARE','SUPABASE','UPSTASH','S3_COMPATIBLE','REDIS_COMPATIBLE','CUSTOM'));
  end if;
  if to_regclass('public.infrastructure_object_metadata') is not null then
    alter table public.infrastructure_object_metadata drop constraint if exists infrastructure_object_metadata_provider_check;
    alter table public.infrastructure_object_metadata add constraint infrastructure_object_metadata_provider_check
      check (provider in ('NONE','LOCAL','CLOUDFLARE','SUPABASE','UPSTASH','S3_COMPATIBLE','REDIS_COMPATIBLE','CUSTOM'));
    alter table public.infrastructure_object_metadata drop constraint if exists infrastructure_object_metadata_processing_status_check;
    alter table public.infrastructure_object_metadata add constraint infrastructure_object_metadata_processing_status_check
      check (processing_status in ('UPLOADING','QUARANTINED','SCANNING','PROCESSING','SAFE','REJECTED'));
  end if;
end $$;

create table if not exists public.infrastructure_audit_ledger (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor_type text not null default 'SYSTEM',
  actor_id uuid,
  actor_ip_hash text,
  target_type text,
  target_id text,
  related_transaction_id text,
  related_order_id text,
  environment text not null check (environment in ('LOCAL','SANDBOX','STAGING','PRODUCTION')),
  result text not null default 'recorded',
  safe_metadata jsonb not null default '{}'::jsonb,
  correlation_id text,
  created_at timestamptz not null default now()
);

create unique index if not exists infrastructure_audit_ledger_event_key_idx
  on public.infrastructure_audit_ledger(environment, event_type, correlation_id)
  where correlation_id is not null;
create index if not exists infrastructure_audit_ledger_target_time_idx
  on public.infrastructure_audit_ledger(target_type, target_id, created_at desc);
create index if not exists infrastructure_audit_ledger_event_time_idx
  on public.infrastructure_audit_ledger(environment, event_type, created_at desc);

create or replace function public.prevent_infrastructure_audit_ledger_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'infrastructure_audit_ledger is append-only';
end;
$$;

drop trigger if exists infrastructure_audit_ledger_append_only on public.infrastructure_audit_ledger;
create trigger infrastructure_audit_ledger_append_only
before update or delete on public.infrastructure_audit_ledger
for each row execute function public.prevent_infrastructure_audit_ledger_mutation();

create table if not exists public.infrastructure_event_handler_failures (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  event_name text not null,
  handler_name text not null,
  environment text not null check (environment in ('LOCAL','SANDBOX','STAGING','PRODUCTION')),
  error text not null,
  retry_count integer not null default 0 check (retry_count >= 0),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists infrastructure_event_handler_failures_open_idx
  on public.infrastructure_event_handler_failures(environment, created_at desc)
  where resolved_at is null;

create table if not exists public.infrastructure_external_monitor_checks (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  endpoint text not null,
  environment text not null check (environment in ('LOCAL','SANDBOX','STAGING','PRODUCTION')),
  status text not null check (status in ('NOT CONFIGURED','HEALTHY','DEGRADED','OFFLINE','ACTION REQUIRED','SANDBOX')),
  latency_ms integer,
  detail text not null,
  checked_at timestamptz not null default now()
);
create index if not exists infrastructure_external_monitor_checks_time_idx
  on public.infrastructure_external_monitor_checks(environment, checked_at desc);

create table if not exists public.infrastructure_backup_restore_tests (
  id uuid primary key default gen_random_uuid(),
  environment text not null check (environment in ('SANDBOX','STAGING')),
  provider text not null,
  reference text,
  status text not null check (status in ('REQUESTED','SUCCEEDED','FAILED','UNVERIFIED')),
  detail text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists infrastructure_backup_restore_tests_time_idx
  on public.infrastructure_backup_restore_tests(environment, started_at desc);

create table if not exists public.infrastructure_release_history (
  id uuid primary key default gen_random_uuid(),
  release_version text not null,
  slot text not null check (slot in ('BLUE','GREEN','UNKNOWN')),
  environment text not null check (environment in ('LOCAL','SANDBOX','STAGING','PRODUCTION')),
  status text not null check (status in ('PREPARING','ACTIVE','VERIFIED','ROLLED_BACK','FAILED','UNVERIFIED')),
  health text,
  rollback_reference text,
  created_at timestamptz not null default now()
);
create index if not exists infrastructure_release_history_environment_time_idx
  on public.infrastructure_release_history(environment, created_at desc);

alter table public.infrastructure_audit_ledger enable row level security;
alter table public.infrastructure_event_handler_failures enable row level security;
alter table public.infrastructure_external_monitor_checks enable row level security;
alter table public.infrastructure_backup_restore_tests enable row level security;
alter table public.infrastructure_release_history enable row level security;

revoke all on public.infrastructure_audit_ledger from anon, authenticated;
revoke all on public.infrastructure_event_handler_failures from anon, authenticated;
revoke all on public.infrastructure_external_monitor_checks from anon, authenticated;
revoke all on public.infrastructure_backup_restore_tests from anon, authenticated;
revoke all on public.infrastructure_release_history from anon, authenticated;

comment on table public.infrastructure_audit_ledger is 'Append-only redacted operational and financial audit evidence. Corrections are new events, never updates.';
comment on table public.infrastructure_backup_restore_tests is 'Restore verification is restricted to SANDBOX and STAGING; production restore is never initiated by the application.';
