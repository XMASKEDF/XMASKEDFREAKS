-- Provider-neutral POD operations around the existing coins-only Printify fulfillment queue.
-- All operational tables are service-role only. Customer checkout never writes provider state.

create table if not exists public.pod_provider_settings (
  provider text primary key,
  enabled boolean not null default false,
  product_sync_enabled boolean not null default true,
  inventory_sync_enabled boolean not null default true,
  provider_sync_enabled boolean not null default true,
  shipping_sync_enabled boolean not null default true,
  reconciliation_enabled boolean not null default true,
  automatic_retry_enabled boolean not null default true,
  preferred_provider_id integer,
  shipping_cache_minutes integer not null default 360 check(shipping_cache_minutes between 15 and 10080),
  product_sync_minutes integer not null default 60 check(product_sync_minutes between 15 and 10080),
  reconciliation_minutes integer not null default 30 check(reconciliation_minutes between 15 and 1440),
  max_retry_attempts integer not null default 5 check(max_retry_attempts between 1 and 10),
  last_changed_by uuid references public.admin_users(id) on delete set null,
  last_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.pod_provider_settings(provider) values('printify') on conflict(provider) do nothing;

create table if not exists public.pod_sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null references public.pod_provider_settings(provider) on delete restrict,
  sync_type text not null check(sync_type in ('products','inventory','providers','shipping','orders','reconciliation','health')),
  trigger_source text not null check(trigger_source in ('schedule','admin','webhook','system')),
  status text not null default 'running' check(status in ('running','completed','partial','failed','skipped')),
  created_count integer not null default 0,
  updated_count integer not null default 0,
  archived_count integer not null default 0,
  unchanged_count integer not null default 0,
  failure_count integer not null default 0,
  cursor text,
  error_code text,
  summary jsonb not null default '{}',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references public.admin_users(id) on delete set null
);

create table if not exists public.pod_product_snapshots (
  provider text not null references public.pod_provider_settings(provider) on delete restrict,
  provider_product_id text not null,
  title text not null,
  blueprint_id integer,
  print_provider_id integer,
  lifecycle_status text not null default 'active' check(lifecycle_status in ('active','unpublished','archived','removed')),
  provider_visible boolean not null default true,
  provider_locked boolean not null default false,
  variants jsonb not null default '[]',
  content_hash text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  removed_at timestamptz,
  raw_summary jsonb not null default '{}',
  primary key(provider,provider_product_id)
);

create table if not exists public.pod_provider_options (
  provider text not null references public.pod_provider_settings(provider) on delete restrict,
  provider_option_id integer not null,
  title text not null,
  country_code text,
  region text,
  supported_regions text[] not null default '{}',
  blueprint_ids integer[] not null default '{}',
  is_available boolean not null default true,
  is_preferred boolean not null default false,
  production_days_from integer,
  production_days_to integer,
  last_synced_at timestamptz not null default now(),
  primary key(provider,provider_option_id)
);

create table if not exists public.pod_shipping_rate_cache (
  provider text not null references public.pod_provider_settings(provider) on delete restrict,
  blueprint_id integer not null,
  provider_option_id integer not null,
  method text not null,
  country_code text not null,
  variant_id integer not null,
  first_item_minor integer not null check(first_item_minor >= 0),
  additional_item_minor integer not null check(additional_item_minor >= 0),
  currency text not null,
  handling_from_days integer,
  handling_to_days integer,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key(provider,blueprint_id,provider_option_id,method,country_code,variant_id)
);

create table if not exists public.pod_api_request_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  operation text not null,
  method text not null,
  endpoint_group text not null,
  status_code integer,
  duration_ms integer not null default 0,
  success boolean not null,
  rate_limit_remaining integer,
  error_code text,
  correlation_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.pod_order_snapshots (
  provider text not null references public.pod_provider_settings(provider) on delete restrict,
  provider_order_id text not null,
  external_order_id text,
  status text not null,
  total_price_minor integer,
  total_shipping_minor integer,
  tracking_numbers text[] not null default '{}',
  provider_created_at timestamptz,
  sent_to_production_at timestamptz,
  fulfilled_at timestamptz,
  last_synced_at timestamptz not null default now(),
  primary key(provider,provider_order_id)
);

create table if not exists public.pod_reconciliation_findings (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  finding_key text not null unique,
  finding_type text not null check(finding_type in ('missing_provider_order','duplicate_submission','fulfillment_failure','tracking_mismatch','status_mismatch','stalled_order')),
  severity text not null check(severity in ('low','medium','high','critical')),
  status text not null default 'open' check(status in ('open','investigating','resolved','ignored')),
  commerce_order_id uuid references public.commerce_orders(id) on delete set null,
  provider_order_id text,
  summary text not null,
  evidence jsonb not null default '{}',
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  reviewed_by uuid references public.admin_users(id) on delete set null
);

create table if not exists public.pod_provider_metrics_daily (
  provider text not null,
  provider_option_id integer not null default 0,
  metric_date date not null,
  order_count integer not null default 0,
  revenue_minor bigint not null default 0,
  successful_orders integer not null default 0,
  failed_orders integer not null default 0,
  cancelled_orders integer not null default 0,
  production_hours_total numeric not null default 0,
  shipping_hours_total numeric not null default 0,
  fulfilled_orders integer not null default 0,
  primary key(provider,provider_option_id,metric_date)
);

create index if not exists pod_sync_runs_recent_idx on public.pod_sync_runs(provider,started_at desc);
create index if not exists pod_products_status_idx on public.pod_product_snapshots(provider,lifecycle_status,last_seen_at desc);
create index if not exists pod_shipping_expiry_idx on public.pod_shipping_rate_cache(provider,expires_at);
create index if not exists pod_api_health_idx on public.pod_api_request_logs(provider,created_at desc,success);
create index if not exists pod_order_external_idx on public.pod_order_snapshots(provider,external_order_id);
create index if not exists pod_reconciliation_open_idx on public.pod_reconciliation_findings(provider,status,severity,last_detected_at desc);
create index if not exists pod_metrics_date_idx on public.pod_provider_metrics_daily(provider,metric_date desc);

alter table public.pod_provider_settings enable row level security;
alter table public.pod_sync_runs enable row level security;
alter table public.pod_product_snapshots enable row level security;
alter table public.pod_provider_options enable row level security;
alter table public.pod_shipping_rate_cache enable row level security;
alter table public.pod_api_request_logs enable row level security;
alter table public.pod_order_snapshots enable row level security;
alter table public.pod_reconciliation_findings enable row level security;
alter table public.pod_provider_metrics_daily enable row level security;

revoke all on public.pod_provider_settings,public.pod_sync_runs,public.pod_product_snapshots,public.pod_provider_options,public.pod_shipping_rate_cache,public.pod_api_request_logs,public.pod_order_snapshots,public.pod_reconciliation_findings,public.pod_provider_metrics_daily from public,anon,authenticated;
grant all on public.pod_provider_settings,public.pod_sync_runs,public.pod_product_snapshots,public.pod_provider_options,public.pod_shipping_rate_cache,public.pod_api_request_logs,public.pod_order_snapshots,public.pod_reconciliation_findings,public.pod_provider_metrics_daily to service_role;

alter table public.printify_fulfillment_jobs add column if not exists cancellation_requested_at timestamptz;
alter table public.printify_fulfillment_jobs add column if not exists last_correlation_id text;
alter table public.printify_fulfillment_jobs add column if not exists provider_confirmed_at timestamptz;

create or replace function public.record_pod_provider_metric(
  p_provider text,
  p_provider_option_id integer,
  p_order_count integer default 0,
  p_revenue_minor bigint default 0,
  p_successful_orders integer default 0,
  p_failed_orders integer default 0,
  p_cancelled_orders integer default 0,
  p_production_hours numeric default 0,
  p_shipping_hours numeric default 0,
  p_fulfilled_orders integer default 0
) returns void language plpgsql security definer set search_path=public as $$
begin
  insert into pod_provider_metrics_daily(provider,provider_option_id,metric_date,order_count,revenue_minor,successful_orders,failed_orders,cancelled_orders,production_hours_total,shipping_hours_total,fulfilled_orders)
  values(p_provider,coalesce(p_provider_option_id,0),current_date,p_order_count,p_revenue_minor,p_successful_orders,p_failed_orders,p_cancelled_orders,p_production_hours,p_shipping_hours,p_fulfilled_orders)
  on conflict(provider,provider_option_id,metric_date) do update set
    order_count=pod_provider_metrics_daily.order_count+excluded.order_count,
    revenue_minor=pod_provider_metrics_daily.revenue_minor+excluded.revenue_minor,
    successful_orders=pod_provider_metrics_daily.successful_orders+excluded.successful_orders,
    failed_orders=pod_provider_metrics_daily.failed_orders+excluded.failed_orders,
    cancelled_orders=pod_provider_metrics_daily.cancelled_orders+excluded.cancelled_orders,
    production_hours_total=pod_provider_metrics_daily.production_hours_total+excluded.production_hours_total,
    shipping_hours_total=pod_provider_metrics_daily.shipping_hours_total+excluded.shipping_hours_total,
    fulfilled_orders=pod_provider_metrics_daily.fulfilled_orders+excluded.fulfilled_orders;
end $$;
revoke all on function public.record_pod_provider_metric(text,integer,integer,bigint,integer,integer,integer,numeric,numeric,integer) from public,anon,authenticated;
grant execute on function public.record_pod_provider_metric(text,integer,integer,bigint,integer,integer,integer,numeric,numeric,integer) to service_role;
