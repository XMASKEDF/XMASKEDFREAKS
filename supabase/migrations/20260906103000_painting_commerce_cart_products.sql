-- Keep one-off painting Buy Now inventory in the shared commerce cart catalog.
-- Bids and the existing auction settlement path remain separate.
create or replace function public.sync_painting_commerce_product() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.commerce_products (
    id, product_type, source_product_id, title, short_description, full_description,
    coin_price, sku, image_url, inventory_tracking_enabled, inventory_quantity,
    requires_shipping, requires_size, international_shipping_allowed, quantity_limit,
    digital_file_path, digital_mime_type, digital_file_extension, is_active, is_published,
    is_featured, sort_order
  ) values (
    new.id, 'painting', new.id, new.title, new.short_description, new.full_description,
    coalesce(new.buy_now_price, greatest(new.current_bid, new.starting_bid)),
    'PAINT-' || upper(substr(replace(new.id::text, '-', ''), 1, 8)),
    coalesce(new.images->>greatest(new.cover_image_index, 0), '/branding/optimized/mask-logo-512.png'),
    true,
    case when new.buy_now_price is not null and new.status in ('live', 'extended') and new.is_published then 1 else 0 end,
    true,
    false,
    coalesce(new.international_shipping, true),
    1,
    null, null, null,
    new.buy_now_price is not null and new.status in ('live', 'extended') and new.is_published,
    new.buy_now_price is not null and new.status in ('live', 'extended') and new.is_published,
    new.is_featured,
    1000
  )
  on conflict (id) do update set
    title=excluded.title,
    short_description=excluded.short_description,
    full_description=excluded.full_description,
    coin_price=excluded.coin_price,
    image_url=excluded.image_url,
    inventory_quantity=excluded.inventory_quantity,
    international_shipping_allowed=excluded.international_shipping_allowed,
    is_active=excluded.is_active,
    is_published=excluded.is_published,
    is_featured=excluded.is_featured,
    updated_at=now();
  return new;
end $$;

create or replace function public.retire_painting_commerce_product() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  update public.commerce_products
  set is_active=false, is_published=false, inventory_quantity=0, updated_at=now()
  where id=old.id;
  return old;
end $$;

insert into public.commerce_products (
  id, product_type, source_product_id, title, short_description, full_description,
  coin_price, sku, image_url, inventory_tracking_enabled, inventory_quantity,
  requires_shipping, requires_size, international_shipping_allowed, quantity_limit,
  is_active, is_published, is_featured, sort_order
)
select
  a.id, 'painting', a.id, a.title, a.short_description, a.full_description,
  coalesce(a.buy_now_price, greatest(a.current_bid, a.starting_bid)),
  'PAINT-' || upper(substr(replace(a.id::text, '-', ''), 1, 8)),
  coalesce(a.images->>greatest(a.cover_image_index, 0), '/branding/optimized/mask-logo-512.png'),
  true,
  case when a.buy_now_price is not null and a.status in ('live', 'extended') and a.is_published then 1 else 0 end,
  true, false, coalesce(a.international_shipping, true), 1,
  a.buy_now_price is not null and a.status in ('live', 'extended') and a.is_published,
  a.buy_now_price is not null and a.status in ('live', 'extended') and a.is_published,
  a.is_featured, 1000
from public.painting_auctions a
on conflict (id) do update set
  title=excluded.title,
  short_description=excluded.short_description,
  full_description=excluded.full_description,
  coin_price=excluded.coin_price,
  image_url=excluded.image_url,
  inventory_quantity=excluded.inventory_quantity,
  international_shipping_allowed=excluded.international_shipping_allowed,
  is_active=excluded.is_active,
  is_published=excluded.is_published,
  is_featured=excluded.is_featured,
  updated_at=now();

drop trigger if exists painting_commerce_product_sync on public.painting_auctions;
create trigger painting_commerce_product_sync
after insert or update on public.painting_auctions
for each row execute function public.sync_painting_commerce_product();

drop trigger if exists painting_commerce_product_retire on public.painting_auctions;
create trigger painting_commerce_product_retire
after delete on public.painting_auctions
for each row execute function public.retire_painting_commerce_product();
