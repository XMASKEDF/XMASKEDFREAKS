-- Optional infrastructure control evidence. Additive only: no customer, wallet,
-- order, payment, fulfillment, or media records are altered.
create table if not exists public.infrastructure_feature_flags (
  name text not null,
  environment text not null check (environment in ('LOCAL','SANDBOX','STAGING','PRODUCTION')),
  state text not null check (state in ('OFF','SANDBOX','CONTROLLED','ON')),
  percentage integer not null default 0 check (percentage between 0 and 100),
  updated_by uuid references public.admin_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (name, environment)
);

create index if not exists infrastructure_feature_flags_environment_idx on public.infrastructure_feature_flags(environment, updated_at desc);
alter table public.infrastructure_feature_flags enable row level security;

comment on table public.infrastructure_feature_flags is 'Admin-controlled rollout state; production activation requires a durable provider and approved change process.';
