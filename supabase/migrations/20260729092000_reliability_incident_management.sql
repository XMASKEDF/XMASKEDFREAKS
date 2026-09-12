-- Central reliability, incident, health, recovery, and financial-integrity evidence.
create table if not exists public.reliability_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_key text not null unique,
  correlation_id text not null unique,
  title text not null,
  plain_explanation text not null,
  technical_explanation text,
  severity smallint not null check (severity between 1 and 5),
  status text not null default 'Detected' check (status in ('Detected','Investigating','Contained','Monitoring','Resolved','False Positive','Requires Vendor','Requires Admin Action')),
  feature text not null,
  affected_route text,
  first_detected_at timestamptz not null default now(),
  last_occurred_at timestamptz not null default now(),
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  affected_customer_count integer not null default 0 check (affected_customer_count >= 0),
  affected_order_count integer not null default 0 check (affected_order_count >= 0),
  affected_wallet_transaction_count integer not null default 0 check (affected_wallet_transaction_count >= 0),
  affected_region text,
  browser text,
  device_type text,
  operating_system text,
  request_id text,
  user_id uuid references auth.users(id) on delete set null,
  order_id uuid references public.commerce_orders(id) on delete set null,
  payment_id text,
  wallet_ledger_id uuid references public.wallet_transactions(id) on delete set null,
  error_message text,
  sanitized_stack text,
  suspected_cause text,
  automatic_response text,
  recovery_result text,
  recommended_admin_action text,
  assigned_admin_id uuid references public.admin_users(id) on delete set null,
  resolution_notes text,
  resolved_at timestamptz,
  deployment_version text,
  financial_impact boolean not null default false,
  security_impact boolean not null default false,
  customer_data_risk boolean not null default false,
  money_at_risk boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reliability_incidents_active_idx on public.reliability_incidents(severity desc,last_occurred_at desc) where resolved_at is null;
create index if not exists reliability_incidents_feature_idx on public.reliability_incidents(feature,last_occurred_at desc);
create index if not exists reliability_incidents_status_idx on public.reliability_incidents(status,last_occurred_at desc);

create table if not exists public.reliability_occurrences (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.reliability_incidents(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  request_id text,
  correlation_id text not null,
  affected_route text,
  user_id uuid references auth.users(id) on delete set null,
  order_id uuid references public.commerce_orders(id) on delete set null,
  payment_id text,
  wallet_ledger_id uuid references public.wallet_transactions(id) on delete set null,
  browser text,
  device_type text,
  operating_system text,
  affected_region text,
  error_message text,
  sanitized_stack text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists reliability_occurrences_incident_idx on public.reliability_occurrences(incident_id,occurred_at desc);

create table if not exists public.reliability_incident_actions (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.reliability_incidents(id) on delete restrict,
  admin_user_id uuid references public.admin_users(id) on delete set null,
  action_type text not null,
  previous_status text,
  next_status text,
  notes text,
  safe_automatic boolean not null default false,
  approval_required boolean not null default false,
  result text,
  created_at timestamptz not null default now()
);

create table if not exists public.reliability_alerts (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.reliability_incidents(id) on delete restrict,
  channel text not null default 'admin',
  deduplication_key text not null,
  delivery_status text not null default 'queued',
  attempted_at timestamptz,
  delivered_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  unique (deduplication_key,channel)
);

create table if not exists public.reliability_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  overall_status text not null check (overall_status in ('Operational','Degraded','Partial Outage','Major Outage','Maintenance','Recovering')),
  checks jsonb not null default '[]'::jsonb,
  duration_ms integer not null default 0,
  deployment_version text,
  created_at timestamptz not null default now()
);

create table if not exists public.reliability_circuit_breakers (
  provider text primary key,
  state text not null default 'closed' check (state in ('closed','open','half_open')),
  consecutive_failures integer not null default 0,
  failure_threshold integer not null default 5 check (failure_threshold between 1 and 50),
  opened_at timestamptz,
  next_probe_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error_code text,
  updated_at timestamptz not null default now()
);

create table if not exists public.reliability_deployments (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  commit_sha text,
  deployment_status text not null,
  database_migration_version text,
  deployed_by text,
  deployed_at timestamptz not null default now(),
  error_rate_after numeric,
  performance_change_ms integer,
  rollback_available boolean not null default false,
  rollback_reference text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.reliability_backups (
  id uuid primary key default gen_random_uuid(),
  backup_type text not null,
  status text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  next_scheduled_at timestamptz,
  size_bytes bigint,
  encrypted boolean,
  retention_days integer,
  restore_tested_at timestamptz,
  error_code text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.reliability_incident_links (
  incident_id uuid not null references public.reliability_incidents(id) on delete restrict,
  related_incident_id uuid not null references public.reliability_incidents(id) on delete restrict,
  relationship text not null default 'related' check (relationship in ('related','duplicate','caused_by','follow_up')),
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (incident_id,related_incident_id),
  check (incident_id<>related_incident_id)
);

create table if not exists public.reliability_postmortems (
  incident_id uuid primary key references public.reliability_incidents(id) on delete restrict,
  incident_summary text not null,
  customer_impact text not null,
  financial_impact text,
  root_cause text not null,
  timeline jsonb not null default '[]'::jsonb,
  response_review text not null,
  recovery_review text not null,
  prevention_steps jsonb not null default '[]'::jsonb,
  owners jsonb not null default '[]'::jsonb,
  completion_status text not null default 'draft' check (completion_status in ('draft','in_review','approved')),
  approved_by uuid references public.admin_users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reliability_retention_settings (
  evidence_type text primary key,
  retention_days integer not null check (retention_days between 1 and 3650),
  reason text not null,
  purge_requires_admin_approval boolean not null default true,
  updated_by uuid references public.admin_users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.reliability_retention_settings(evidence_type,retention_days,reason)
values
  ('application_errors',90,'Operational troubleshooting and trend comparison'),
  ('browser_errors',30,'Short-lived client compatibility evidence'),
  ('performance_snapshots',30,'Performance regression comparison'),
  ('security_events',365,'Security investigation and abuse trend evidence'),
  ('financial_incidents',2555,'Financial integrity and dispute evidence'),
  ('incident_actions',2555,'Administrator accountability and incident history')
on conflict(evidence_type) do nothing;

insert into public.email_templates(template_key,subject,body_text,transactional,allowed_variables)
values
  ('reliability_critical','Critical platform incident: {{reference}}','A severity {{severity}} incident was detected in {{feature}}. Reference: {{reference}}. Open the protected Reliability Center for sanitized evidence and the safest next action.',true,array['reference','severity','feature']),
  ('reliability_daily','Daily platform reliability summary','Incidents: {{total}}. Active: {{active}}. Resolved: {{resolved}}. Critical: {{critical}}. Financial issues: {{financial}}. Affected customers: {{affectedCustomers}}. Review the protected Reliability Center for details.',true,array['total','active','resolved','critical','financial','affectedCustomers'])
on conflict(template_key) do nothing;

create table if not exists public.wallet_integrity_holds (
  user_id uuid primary key references auth.users(id) on delete cascade,
  expected_balance bigint not null,
  actual_balance bigint not null,
  reason text not null,
  active boolean not null default true,
  incident_id uuid references public.reliability_incidents(id) on delete set null,
  reviewed_by uuid references public.admin_users(id) on delete set null,
  reviewed_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reliability_incidents enable row level security;
alter table public.reliability_occurrences enable row level security;
alter table public.reliability_incident_actions enable row level security;
alter table public.reliability_alerts enable row level security;
alter table public.reliability_health_snapshots enable row level security;
alter table public.reliability_circuit_breakers enable row level security;
alter table public.reliability_deployments enable row level security;
alter table public.reliability_backups enable row level security;
alter table public.reliability_incident_links enable row level security;
alter table public.reliability_postmortems enable row level security;
alter table public.reliability_retention_settings enable row level security;
alter table public.wallet_integrity_holds enable row level security;

revoke all on public.reliability_incidents, public.reliability_occurrences, public.reliability_incident_actions,
  public.reliability_alerts, public.reliability_health_snapshots, public.reliability_circuit_breakers,
  public.reliability_deployments, public.reliability_backups, public.reliability_incident_links,
  public.reliability_postmortems, public.reliability_retention_settings, public.wallet_integrity_holds from anon, authenticated;

create or replace function public.record_reliability_incident(p_record jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  selected public.reliability_incidents;
  incident_key text:=left(coalesce(p_record->>'incidentKey','unknown'),128);
  correlation text:=left(coalesce(p_record->>'correlationId',gen_random_uuid()::text),128);
  incoming_severity integer:=greatest(1,least(5,coalesce((p_record->>'severity')::integer,2)));
begin
  insert into reliability_incidents(
    incident_key,correlation_id,title,plain_explanation,technical_explanation,severity,status,feature,affected_route,
    affected_customer_count,affected_order_count,affected_wallet_transaction_count,affected_region,browser,device_type,
    operating_system,request_id,user_id,order_id,payment_id,wallet_ledger_id,error_message,sanitized_stack,suspected_cause,
    automatic_response,recovery_result,recommended_admin_action,deployment_version,financial_impact,security_impact,
    customer_data_risk,money_at_risk,metadata
  ) values (
    incident_key,correlation,left(coalesce(p_record->>'title','Unexpected platform error'),200),
    left(coalesce(p_record->>'plainExplanation','A platform feature reported an unexpected problem.'),1200),
    left(coalesce(p_record->>'technicalExplanation',''),4000),incoming_severity,'Detected',
    left(coalesce(p_record->>'feature','Unknown'),120),left(p_record->>'affectedRoute',500),
    greatest(0,coalesce((p_record->>'affectedCustomerCount')::integer,0)),
    greatest(0,coalesce((p_record->>'affectedOrderCount')::integer,0)),
    greatest(0,coalesce((p_record->>'affectedWalletTransactionCount')::integer,0)),
    left(p_record->>'affectedRegion',120),left(p_record->>'browser',120),left(p_record->>'deviceType',120),
    left(p_record->>'operatingSystem',120),left(p_record->>'requestId',160),
    nullif(p_record->>'userId','')::uuid,nullif(p_record->>'orderId','')::uuid,left(p_record->>'paymentId',160),
    nullif(p_record->>'walletLedgerId','')::uuid,left(p_record->>'errorMessage',2000),left(p_record->>'sanitizedStack',8000),
    left(p_record->>'suspectedCause',2000),left(p_record->>'automaticResponse',2000),left(p_record->>'recoveryResult',2000),
    left(p_record->>'recommendedAdminAction',2000),left(p_record->>'deploymentVersion',160),
    coalesce((p_record->>'financialImpact')::boolean,false),coalesce((p_record->>'securityImpact')::boolean,false),
    coalesce((p_record->>'customerDataRisk')::boolean,false),coalesce((p_record->>'moneyAtRisk')::boolean,false),
    coalesce(p_record->'metadata','{}'::jsonb)
  )
  on conflict (incident_key) do update set
    severity=greatest(reliability_incidents.severity,excluded.severity),
    last_occurred_at=now(),occurrence_count=reliability_incidents.occurrence_count+1,
    affected_customer_count=greatest(reliability_incidents.affected_customer_count,excluded.affected_customer_count),
    affected_order_count=greatest(reliability_incidents.affected_order_count,excluded.affected_order_count),
    affected_wallet_transaction_count=greatest(reliability_incidents.affected_wallet_transaction_count,excluded.affected_wallet_transaction_count),
    error_message=excluded.error_message,sanitized_stack=excluded.sanitized_stack,
    status=case when reliability_incidents.status in ('Resolved','False Positive') then 'Detected' else reliability_incidents.status end,
    resolved_at=null,updated_at=now()
  returning * into selected;

  insert into reliability_occurrences(
    incident_id,request_id,correlation_id,affected_route,user_id,order_id,payment_id,wallet_ledger_id,browser,
    device_type,operating_system,affected_region,error_message,sanitized_stack,metadata
  ) values (
    selected.id,left(p_record->>'requestId',160),selected.correlation_id,left(p_record->>'affectedRoute',500),
    nullif(p_record->>'userId','')::uuid,nullif(p_record->>'orderId','')::uuid,left(p_record->>'paymentId',160),
    nullif(p_record->>'walletLedgerId','')::uuid,left(p_record->>'browser',120),left(p_record->>'deviceType',120),
    left(p_record->>'operatingSystem',120),left(p_record->>'affectedRegion',120),left(p_record->>'errorMessage',2000),
    left(p_record->>'sanitizedStack',8000),coalesce(p_record->'metadata','{}'::jsonb)
  );
  return jsonb_build_object('incidentId',selected.id,'correlationId',selected.correlation_id,'occurrenceCount',selected.occurrence_count);
end $$;

revoke all on function public.record_reliability_incident(jsonb) from public,anon,authenticated;
grant execute on function public.record_reliability_incident(jsonb) to service_role;

create or replace function public.scan_wallet_integrity()
returns table(user_id uuid,actual_balance bigint,expected_balance bigint,is_consistent boolean)
language sql
security definer
set search_path=public
as $$
  with expected as (
    select w.user_id,w.balance_tokens,
      coalesce(sum(t.total_coins) filter(where t.status='confirmed' and t.final_transaction_result in ('completed','confirmed','success')),0)::bigint expected
    from token_wallets w left join wallet_transactions t on t.user_id=w.user_id
    group by w.user_id,w.balance_tokens
  ), mismatches as (
    insert into wallet_integrity_holds(user_id,expected_balance,actual_balance,reason,active,updated_at)
    select e.user_id,e.expected,e.balance_tokens,'Wallet balance does not match completed ledger entries',true,now()
    from expected e where e.balance_tokens<>e.expected
    on conflict(user_id) do update set expected_balance=excluded.expected_balance,actual_balance=excluded.actual_balance,
      reason=excluded.reason,active=true,updated_at=now()
    returning user_id
  )
  select e.user_id,e.balance_tokens,e.expected,e.balance_tokens=e.expected from expected e;
$$;

revoke all on function public.scan_wallet_integrity() from public,anon,authenticated;
grant execute on function public.scan_wallet_integrity() to service_role;

create or replace function public.block_held_wallet_spending()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.balance_tokens < old.balance_tokens and exists(select 1 from wallet_integrity_holds where user_id=old.user_id and active) then
    raise exception 'WALLET_INTEGRITY_HOLD';
  end if;
  return new;
end $$;

drop trigger if exists token_wallet_integrity_hold on public.token_wallets;
create trigger token_wallet_integrity_hold before update of balance_tokens on public.token_wallets
for each row execute function public.block_held_wallet_spending();

create or replace function public.protect_reliability_evidence()
returns trigger language plpgsql as $$ begin raise exception 'RELIABILITY_EVIDENCE_IS_APPEND_ONLY'; end $$;
drop trigger if exists reliability_occurrences_immutable on public.reliability_occurrences;
create trigger reliability_occurrences_immutable before update or delete on public.reliability_occurrences
for each row execute function public.protect_reliability_evidence();
drop trigger if exists reliability_actions_immutable on public.reliability_incident_actions;
create trigger reliability_actions_immutable before update or delete on public.reliability_incident_actions
for each row execute function public.protect_reliability_evidence();
