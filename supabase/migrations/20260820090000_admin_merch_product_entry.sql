-- Additive fields for the shared Admin Merch product-entry flow.
-- Existing coin prices, orders, inventory, media, and fulfillment mappings remain authoritative.

-- Restore the built-in category set only when a row is missing. Existing Admin
-- category names, ordering, visibility, and custom metadata are preserved.
insert into public.merch_categories (name, slug, icon, sort_order)
values
  ('Hoodies', 'hoodies', '◈', 2),
  ('Hats', 'hats', '⌂', 4)
on conflict (slug) do nothing;

update public.commerce_products product
set category_id = category.id
from public.merch_categories category
where product.sku = 'HD-BLK'
  and category.slug = 'hoodies';

alter table public.commerce_products add column if not exists price_minor integer;
alter table public.commerce_products add column if not exists shipping_cost_minor integer not null default 0;
alter table public.commerce_products add column if not exists shipping_mode text not null default 'manual';
alter table public.commerce_products add column if not exists fulfillment_type text not null default 'manual';

update public.commerce_products
set price_minor = coin_price * 50
where price_minor is null;

alter table public.commerce_products drop constraint if exists commerce_products_price_minor_check;
alter table public.commerce_products add constraint commerce_products_price_minor_check check (price_minor is null or price_minor >= 0);
alter table public.commerce_products drop constraint if exists commerce_products_shipping_mode_check;
alter table public.commerce_products add constraint commerce_products_shipping_mode_check check (shipping_mode in ('manual','provider','free'));
alter table public.commerce_products drop constraint if exists commerce_products_fulfillment_type_check;
alter table public.commerce_products add constraint commerce_products_fulfillment_type_check check (fulfillment_type in ('manual','printify'));

create index if not exists commerce_products_public_category_idx on public.commerce_products(category_id,is_active,is_published,sort_order);
