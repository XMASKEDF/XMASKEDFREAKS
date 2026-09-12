create table if not exists public.audio_products (
  id uuid primary key default gen_random_uuid(),
  slot_number integer not null unique check (slot_number between 1 and 6),
  name text not null default '',
  description text not null default '',
  coin_price integer not null default 25 check (coin_price between 1 and 100000),
  thumbnail_path text,
  product_file_path text,
  preview_file_path text,
  media_type text not null default 'audio' check (media_type in ('audio', 'video')),
  mime_type text,
  file_extension text check (file_extension is null or file_extension in ('mp3', 'm4a', 'wav', 'aac', 'mp4')),
  file_size bigint check (file_size is null or file_size > 0),
  original_filename text,
  preview_mime_type text,
  preview_extension text,
  preview_file_size bigint,
  is_active boolean not null default false,
  is_published boolean not null default false,
  allow_repurchase boolean not null default false,
  updated_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.audio_products (slot_number, name, description, coin_price)
select slot, 'Audio experience ' || lpad(slot::text, 2, '0'), 'This downloadable product is being prepared by XMASKEDFREAKS.', 25
from generate_series(1, 6) as slot
on conflict (slot_number) do nothing;

create table if not exists public.audio_carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audio_cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.audio_carts(id) on delete cascade,
  product_id uuid not null references public.audio_products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (cart_id, product_id)
);

create table if not exists public.digital_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  total_coins integer not null check (total_coins > 0),
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed', 'refunded')),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.digital_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.digital_orders(id) on delete cascade,
  product_id uuid references public.audio_products(id) on delete set null,
  product_name_snapshot text not null,
  coin_price_snapshot integer not null check (coin_price_snapshot > 0),
  file_path_snapshot text not null,
  mime_type_snapshot text not null,
  file_extension_snapshot text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.audio_products(id) on delete cascade,
  order_item_id uuid not null references public.digital_order_items(id) on delete cascade,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  download_count integer not null default 0 check (download_count >= 0),
  last_downloaded_at timestamptz,
  unique (user_id, product_id)
);

create table if not exists public.audio_store_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  admin_user_id uuid references public.admin_users(id) on delete set null,
  event_type text not null,
  product_id uuid references public.audio_products(id) on delete set null,
  order_id uuid references public.digital_orders(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audio_products_storefront_idx on public.audio_products(is_published, is_active, slot_number);
create index if not exists audio_cart_items_cart_idx on public.audio_cart_items(cart_id, created_at);
create index if not exists digital_orders_user_idx on public.digital_orders(user_id, created_at desc);
create index if not exists purchase_entitlements_user_idx on public.purchase_entitlements(user_id, granted_at desc) where revoked_at is null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('audio-products', 'audio-products', false, 262144000, array['audio/mpeg','audio/mp4','audio/x-m4a','audio/wav','audio/x-wav','audio/aac','video/mp4']),
  ('audio-previews', 'audio-previews', false, 52428800, array['audio/mpeg','audio/mp4','audio/x-m4a','audio/wav','audio/x-wav','audio/aac','video/mp4']),
  ('audio-thumbnails', 'audio-thumbnails', false, 15728640, array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop function if exists public.checkout_audio_cart(uuid, text);
create or replace function public.checkout_audio_cart(p_user_id uuid, p_idempotency_key text, p_expected_total integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_cart uuid;
  selected_order uuid;
  existing_order public.digital_orders%rowtype;
  item_count integer;
  valid_count integer;
  purchase_total integer;
  balance_before bigint;
  balance_after bigint;
begin
  if p_idempotency_key is null or char_length(trim(p_idempotency_key)) < 12 then
    raise exception 'IDEMPOTENCY_REQUIRED';
  end if;

  select * into existing_order from public.digital_orders where idempotency_key = p_idempotency_key and user_id = p_user_id;
  if found then
    return jsonb_build_object('duplicate', true, 'orderId', existing_order.id, 'totalCoins', existing_order.total_coins);
  end if;

  select id into selected_cart from public.audio_carts where user_id = p_user_id for update;
  if selected_cart is null then raise exception 'CART_EMPTY'; end if;

  select count(*) into item_count from public.audio_cart_items where cart_id = selected_cart;
  if item_count = 0 then raise exception 'CART_EMPTY'; end if;

  select count(*), coalesce(sum(p.coin_price), 0)
  into valid_count, purchase_total
  from public.audio_cart_items ci
  join public.audio_products p on p.id = ci.product_id
  where ci.cart_id = selected_cart
    and p.is_active and p.is_published and p.product_file_path is not null
    and (p.allow_repurchase or not exists (
      select 1 from public.purchase_entitlements e
      where e.user_id = p_user_id and e.product_id = p.id and e.revoked_at is null
    ));

  if valid_count <> item_count then raise exception 'PRODUCT_UNAVAILABLE'; end if;
  if p_expected_total is not null and p_expected_total <> purchase_total then raise exception 'PRICE_CHANGED'; end if;

  insert into public.token_wallets (user_id, balance_tokens) values (p_user_id, 0) on conflict (user_id) do nothing;
  select balance_tokens into balance_before from public.token_wallets where user_id = p_user_id for update;
  if balance_before < purchase_total then raise exception 'INSUFFICIENT_TOKENS'; end if;
  balance_after := balance_before - purchase_total;

  insert into public.digital_orders (user_id, total_coins, status, idempotency_key, completed_at)
  values (p_user_id, purchase_total, 'completed', p_idempotency_key, now()) returning id into selected_order;

  insert into public.digital_order_items (order_id, product_id, product_name_snapshot, coin_price_snapshot, file_path_snapshot, mime_type_snapshot, file_extension_snapshot)
  select selected_order, p.id, p.name, p.coin_price, p.product_file_path, p.mime_type, p.file_extension
  from public.audio_cart_items ci join public.audio_products p on p.id = ci.product_id where ci.cart_id = selected_cart;

  insert into public.purchase_entitlements (user_id, product_id, order_item_id)
  select p_user_id, oi.product_id, oi.id from public.digital_order_items oi where oi.order_id = selected_order
  on conflict (user_id, product_id) do update set order_item_id = excluded.order_item_id, granted_at = now(), revoked_at = null;

  update public.token_wallets set balance_tokens = balance_after, updated_at = now() where user_id = p_user_id;
  insert into public.wallet_transactions (user_id, transaction_type, amount, balance_after, total_coins, idempotency_key, status, note, final_transaction_result)
  values (p_user_id, 'AUDIO_STORE_PURCHASE', 0, balance_after, -purchase_total, p_idempotency_key, 'confirmed', 'XMASKEDFREAKS AC digital purchase', 'completed');
  delete from public.audio_cart_items where cart_id = selected_cart;
  update public.audio_carts set updated_at = now() where id = selected_cart;
  insert into public.audio_store_audit_events (actor_user_id, event_type, order_id, metadata)
  values (p_user_id, 'audio_checkout_completed', selected_order, jsonb_build_object('totalCoins', purchase_total, 'itemCount', item_count));

  return jsonb_build_object('duplicate', false, 'orderId', selected_order, 'totalCoins', purchase_total, 'tokenBalance', balance_after, 'itemCount', item_count);
end;
$$;

revoke all on function public.checkout_audio_cart(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.checkout_audio_cart(uuid, text, integer) to service_role;

alter table public.audio_products enable row level security;
alter table public.audio_carts enable row level security;
alter table public.audio_cart_items enable row level security;
alter table public.digital_orders enable row level security;
alter table public.digital_order_items enable row level security;
alter table public.purchase_entitlements enable row level security;
alter table public.audio_store_audit_events enable row level security;

create policy "Published audio products are public" on public.audio_products for select using (is_active and is_published);
create policy "Users read own audio cart" on public.audio_carts for select using (auth.uid() = user_id);
create policy "Users read own audio cart items" on public.audio_cart_items for select using (exists (select 1 from public.audio_carts c where c.id = cart_id and c.user_id = auth.uid()));
create policy "Users read own digital orders" on public.digital_orders for select using (auth.uid() = user_id);
create policy "Users read own digital order items" on public.digital_order_items for select using (exists (select 1 from public.digital_orders o where o.id = order_id and o.user_id = auth.uid()));
create policy "Users read own purchase entitlements" on public.purchase_entitlements for select using (auth.uid() = user_id);
