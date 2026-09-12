-- Retire the built-in Shorts merchandise category without deleting history.
-- Orders, order-item snapshots, accounting, analytics, and Printify references
-- remain intact. The category and any linked products are simply unpublished.

update public.commerce_products product
set is_active = false,
    is_published = false,
    fulfillment_enabled = false,
    updated_at = now()
from public.merch_categories category
where product.category_id = category.id
  and lower(trim(category.slug)) in ('shorts', 'short');

update public.product_variants variant
set is_active = false,
    fulfillment_available = false,
    updated_at = now()
from public.commerce_products product
join public.merch_categories category on category.id = product.category_id
where variant.product_id = product.id
  and lower(trim(category.slug)) in ('shorts', 'short');

update public.merch_categories
set is_active = false,
    is_hidden = true,
    updated_at = now()
where lower(trim(slug)) in ('shorts', 'short');

comment on table public.merch_categories is 'Merch categories. The built-in shorts slug is retired by 20260821_retire_shorts_merch_category.sql; historical references remain preserved.';
