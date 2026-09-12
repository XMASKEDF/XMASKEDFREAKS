-- Security hardening is additive. Existing customer, wallet, order, and maintenance records are preserved.

alter table public.admin_sessions
  add column if not exists reauthenticated_at timestamptz;

alter table public.admin_audit_events
  add column if not exists request_reference uuid,
  add column if not exists actor_role text,
  add column if not exists target_type text,
  add column if not exists target_id text,
  add column if not exists previous_state jsonb,
  add column if not exists new_state jsonb,
  add column if not exists reason text,
  add column if not exists success boolean not null default true,
  add column if not exists security_classification text not null default 'internal';

alter table public.maintenance_settings
  add column if not exists scope text not null default 'full',
  add column if not exists disabled_systems text[] not null default '{}',
  add column if not exists private_reason text,
  add column if not exists activated_by uuid references public.admin_users(id) on delete set null,
  add column if not exists activated_at timestamptz,
  add column if not exists restored_by uuid references public.admin_users(id) on delete set null,
  add column if not exists restored_at timestamptz,
  add column if not exists state_version bigint not null default 0,
  add column if not exists last_health_review jsonb not null default '{}',
  add column if not exists automatic_triggers_enabled boolean not null default false,
  add column if not exists automatic_trigger_config jsonb not null default '{}';

alter table public.maintenance_settings drop constraint if exists maintenance_settings_scope_check;
alter table public.maintenance_settings add constraint maintenance_settings_scope_check
  check (scope in ('full', 'checkout', 'live', 'commerce', 'selected'));

update public.maintenance_settings
set title = case
      when title = 'We will be right back' then 'XMASKEDFREAKS is temporarily unavailable'
      else title
    end,
    support_url = case
      when support_url is null or support_url = '/#faq' then '/policies'
      else support_url
    end
where id = 'primary';

create table if not exists public.maintenance_history (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('activate', 'restore')),
  scope text not null check (scope in ('full', 'checkout', 'live', 'commerce', 'selected')),
  reason text not null,
  public_message text,
  disabled_systems text[] not null default '{}',
  previous_state jsonb not null default '{}',
  new_state jsonb not null default '{}',
  admin_user_id uuid references public.admin_users(id) on delete set null,
  request_reference uuid not null,
  success boolean not null default true,
  security_classification text not null default 'critical',
  override_reason text,
  health_review jsonb not null default '{}',
  state_version bigint not null,
  created_at timestamptz not null default now()
);

create unique index if not exists maintenance_history_request_reference_idx
  on public.maintenance_history(request_reference);
create index if not exists maintenance_history_created_at_idx
  on public.maintenance_history(created_at desc);
create index if not exists admin_audit_events_security_idx
  on public.admin_audit_events(created_at desc, security_classification);

alter table public.maintenance_history enable row level security;
revoke all on public.maintenance_history from anon, authenticated;
revoke all on public.maintenance_settings from anon, authenticated;

create or replace function public.prevent_maintenance_history_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'maintenance history is append-only';
end $$;

drop trigger if exists maintenance_history_immutable on public.maintenance_history;
create trigger maintenance_history_immutable
before update or delete on public.maintenance_history
for each row execute function public.prevent_maintenance_history_mutation();

create or replace function public.set_emergency_maintenance(
  p_enabled boolean,
  p_scope text,
  p_public_message text,
  p_private_reason text,
  p_expected_return_at timestamptz,
  p_disabled_systems text[],
  p_allowed_routes text[],
  p_admin_user_id uuid,
  p_request_reference uuid,
  p_override_reason text default null,
  p_health_review jsonb default '{}'::jsonb
)
returns public.maintenance_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_row public.maintenance_settings%rowtype;
  updated_row public.maintenance_settings%rowtype;
  action_name text;
begin
  if p_scope not in ('full', 'checkout', 'live', 'commerce', 'selected') then
    raise exception 'invalid maintenance scope';
  end if;
  if char_length(trim(coalesce(p_private_reason, ''))) < 8 then
    raise exception 'maintenance reason is required';
  end if;
  if p_enabled and p_scope = 'selected' and coalesce(array_length(p_disabled_systems, 1), 0) = 0 then
    raise exception 'selected maintenance requires disabled systems';
  end if;
  select * into previous_row from public.maintenance_settings where id = 'primary' for update;
  if not found then
    insert into public.maintenance_settings(id) values ('primary') returning * into previous_row;
  end if;
  action_name := case when p_enabled then 'activate' else 'restore' end;
  update public.maintenance_settings set
    enabled = p_enabled,
    scope = p_scope,
    message = left(coalesce(nullif(trim(p_public_message), ''), 'XMASKEDFREAKS is temporarily unavailable.'), 1000),
    private_reason = left(trim(p_private_reason), 1000),
    expected_return_at = case when p_enabled then p_expected_return_at else null end,
    disabled_systems = case when p_enabled then coalesce(p_disabled_systems, '{}') else '{}' end,
    allowed_routes = coalesce(p_allowed_routes, allowed_routes),
    block_new_checkouts = p_enabled and (p_scope in ('full', 'checkout', 'commerce') or 'checkout' = any(coalesce(p_disabled_systems, '{}')) or 'wallet' = any(coalesce(p_disabled_systems, '{}'))),
    activated_by = case when p_enabled then p_admin_user_id else activated_by end,
    activated_at = case when p_enabled then now() else activated_at end,
    restored_by = case when p_enabled then null else p_admin_user_id end,
    restored_at = case when p_enabled then null else now() end,
    state_version = state_version + 1,
    last_health_review = coalesce(p_health_review, '{}'::jsonb),
    updated_by = p_admin_user_id,
    updated_at = now()
  where id = 'primary'
  returning * into updated_row;

  insert into public.maintenance_history(
    action, scope, reason, public_message, disabled_systems, previous_state, new_state,
    admin_user_id, request_reference, success, security_classification, override_reason,
    health_review, state_version
  ) values (
    action_name, p_scope, left(trim(p_private_reason), 1000), left(coalesce(p_public_message, ''), 1000),
    coalesce(p_disabled_systems, '{}'), to_jsonb(previous_row), to_jsonb(updated_row),
    p_admin_user_id, p_request_reference, true, 'critical', nullif(left(trim(coalesce(p_override_reason, '')), 1000), ''),
    coalesce(p_health_review, '{}'::jsonb), updated_row.state_version
  );
  return updated_row;
end $$;

revoke all on function public.set_emergency_maintenance(boolean,text,text,text,timestamptz,text[],text[],uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.set_emergency_maintenance(boolean,text,text,text,timestamptz,text[],text[],uuid,uuid,text,jsonb) to service_role;

comment on table public.maintenance_history is 'Append-only critical security evidence for maintenance activation and restoration.';
comment on column public.admin_sessions.reauthenticated_at is 'Last successful password reauthentication for critical administrator actions.';
