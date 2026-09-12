-- Additive operational integration state.
-- This migration prepares durable worker, email delivery, and public-media
-- publication records without enabling an external provider or settlement.

create table if not exists public.admin_deposit_worker_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED','RUNNING','COMPLETED','PARTIAL','FAILED','BLOCKED_PROVIDER','RETRYING')),
  scheduled_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  records_processed integer not null default 0 check (records_processed >= 0),
  eligible_amount_minor bigint not null default 0 check (eligible_amount_minor >= 0),
  payout_request_id uuid references public.admin_payout_requests(id) on delete set null,
  result text,
  failure_reason text,
  provider_action_required text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_deposit_worker_runs_status_idx on public.admin_deposit_worker_runs(status, scheduled_at asc);
create index if not exists admin_deposit_worker_runs_completed_idx on public.admin_deposit_worker_runs(completed_at desc);

create or replace function public.claim_admin_deposit_worker_run(
  p_run_key text,
  p_scheduled_at timestamptz default now(),
  p_allow_retry boolean default false
) returns setof public.admin_deposit_worker_runs
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(p_run_key), '') is null then
    raise exception 'WORKER_RUN_KEY_REQUIRED';
  end if;

  insert into public.admin_deposit_worker_runs(run_key, scheduled_at, status)
  values (trim(p_run_key), coalesce(p_scheduled_at, now()), 'SCHEDULED')
  on conflict (run_key) do nothing;

  return query
  update public.admin_deposit_worker_runs
  set status = 'RUNNING',
      attempt_count = attempt_count + 1,
      started_at = now(),
      completed_at = null,
      failure_reason = null,
      updated_at = now()
  where run_key = trim(p_run_key)
    and (
      status in ('SCHEDULED', 'RETRYING')
      or (p_allow_retry and status = 'FAILED')
    )
  returning *;
end;
$$;

revoke all on public.admin_deposit_worker_runs from public, anon, authenticated;
revoke all on function public.claim_admin_deposit_worker_run(text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.claim_admin_deposit_worker_run(text, timestamptz, boolean) to service_role;

alter table public.email_delivery_jobs
  add column if not exists delivery_state text,
  add column if not exists provider_reference text,
  add column if not exists provider_accepted_at timestamptz,
  add column if not exists delivered_at timestamptz;

alter table public.email_delivery_jobs drop constraint if exists email_delivery_jobs_delivery_state_check;
alter table public.email_delivery_jobs add constraint email_delivery_jobs_delivery_state_check
  check (delivery_state is null or delivery_state in ('QUEUED','PROVIDER_ACCEPTED','DELIVERED','FAILED'));

alter table public.media_storage_events drop constraint if exists media_storage_events_event_type_check;
alter table public.media_storage_events add constraint media_storage_events_event_type_check
  check (event_type in ('UPLOAD_REQUESTED','UPLOAD_COMPLETED','UPLOAD_FAILED','PROCESSING_STARTED','PROCESSING_COMPLETED','SIGNED_DOWNLOAD_ISSUED','DOWNLOAD_DENIED','CLEANUP_RUN','PUBLICATION_REQUESTED','PUBLICATION_COMPLETED','PUBLICATION_FAILED'));

alter table public.media_assets
  add column if not exists publication_status text not null default 'UNPUBLISHED',
  add column if not exists publication_error text;
alter table public.media_assets drop constraint if exists media_assets_publication_status_check;
alter table public.media_assets add constraint media_assets_publication_status_check
  check (publication_status in ('UNPUBLISHED','REQUESTED','PUBLISHED','FAILED'));
alter table public.media_variants
  add column if not exists storage_bucket text not null default 'media';
update public.media_assets
set publication_status = 'PUBLISHED'
where publication_status = 'UNPUBLISHED' and status = 'published' and is_public = true;

comment on table public.admin_deposit_worker_runs is 'Durable internal deposit-worker attempts. It prepares reviewable payout records and never submits bank settlement by itself.';
comment on column public.email_delivery_jobs.delivery_state is 'Provider acceptance is distinct from confirmed delivery; DELIVERED requires a provider delivery event.';
comment on table public.media_storage_events is 'Append-only storage lifecycle events, including safe public-media publication attempts.';
