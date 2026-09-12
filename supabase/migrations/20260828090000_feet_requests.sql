-- Feet Requests uses the existing token wallet and audit/accounting boundaries.
-- Preset edits never rewrite historical paid request snapshots.
create table if not exists public.feet_request_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (char_length(slug) between 1 and 80),
  thumbnail_url text,
  description text not null check (char_length(description) between 1 and 500),
  coin_price integer not null check (coin_price > 0),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'ACTIVE', 'HIDDEN', 'ARCHIVED')),
  display_order integer not null default 1 check (display_order > 0),
  created_by uuid references public.admin_users(id) on delete set null,
  updated_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feet_request_presets_public_idx on public.feet_request_presets(status, display_order);

create table if not exists public.feet_requests (
  id uuid primary key default gen_random_uuid(),
  preset_id uuid references public.feet_request_presets(id) on delete set null,
  customer_id uuid not null references auth.users(id) on delete restrict,
  customer_reference text not null,
  preset_name_snapshot text not null,
  preset_description_snapshot text not null,
  thumbnail_url_snapshot text,
  request_details text not null default '' check (char_length(request_details) <= 1000),
  coins_paid integer not null check (coins_paid > 0),
  usd_value_minor bigint not null check (usd_value_minor >= 0),
  status text not null default 'PAID' check (status in ('PAID', 'RECEIVED', 'IN REVIEW', 'ACCEPTED', 'IN PROGRESS', 'COMPLETED', 'DECLINED', 'REFUNDED', 'CANCELED')),
  admin_notes text not null default '' check (char_length(admin_notes) <= 1000),
  idempotency_key text not null unique,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feet_requests_customer_idx on public.feet_requests(customer_id, created_at desc);
create index if not exists feet_requests_status_idx on public.feet_requests(status, created_at desc);

create table if not exists public.feet_request_status_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.feet_requests(id) on delete cascade,
  status text not null check (status in ('PAID', 'RECEIVED', 'IN REVIEW', 'ACCEPTED', 'IN PROGRESS', 'COMPLETED', 'DECLINED', 'REFUNDED', 'CANCELED')),
  actor_user_id uuid references auth.users(id) on delete set null,
  note text not null default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists feet_request_status_history_request_idx on public.feet_request_status_history(request_id, created_at desc);

alter table public.feet_request_presets enable row level security;
alter table public.feet_requests enable row level security;
alter table public.feet_request_status_history enable row level security;
revoke all on public.feet_request_presets, public.feet_requests, public.feet_request_status_history from public, anon, authenticated;

create or replace function public.create_feet_request(
  p_user_id uuid,
  p_preset_id uuid,
  p_request_details text,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_existing public.feet_requests%rowtype;
  v_preset public.feet_request_presets%rowtype;
  v_before bigint;
  v_after bigint;
  v_request public.feet_requests%rowtype;
begin
  if p_user_id is null or p_preset_id is null or length(coalesce(p_idempotency_key, '')) = 0 then
    raise exception 'INVALID_REQUEST';
  end if;

  select * into v_existing from public.feet_requests where idempotency_key = p_idempotency_key limit 1;
  if found then
    select balance_tokens into v_after from public.token_wallets where user_id = p_user_id;
    return jsonb_build_object('duplicate', true, 'requestId', v_existing.id, 'tokenBalance', coalesce(v_after, 0), 'status', v_existing.status);
  end if;

  select * into v_preset from public.feet_request_presets where id = p_preset_id and status = 'ACTIVE' for update;
  if not found then raise exception 'PRESET_UNAVAILABLE'; end if;

  insert into public.token_wallets(user_id, balance_tokens) values (p_user_id, 0) on conflict (user_id) do nothing;
  select balance_tokens into v_before from public.token_wallets where user_id = p_user_id for update;
  if coalesce(v_before, 0) < v_preset.coin_price then raise exception 'INSUFFICIENT_TOKENS'; end if;
  v_after := v_before - v_preset.coin_price;

  update public.token_wallets set balance_tokens = v_after, updated_at = now() where user_id = p_user_id;
  insert into public.feet_requests (preset_id, customer_id, customer_reference, preset_name_snapshot, preset_description_snapshot, thumbnail_url_snapshot, request_details, coins_paid, usd_value_minor, status, idempotency_key)
  values (v_preset.id, p_user_id, left(p_user_id::text, 12), v_preset.name, v_preset.description, v_preset.thumbnail_url, left(coalesce(p_request_details, ''), 1000), v_preset.coin_price, v_preset.coin_price * 50, 'PAID', p_idempotency_key)
  returning * into v_request;

  insert into public.wallet_transactions(user_id, transaction_type, amount, balance_after, total_coins, idempotency_key, status, note, final_transaction_result)
  values (p_user_id, 'FEET_REQUEST', 0, v_after, -v_preset.coin_price, p_idempotency_key, 'confirmed', 'Feet Request — ' || v_preset.name, 'confirmed');
  insert into public.feet_request_status_history(request_id, status, actor_user_id, note) values (v_request.id, 'PAID', p_user_id, 'Request payment confirmed.');
  return jsonb_build_object('duplicate', false, 'requestId', v_request.id, 'tokenBalance', v_after, 'status', v_request.status, 'coinsPaid', v_request.coins_paid);
end;
$$;

create or replace function public.update_feet_request_status(
  p_request_id uuid,
  p_status text,
  p_admin_id uuid,
  p_admin_notes text default ''
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_request public.feet_requests%rowtype;
begin
  if p_status not in ('PAID', 'RECEIVED', 'IN REVIEW', 'ACCEPTED', 'IN PROGRESS', 'COMPLETED', 'DECLINED', 'REFUNDED', 'CANCELED') then raise exception 'INVALID_STATUS'; end if;
  update public.feet_requests set status = p_status, admin_notes = left(coalesce(p_admin_notes, ''), 1000), updated_at = now() where id = p_request_id returning * into v_request;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  insert into public.feet_request_status_history(request_id, status, actor_user_id, note) values (v_request.id, p_status, p_admin_id, left(coalesce(p_admin_notes, ''), 1000));
  return jsonb_build_object('requestId', v_request.id, 'status', v_request.status);
end;
$$;

create or replace function public.refund_feet_request(
  p_request_id uuid,
  p_admin_id uuid,
  p_admin_notes text default ''
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_request public.feet_requests%rowtype;
  v_balance bigint;
  v_after bigint;
begin
  select * into v_request from public.feet_requests where id = p_request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if v_request.status = 'REFUNDED' then return jsonb_build_object('duplicate', true, 'requestId', v_request.id, 'status', v_request.status); end if;
  if v_request.status = 'CANCELED' then raise exception 'REQUEST_NOT_REFUNDABLE'; end if;

  insert into public.token_wallets(user_id, balance_tokens) values (v_request.customer_id, 0) on conflict (user_id) do nothing;
  select balance_tokens into v_balance from public.token_wallets where user_id = v_request.customer_id for update;
  v_after := coalesce(v_balance, 0) + v_request.coins_paid;
  update public.token_wallets set balance_tokens = v_after, updated_at = now() where user_id = v_request.customer_id;
  insert into public.wallet_transactions(user_id, transaction_type, amount, balance_after, total_coins, idempotency_key, status, note, final_transaction_result)
  values (v_request.customer_id, 'FEET_REQUEST_REFUND', 0, v_after, v_request.coins_paid, 'feet-refund:' || v_request.id::text, 'confirmed', 'Feet Request refund — ' || v_request.preset_name_snapshot, 'confirmed');
  update public.feet_requests set status = 'REFUNDED', refunded_at = now(), admin_notes = left(coalesce(p_admin_notes, ''), 1000), updated_at = now() where id = v_request.id;
  insert into public.feet_request_status_history(request_id, status, actor_user_id, note) values (v_request.id, 'REFUNDED', p_admin_id, left(coalesce(p_admin_notes, ''), 1000));
  return jsonb_build_object('duplicate', false, 'requestId', v_request.id, 'status', 'REFUNDED', 'tokenBalance', v_after);
end;
$$;

create or replace function public.reorder_feet_request_preset(p_preset_id uuid, p_direction integer)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_current integer;
  v_neighbor_id uuid;
  v_neighbor_order integer;
begin
  select display_order into v_current from public.feet_request_presets where id = p_preset_id for update;
  if not found then raise exception 'PRESET_NOT_FOUND'; end if;
  if p_direction < 0 then
    select id, display_order into v_neighbor_id, v_neighbor_order from public.feet_request_presets where display_order < v_current order by display_order desc limit 1 for update;
  else
    select id, display_order into v_neighbor_id, v_neighbor_order from public.feet_request_presets where display_order > v_current order by display_order asc limit 1 for update;
  end if;
  if v_neighbor_id is null then return jsonb_build_object('moved', false); end if;
  update public.feet_request_presets set display_order = v_neighbor_order, updated_at = now() where id = p_preset_id;
  update public.feet_request_presets set display_order = v_current, updated_at = now() where id = v_neighbor_id;
  return jsonb_build_object('moved', true);
end;
$$;

revoke all on function public.create_feet_request(uuid, uuid, text, text), public.update_feet_request_status(uuid, text, uuid, text), public.refund_feet_request(uuid, uuid, text), public.reorder_feet_request_preset(uuid, integer) from public, anon, authenticated;
grant execute on function public.create_feet_request(uuid, uuid, text, text), public.update_feet_request_status(uuid, text, uuid, text), public.refund_feet_request(uuid, uuid, text), public.reorder_feet_request_preset(uuid, integer) to service_role;
