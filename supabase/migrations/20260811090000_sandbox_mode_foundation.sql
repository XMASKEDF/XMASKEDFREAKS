create table if not exists public.sandbox_settings (
  id text primary key default 'primary' check (id = 'primary'),
  enabled boolean not null default false,
  updated_by uuid references public.admin_users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.sandbox_settings(id, enabled) values ('primary', false) on conflict (id) do nothing;
alter table public.sandbox_settings enable row level security;
revoke all on public.sandbox_settings from public, anon, authenticated;
alter table public.analytics_events add column if not exists environment text not null default 'production' check (environment in ('production','sandbox'));
create index if not exists analytics_events_environment_idx on public.analytics_events(environment, occurred_at desc);
alter table public.analytics_events add column if not exists source text;
alter table public.analytics_events add column if not exists medium text;
alter table public.analytics_events add column if not exists campaign text;
alter table public.analytics_events add column if not exists content text;
alter table public.analytics_events add column if not exists landing_page text;
create index if not exists analytics_events_source_idx on public.analytics_events(source, occurred_at desc);
