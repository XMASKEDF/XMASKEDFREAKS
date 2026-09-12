alter table public.profiles drop constraint if exists profiles_display_name_check;
alter table public.profiles add constraint profiles_display_name_check check (char_length(display_name) between 3 and 20);
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists preferred_language text not null default 'en';
alter table public.profiles add column if not exists product_updates_enabled boolean not null default true;

create unique index if not exists profiles_display_name_case_insensitive_idx on public.profiles (lower(display_name));

create or replace function public.nickname_available(candidate text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles
    where lower(display_name) = lower(btrim(candidate))
  );
$$;

revoke all on function public.nickname_available(text) from public;
grant execute on function public.nickname_available(text) to anon, authenticated, service_role;

create or replace function public.nickname_is_allowed(value text)
returns boolean
language sql
immutable
as $$
  select value = btrim(value)
    and char_length(value) between 3 and 20
    and value ~ '^[A-Za-z0-9_]+$'
    and lower(value) <> all(array[
      'admin','administrator','atlas','claude','echo','ledger','maya','moderator','nova','pixel',
      'riley','root','route','sage','staff','support','system','todd','xmaskedfreaks'
    ])
    and lower(value) not similar to '%(fuck|nigger|nigga|faggot|retard|cunt)%';
$$;

create or replace function public.enforce_customer_nickname()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.nickname_is_allowed(new.display_name) then
    raise exception 'INVALID_NICKNAME';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_customer_nickname_trigger on public.profiles;
create trigger enforce_customer_nickname_trigger
before insert or update of display_name on public.profiles
for each row execute function public.enforce_customer_nickname();

create or replace function public.handle_new_customer_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 'Member_' || left(new.id::text, 8))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_customer_profile on auth.users;
create trigger on_auth_user_created_customer_profile
after insert on auth.users
for each row execute function public.handle_new_customer_profile();

create table if not exists public.customer_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  product_type text not null check (product_type in ('merch','audio','painting','digital','physical','future')),
  title_snapshot text not null,
  image_url_snapshot text not null default '',
  href_snapshot text not null default '/',
  created_at timestamptz not null default now(),
  unique (user_id, product_type, product_id)
);

create table if not exists public.customer_recent_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  product_type text not null,
  title_snapshot text not null,
  image_url_snapshot text not null default '',
  href_snapshot text not null default '/',
  viewed_at timestamptz not null default now(),
  unique (user_id, product_type, product_id)
);

create table if not exists public.customer_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_type text not null,
  title text not null,
  detail text not null default '',
  resource_type text,
  resource_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_whats_new (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  product_type text not null check (product_type in ('merch','audio','painting','upcoming','announcement','digital','physical')),
  title text not null,
  image_url text not null default '',
  href text not null default '/',
  badge text not null default 'NEW',
  published boolean not null default false,
  pinned boolean not null default false,
  display_order integer not null default 100,
  published_at timestamptz,
  expires_at timestamptz,
  updated_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_admin_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  admin_user_id uuid not null references public.admin_users(id) on delete restrict,
  action_type text not null check (action_type in ('balance_adjustment','promotional_coins','refund','profile_review')),
  coin_amount integer not null default 0,
  reason text not null,
  wallet_transaction_id uuid references public.wallet_transactions(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists customer_recent_views_user_idx on public.customer_recent_views (user_id, viewed_at desc);
create index if not exists customer_favorites_user_idx on public.customer_favorites (user_id, created_at desc);
create index if not exists customer_activity_user_idx on public.customer_activity (user_id, created_at desc);
create index if not exists customer_whats_new_published_idx on public.customer_whats_new (pinned desc, published_at desc) where published = true;

alter table public.customer_favorites enable row level security;
alter table public.customer_recent_views enable row level security;
alter table public.customer_activity enable row level security;
alter table public.customer_whats_new enable row level security;
alter table public.customer_admin_actions enable row level security;

drop policy if exists "Customers manage own favorites" on public.customer_favorites;
create policy "Customers manage own favorites" on public.customer_favorites for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Customers manage own recent views" on public.customer_recent_views;
create policy "Customers manage own recent views" on public.customer_recent_views for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Customers read own activity" on public.customer_activity;
create policy "Customers read own activity" on public.customer_activity for select using (auth.uid() = user_id);
drop policy if exists "Visitors read published whats new" on public.customer_whats_new;
create policy "Visitors read published whats new" on public.customer_whats_new for select using (published = true and (expires_at is null or expires_at > now()));
drop policy if exists "Customers read own admin actions" on public.customer_admin_actions;
create policy "Customers read own admin actions" on public.customer_admin_actions for select using (auth.uid() = user_id);

create or replace function public.admin_adjust_customer_wallet(
  p_admin_id uuid,
  p_user_id uuid,
  p_coin_amount integer,
  p_action_type text,
  p_reason text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_balance bigint;
  next_balance bigint;
  transaction_id uuid;
begin
  if not exists (
    select 1 from public.admin_users
    where id = p_admin_id
      and role = 'ADMIN'
      and two_factor_required = true
      and (locked_until is null or locked_until < now())
  ) then raise exception 'ADMIN_REQUIRED'; end if;
  if p_action_type not in ('balance_adjustment','promotional_coins','refund') then raise exception 'INVALID_ACTION'; end if;
  if char_length(btrim(p_reason)) < 4 then raise exception 'REASON_REQUIRED'; end if;

  select id into transaction_id from public.wallet_transactions where idempotency_key = p_idempotency_key;
  if transaction_id is not null then
    select balance_tokens into current_balance from public.token_wallets where user_id = p_user_id;
    return jsonb_build_object('duplicate', true, 'transactionId', transaction_id, 'tokenBalance', coalesce(current_balance, 0));
  end if;

  insert into public.token_wallets (user_id, balance_tokens) values (p_user_id, 0) on conflict (user_id) do nothing;
  select balance_tokens into current_balance from public.token_wallets where user_id = p_user_id for update;
  next_balance := current_balance + p_coin_amount;
  if next_balance < 0 then raise exception 'NEGATIVE_BALANCE'; end if;

  update public.token_wallets set balance_tokens = next_balance, updated_at = now() where user_id = p_user_id;
  insert into public.wallet_transactions (
    user_id, transaction_type, amount, balance_after, total_coins, idempotency_key, status, note, final_transaction_result
  ) values (
    p_user_id, upper(p_action_type), 0, next_balance, p_coin_amount, p_idempotency_key, 'confirmed', btrim(p_reason), 'confirmed'
  ) returning id into transaction_id;
  insert into public.customer_admin_actions (user_id, admin_user_id, action_type, coin_amount, reason, wallet_transaction_id)
  values (p_user_id, p_admin_id, p_action_type, p_coin_amount, btrim(p_reason), transaction_id);
  insert into public.customer_activity (user_id, activity_type, title, detail)
  values (p_user_id, p_action_type, case when p_coin_amount >= 0 then 'Coins added' else 'Balance adjusted' end, btrim(p_reason));
  return jsonb_build_object('duplicate', false, 'transactionId', transaction_id, 'tokenBalance', next_balance);
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.token_wallets;
exception when duplicate_object then null;
end $$;
