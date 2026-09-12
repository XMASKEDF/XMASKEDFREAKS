create extension if not exists pgcrypto;

create table if not exists public.merch_categories (
  id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique,
  icon text not null default '◇', image_url text, sort_order integer not null default 100,
  is_active boolean not null default true, is_hidden boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

insert into public.merch_categories (name, slug, icon, sort_order) values
  ('Clothes','clothes','◫',1), ('Mugs','mugs','◉',2), ('Stickers','stickers','◇',3)
on conflict (slug) do nothing;

create table if not exists public.commerce_products (
  id uuid primary key default gen_random_uuid(), slot_number integer,
  product_type text not null check (product_type in ('digital','physical','painting','subscription')),
  source_product_id uuid, title text not null, short_description text not null default '', full_description text not null default '',
  category_id uuid references public.merch_categories(id) on delete restrict, coin_price integer not null check (coin_price > 0),
  sku text, image_url text, secondary_image_url text, additional_images jsonb not null default '[]'::jsonb,
  inventory_tracking_enabled boolean not null default false, inventory_quantity integer not null default 0 check (inventory_quantity >= 0),
  requires_shipping boolean not null default false, requires_size boolean not null default false,
  international_shipping_allowed boolean not null default false, quantity_limit integer not null default 1 check (quantity_limit between 1 and 100),
  low_stock_threshold integer not null default 0 check (low_stock_threshold >= 0), weight_grams integer,
  dimensions jsonb, digital_file_path text, digital_mime_type text, digital_file_extension text,
  is_active boolean not null default false, is_published boolean not null default false, is_featured boolean not null default false,
  sort_order integer not null default 100, updated_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (product_type, slot_number), unique (source_product_id)
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.commerce_products(id) on delete cascade,
  sku text not null unique, size text, color text, style text, material text, pack_quantity integer,
  inventory_quantity integer not null default 0 check (inventory_quantity >= 0), coin_price_override integer check (coin_price_override > 0),
  image_url text, is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

with categories as (select id, slug from public.merch_categories), slots as (
  select * from (values
    (1,'clothes','Masked Signature Tee','Heavyweight black tee with the official mask mark.',180,'TEE-BLK',24,true),
    (2,'clothes','After Dark Hoodie','Soft heavyweight hoodie built for late sessions.',360,'HD-BLK',18,true),
    (3,'mugs','Midnight Studio Mug','Matte black ceramic mug with a clean green detail.',120,'MUG-BLK',30,false),
    (4,'mugs','Creator Heat Mug','Gloss black mug made for the control room.',140,'MUG-HT',16,false),
    (5,'stickers','Mask Mark Pack','Weather-resistant mask and wordmark sticker set.',45,'STK-MASK',60,false),
    (6,'stickers','Neon Signal Pack','Six premium vinyl accents for laptops and cases.',55,'STK-NEON',42,false)
  ) as seed(slot_number,category_slug,title,description,price,sku,inventory,requires_size)
)
insert into public.commerce_products (slot_number,product_type,title,short_description,full_description,category_id,coin_price,sku,image_url,inventory_tracking_enabled,inventory_quantity,requires_shipping,requires_size,international_shipping_allowed,quantity_limit,low_stock_threshold,is_active,is_published,sort_order)
select s.slot_number,'physical',s.title,s.description,s.description,c.id,s.price,s.sku,'/branding/optimized/mask-logo-512.png',true,s.inventory,true,s.requires_size,s.slot_number <> 2,case when s.category_slug='stickers' then 6 else 3 end,5,true,true,s.slot_number
from slots s join categories c on c.slug=s.category_slug on conflict (product_type,slot_number) do nothing;

insert into public.product_variants (product_id,sku,size,color,material,inventory_quantity)
select p.id,p.sku||'-'||size,size,'Black','Cotton blend',greatest(1,floor(p.inventory_quantity / 7.0)::integer)
from public.commerce_products p cross join unnest(array['XS','S','M','L','XL','2XL','3XL']) size
where p.product_type='physical' and p.requires_size on conflict (sku) do nothing;

insert into public.commerce_products (id,slot_number,product_type,source_product_id,title,short_description,full_description,coin_price,sku,image_url,inventory_tracking_enabled,inventory_quantity,requires_shipping,quantity_limit,digital_file_path,digital_mime_type,digital_file_extension,is_active,is_published,sort_order)
select id,slot_number,'digital',id,name,description,description,coin_price,'AUDIO-'||lpad(slot_number::text,2,'0'),coalesce('/api/audio-clips/'||id::text||'/thumbnail','/branding/optimized/mask-logo-512.png'),false,0,false,1,product_file_path,mime_type,file_extension,is_active,is_published,slot_number
from public.audio_products on conflict(id) do update set title=excluded.title,short_description=excluded.short_description,coin_price=excluded.coin_price,digital_file_path=excluded.digital_file_path,digital_mime_type=excluded.digital_mime_type,digital_file_extension=excluded.digital_file_extension,is_active=excluded.is_active,is_published=excluded.is_published,updated_at=now();

create or replace function public.sync_audio_commerce_product() returns trigger language plpgsql security definer set search_path=public as $$ begin
  insert into commerce_products(id,slot_number,product_type,source_product_id,title,short_description,full_description,coin_price,sku,image_url,inventory_tracking_enabled,inventory_quantity,requires_shipping,quantity_limit,digital_file_path,digital_mime_type,digital_file_extension,is_active,is_published,sort_order)
  values(new.id,new.slot_number,'digital',new.id,new.name,new.description,new.description,new.coin_price,'AUDIO-'||lpad(new.slot_number::text,2,'0'),'/api/audio-clips/'||new.id::text||'/thumbnail',false,0,false,1,new.product_file_path,new.mime_type,new.file_extension,new.is_active,new.is_published,new.slot_number)
  on conflict(id) do update set title=excluded.title,short_description=excluded.short_description,coin_price=excluded.coin_price,digital_file_path=excluded.digital_file_path,digital_mime_type=excluded.digital_mime_type,digital_file_extension=excluded.digital_file_extension,is_active=excluded.is_active,is_published=excluded.is_published,updated_at=now(); return new; end $$;
drop trigger if exists audio_products_sync_commerce on public.audio_products;
create trigger audio_products_sync_commerce after insert or update on public.audio_products for each row execute function public.sync_audio_commerce_product();

create table if not exists public.commerce_carts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.commerce_cart_items (
  id uuid primary key default gen_random_uuid(), cart_id uuid not null references public.commerce_carts(id) on delete cascade,
  product_id uuid not null references public.commerce_products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete restrict, quantity integer not null check (quantity > 0),
  selected_options jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists commerce_cart_line_unique on public.commerce_cart_items(cart_id,product_id,coalesce(variant_id,'00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists public.inventory_reservations (
  id uuid primary key default gen_random_uuid(), cart_id uuid not null references public.commerce_carts(id) on delete cascade,
  cart_item_id uuid not null references public.commerce_cart_items(id) on delete cascade,
  product_id uuid not null references public.commerce_products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade, quantity integer not null check (quantity > 0),
  expires_at timestamptz not null, consumed_at timestamptz, released_at timestamptz, created_at timestamptz not null default now(),
  unique (cart_item_id)
);
create index if not exists inventory_reservations_active_idx on public.inventory_reservations(product_id,variant_id,expires_at) where consumed_at is null and released_at is null;

create table if not exists public.commerce_orders (
  id uuid primary key default gen_random_uuid(), order_number text not null unique,
  user_id uuid not null references auth.users(id) on delete restrict, customer_name text, customer_identifier text,
  total_coins integer not null check (total_coins > 0), estimated_value_minor integer,
  payment_status text not null default 'paid' check (payment_status in ('pending','paid','failed','refunded')),
  fulfillment_status text not null default 'new' check (fulfillment_status in ('new','paid','processing','packed','shipped','delivered','cancelled','refunded','failed','digital_fulfilled')),
  is_international boolean not null default false, idempotency_key text not null unique, internal_notes text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.commerce_order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.commerce_orders(id) on delete cascade,
  product_id uuid references public.commerce_products(id) on delete set null, variant_id uuid references public.product_variants(id) on delete set null,
  product_name_snapshot text not null, product_type text not null check (product_type in ('digital','physical','painting')),
  image_url_snapshot text, sku_snapshot text, variant_label_snapshot text, quantity integer not null check (quantity > 0),
  unit_coin_price_snapshot integer not null check (unit_coin_price_snapshot > 0), line_total_coins integer not null check (line_total_coins > 0),
  entitlement_status text, download_count integer not null default 0, last_downloaded_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.commerce_shipping_addresses (
  id uuid primary key default gen_random_uuid(), order_id uuid not null unique references public.commerce_orders(id) on delete cascade,
  full_name text not null, address_line_1 text not null, address_line_2 text, city text not null, region text,
  postal_code text not null, country text not null, phone text, delivery_instructions text, created_at timestamptz not null default now()
);
create table if not exists public.commerce_fulfillments (
  id uuid primary key default gen_random_uuid(), order_id uuid not null unique references public.commerce_orders(id) on delete cascade,
  carrier text, tracking_number text, shipped_at timestamptz, notes text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.commerce_order_status_history (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.commerce_orders(id) on delete cascade,
  status text not null, changed_by uuid references public.admin_users(id) on delete set null, note text, created_at timestamptz not null default now()
);
create table if not exists public.inventory_events (
  id uuid primary key default gen_random_uuid(), product_id uuid references public.commerce_products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null, admin_user_id uuid references public.admin_users(id) on delete set null,
  order_id uuid references public.commerce_orders(id) on delete set null, event_type text not null, quantity_delta integer not null,
  quantity_after integer not null, reason text not null, created_at timestamptz not null default now()
);

create table if not exists public.vertical_catalog_entries (
  id uuid primary key default gen_random_uuid(), title text not null, description text not null default '',
  category text not null check (category in ('Merch','Audio','Video','Painting','News','Event','General')),
  image_url text, display_date text, destination_url text, action_label text,
  status text not null default 'draft' check (status in ('draft','scheduled','published','expired','archived')),
  pinned boolean not null default false, sort_order integer not null default 100, publish_at timestamptz, expires_at timestamptz,
  updated_by uuid references public.admin_users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.painting_auctions (
  id uuid primary key default gen_random_uuid(), slug text not null unique, title text not null, artist text not null default 'Noddy',
  short_description text not null default '', full_description text not null default '', images jsonb not null default '[]'::jsonb,
  dimensions text, medium text, year_created integer, condition text, authenticity text,
  starting_bid integer not null check (starting_bid > 0), current_bid integer not null default 0 check (current_bid >= 0),
  bid_increment integer not null check (bid_increment > 0), reserve_price integer, buy_now_price integer,
  bid_count integer not null default 0, bidder_count integer not null default 0,
  starts_at timestamptz not null, ends_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft','scheduled','live','extended','reserve_not_met','sold','unsold','cancelled','fulfillment_pending','shipped','delivered')),
  domestic_shipping boolean not null default true, international_shipping boolean not null default false,
  shipping_notes text not null default '', terms text not null default '', anti_sniping_enabled boolean not null default false,
  anti_sniping_window_seconds integer not null default 120, anti_sniping_extension_seconds integer not null default 120,
  anti_sniping_max_extensions integer not null default 0, extension_count integer not null default 0,
  is_published boolean not null default false, is_featured boolean not null default false,
  updated_by uuid references public.admin_users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create table if not exists public.painting_bids (
  id uuid primary key default gen_random_uuid(), auction_id uuid not null references public.painting_auctions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict, bidder_label text not null default 'Bidder', amount integer not null check (amount > 0),
  idempotency_key text not null unique, status text not null default 'valid' check (status in ('valid','cancelled','winning')),
  cancellation_reason text, cancelled_by uuid references public.admin_users(id) on delete set null, created_at timestamptz not null default now()
);
create table if not exists public.coin_reservations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  auction_id uuid not null references public.painting_auctions(id) on delete cascade, bid_id uuid references public.painting_bids(id) on delete cascade,
  amount integer not null check (amount > 0), status text not null default 'active' check (status in ('active','released','consumed')),
  created_at timestamptz not null default now(), released_at timestamptz, consumed_at timestamptz,
  unique (user_id,auction_id)
);
create table if not exists public.painting_watchlist (user_id uuid not null references auth.users(id) on delete cascade, auction_id uuid not null references public.painting_auctions(id) on delete cascade, created_at timestamptz not null default now(), primary key(user_id,auction_id));
create table if not exists public.auction_audit_events (id uuid primary key default gen_random_uuid(), auction_id uuid references public.painting_auctions(id) on delete set null, actor_user_id uuid references auth.users(id) on delete set null, admin_user_id uuid references public.admin_users(id) on delete set null, event_type text not null, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());

create or replace function public.adjust_commerce_inventory(p_product_id uuid,p_variant_id uuid,p_delta integer,p_reason text,p_admin_id uuid) returns integer language plpgsql security definer set search_path=public as $$ declare next_value integer; begin
  if p_delta=0 then raise exception 'INVALID_DELTA'; end if;
  if p_variant_id is not null then update product_variants set inventory_quantity=inventory_quantity+p_delta,updated_at=now() where id=p_variant_id and product_id=p_product_id and inventory_quantity+p_delta>=0 returning inventory_quantity into next_value;
  else update commerce_products set inventory_quantity=inventory_quantity+p_delta,updated_at=now() where id=p_product_id and inventory_quantity+p_delta>=0 returning inventory_quantity into next_value; end if;
  if next_value is null then raise exception 'INVENTORY_ADJUSTMENT_REJECTED'; end if;
  insert into inventory_events(product_id,variant_id,admin_user_id,event_type,quantity_delta,quantity_after,reason) values(p_product_id,p_variant_id,p_admin_id,'admin_adjustment',p_delta,next_value,p_reason); return next_value; end $$;

create or replace function public.update_commerce_cart_quantity(p_user_id uuid,p_cart_item_id uuid,p_quantity integer) returns boolean language plpgsql security definer set search_path=public as $$
declare selected_cart uuid; available integer; customer_limit integer; tracked boolean;
begin
  if p_quantity<1 then raise exception 'QUANTITY_INVALID'; end if;
  select c.id,coalesce(v.inventory_quantity,p.inventory_quantity),p.quantity_limit,p.inventory_tracking_enabled
  into selected_cart,available,customer_limit,tracked
  from commerce_cart_items ci join commerce_carts c on c.id=ci.cart_id join commerce_products p on p.id=ci.product_id left join product_variants v on v.id=ci.variant_id
  where ci.id=p_cart_item_id and c.user_id=p_user_id and p.is_active and p.is_published for update of ci,p;
  if selected_cart is null then raise exception 'CART_LINE_NOT_FOUND'; end if;
  if p_quantity>customer_limit or (tracked and p_quantity>available) then raise exception 'INVENTORY_CHANGED'; end if;
  update commerce_cart_items set quantity=p_quantity,updated_at=now() where id=p_cart_item_id and cart_id=selected_cart;
  update inventory_reservations set released_at=now() where cart_item_id=p_cart_item_id and consumed_at is null and released_at is null;
  return true;
end $$;

create or replace function public.reserve_commerce_cart(p_user_id uuid,p_minutes integer default 15) returns jsonb language plpgsql security definer set search_path=public as $$ declare selected_cart uuid; invalid_count integer; begin
  delete from inventory_reservations where expires_at<=now() and consumed_at is null and released_at is null;
  select id into selected_cart from commerce_carts where user_id=p_user_id for update; if selected_cart is null then raise exception 'CART_EMPTY'; end if;
  select count(*) into invalid_count from commerce_cart_items ci join commerce_products p on p.id=ci.product_id left join product_variants v on v.id=ci.variant_id
  where ci.cart_id=selected_cart and p.requires_shipping and (not p.is_active or not p.is_published or ci.quantity>p.quantity_limit or ci.quantity>coalesce(v.inventory_quantity,p.inventory_quantity)-(select coalesce(sum(r.quantity),0) from inventory_reservations r where r.product_id=p.id and r.variant_id is not distinct from ci.variant_id and r.cart_id<>selected_cart and r.expires_at>now() and r.consumed_at is null and r.released_at is null));
  if invalid_count>0 then raise exception 'INVENTORY_CHANGED'; end if;
  insert into inventory_reservations(cart_id,cart_item_id,product_id,variant_id,quantity,expires_at)
  select selected_cart,ci.id,ci.product_id,ci.variant_id,ci.quantity,now()+make_interval(mins=>greatest(1,least(p_minutes,30))) from commerce_cart_items ci join commerce_products p on p.id=ci.product_id where ci.cart_id=selected_cart and p.requires_shipping
  on conflict(cart_item_id) do update set quantity=excluded.quantity,expires_at=excluded.expires_at,consumed_at=null,released_at=null;
  return jsonb_build_object('reserved',true,'expiresAt',now()+make_interval(mins=>greatest(1,least(p_minutes,30)))); end $$;

create or replace function public.checkout_commerce_cart(p_user_id uuid,p_idempotency_key text,p_expected_total integer,p_shipping_address jsonb default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare selected_cart uuid; selected_order uuid; selected_digital_order uuid; existing commerce_orders%rowtype; purchase_total integer; digital_total integer; balance_before bigint; balance_after bigint; item_count integer; physical_count integer; international boolean; country text; order_no text;
begin
  if p_idempotency_key is null or length(trim(p_idempotency_key))<12 then raise exception 'IDEMPOTENCY_REQUIRED'; end if;
  select * into existing from commerce_orders where user_id=p_user_id and idempotency_key=p_idempotency_key; if found then return jsonb_build_object('duplicate',true,'orderId',existing.id,'orderNumber',existing.order_number,'totalCoins',existing.total_coins); end if;
  delete from inventory_reservations where expires_at<=now() and consumed_at is null and released_at is null;
  select id into selected_cart from commerce_carts where user_id=p_user_id for update; if selected_cart is null then raise exception 'CART_EMPTY'; end if;
  select count(*),coalesce(sum((coalesce(v.coin_price_override,p.coin_price))*ci.quantity),0),count(*) filter(where p.requires_shipping) into item_count,purchase_total,physical_count from commerce_cart_items ci join commerce_products p on p.id=ci.product_id left join product_variants v on v.id=ci.variant_id where ci.cart_id=selected_cart and p.is_active and p.is_published;
  if item_count=0 then raise exception 'CART_EMPTY'; end if; if p_expected_total<>purchase_total then raise exception 'PRICE_CHANGED'; end if;
  if physical_count>0 and (p_shipping_address is null or nullif(trim(p_shipping_address->>'fullName'),'') is null or nullif(trim(p_shipping_address->>'addressLine1'),'') is null or nullif(trim(p_shipping_address->>'city'),'') is null or nullif(trim(p_shipping_address->>'postalCode'),'') is null or nullif(trim(p_shipping_address->>'country'),'') is null) then raise exception 'SHIPPING_REQUIRED'; end if;
  country:=coalesce(p_shipping_address->>'country',''); international:=physical_count>0 and lower(country) not in ('united states','us','usa');
  if international and exists(select 1 from commerce_cart_items ci join commerce_products p on p.id=ci.product_id where ci.cart_id=selected_cart and p.requires_shipping and not p.international_shipping_allowed) then raise exception 'INTERNATIONAL_UNAVAILABLE'; end if;
  if physical_count>0 and exists(select 1 from commerce_cart_items ci join commerce_products p on p.id=ci.product_id left join product_variants v on v.id=ci.variant_id where ci.cart_id=selected_cart and (ci.quantity>coalesce(v.inventory_quantity,p.inventory_quantity) or not exists(select 1 from inventory_reservations r where r.cart_item_id=ci.id and r.quantity=ci.quantity and r.expires_at>now() and r.consumed_at is null and r.released_at is null))) then raise exception 'INVENTORY_CHANGED'; end if;
  insert into token_wallets(user_id,balance_tokens) values(p_user_id,0) on conflict(user_id) do nothing; select balance_tokens into balance_before from token_wallets where user_id=p_user_id for update; if balance_before<purchase_total then raise exception 'INSUFFICIENT_TOKENS'; end if; balance_after:=balance_before-purchase_total;
  order_no:='XMF-'||to_char(now(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into commerce_orders(order_number,user_id,total_coins,payment_status,fulfillment_status,is_international,idempotency_key) values(order_no,p_user_id,purchase_total,'paid',case when physical_count>0 then 'new' else 'digital_fulfilled' end,international,p_idempotency_key) returning id into selected_order;
  insert into commerce_order_items(order_id,product_id,variant_id,product_name_snapshot,product_type,image_url_snapshot,sku_snapshot,variant_label_snapshot,quantity,unit_coin_price_snapshot,line_total_coins,entitlement_status)
  select selected_order,p.id,v.id,p.title,case when p.product_type='physical' then 'physical' when p.product_type='painting' then 'painting' else 'digital' end,coalesce(v.image_url,p.image_url),coalesce(v.sku,p.sku),concat_ws(' · ',v.size,v.color,v.style,v.material),ci.quantity,coalesce(v.coin_price_override,p.coin_price),coalesce(v.coin_price_override,p.coin_price)*ci.quantity,case when p.product_type='digital' then 'granted' else null end from commerce_cart_items ci join commerce_products p on p.id=ci.product_id left join product_variants v on v.id=ci.variant_id where ci.cart_id=selected_cart;
  select coalesce(sum(p.coin_price*ci.quantity),0) into digital_total from commerce_cart_items ci join commerce_products p on p.id=ci.product_id where ci.cart_id=selected_cart and p.product_type='digital';
  if digital_total>0 then
    insert into digital_orders(user_id,total_coins,status,idempotency_key,completed_at) values(p_user_id,digital_total,'completed',p_idempotency_key||':digital',now()) returning id into selected_digital_order;
    insert into digital_order_items(order_id,product_id,product_name_snapshot,coin_price_snapshot,file_path_snapshot,mime_type_snapshot,file_extension_snapshot)
    select selected_digital_order,p.source_product_id,p.title,p.coin_price,p.digital_file_path,p.digital_mime_type,p.digital_file_extension from commerce_cart_items ci join commerce_products p on p.id=ci.product_id where ci.cart_id=selected_cart and p.product_type='digital';
    insert into purchase_entitlements(user_id,product_id,order_item_id) select p_user_id,oi.product_id,oi.id from digital_order_items oi where oi.order_id=selected_digital_order on conflict(user_id,product_id) do update set order_item_id=excluded.order_item_id,granted_at=now(),revoked_at=null;
  end if;
  if physical_count>0 then insert into commerce_shipping_addresses(order_id,full_name,address_line_1,address_line_2,city,region,postal_code,country,phone,delivery_instructions) values(selected_order,left(p_shipping_address->>'fullName',120),left(p_shipping_address->>'addressLine1',180),left(p_shipping_address->>'addressLine2',180),left(p_shipping_address->>'city',120),left(p_shipping_address->>'region',120),left(p_shipping_address->>'postalCode',40),left(p_shipping_address->>'country',100),left(p_shipping_address->>'phone',40),left(p_shipping_address->>'instructions',500)); insert into commerce_fulfillments(order_id) values(selected_order); end if;
  update product_variants v set inventory_quantity=v.inventory_quantity-ci.quantity,updated_at=now() from commerce_cart_items ci where ci.cart_id=selected_cart and ci.variant_id=v.id;
  update commerce_products p set inventory_quantity=p.inventory_quantity-ci.quantity,updated_at=now() from commerce_cart_items ci where ci.cart_id=selected_cart and ci.product_id=p.id and ci.variant_id is null and p.inventory_tracking_enabled;
  insert into inventory_events(product_id,variant_id,order_id,event_type,quantity_delta,quantity_after,reason) select ci.product_id,ci.variant_id,selected_order,'purchase',-ci.quantity,coalesce(v.inventory_quantity,p.inventory_quantity),'Order '||order_no from commerce_cart_items ci join commerce_products p on p.id=ci.product_id left join product_variants v on v.id=ci.variant_id where ci.cart_id=selected_cart and p.inventory_tracking_enabled;
  update inventory_reservations set consumed_at=now() where cart_id=selected_cart and consumed_at is null and released_at is null;
  update token_wallets set balance_tokens=balance_after,updated_at=now() where user_id=p_user_id;
  insert into wallet_transactions(user_id,transaction_type,amount,balance_after,total_coins,idempotency_key,status,note,final_transaction_result) values(p_user_id,'COMMERCE_PURCHASE',0,balance_after,-purchase_total,p_idempotency_key,'confirmed','Unified store purchase '||order_no,'completed');
  insert into commerce_order_status_history(order_id,status,note) values(selected_order,case when physical_count>0 then 'new' else 'digital_fulfilled' end,'Created by atomic checkout');
  delete from commerce_cart_items where cart_id=selected_cart; update commerce_carts set updated_at=now() where id=selected_cart;
  return jsonb_build_object('duplicate',false,'orderId',selected_order,'orderNumber',order_no,'totalCoins',purchase_total,'tokenBalance',balance_after,'itemCount',item_count); end $$;

create or replace function public.place_painting_bid(p_user_id uuid,p_auction_id uuid,p_amount integer,p_idempotency_key text) returns jsonb language plpgsql security definer set search_path=public as $$ declare auction painting_auctions%rowtype; balance bigint; reserved_other bigint; previous_user uuid; selected_bid uuid; next_min integer; begin
  if exists(select 1 from painting_bids where idempotency_key=p_idempotency_key) then raise exception 'DUPLICATE_ACTION'; end if;
  select * into auction from painting_auctions where id=p_auction_id for update; if not found or auction.status not in ('live','extended') or now()<auction.starts_at or now()>=auction.ends_at then raise exception 'AUCTION_CLOSED'; end if;
  next_min:=greatest(auction.starting_bid,auction.current_bid+auction.bid_increment); if p_amount<next_min then raise exception 'BID_TOO_LOW'; end if;
  select user_id into previous_user from painting_bids where auction_id=p_auction_id and status in ('valid','winning') order by amount desc,created_at asc limit 1;
  select balance_tokens into balance from token_wallets where user_id=p_user_id for update; select coalesce(sum(amount),0) into reserved_other from coin_reservations where user_id=p_user_id and auction_id<>p_auction_id and status='active'; if coalesce(balance,0)-reserved_other<p_amount then raise exception 'INSUFFICIENT_AVAILABLE_COINS'; end if;
  update painting_bids set status='valid' where auction_id=p_auction_id and status='winning'; insert into painting_bids(auction_id,user_id,bidder_label,amount,idempotency_key,status) values(p_auction_id,p_user_id,'Bidder '||substr(p_user_id::text,1,6),p_amount,p_idempotency_key,'winning') returning id into selected_bid;
  update coin_reservations set status='released',released_at=now() where auction_id=p_auction_id and status='active'; insert into coin_reservations(user_id,auction_id,bid_id,amount,status) values(p_user_id,p_auction_id,selected_bid,p_amount,'active') on conflict(user_id,auction_id) do update set bid_id=excluded.bid_id,amount=excluded.amount,status='active',released_at=null,consumed_at=null;
  update painting_auctions set current_bid=p_amount,bid_count=bid_count+1,bidder_count=(select count(distinct user_id) from painting_bids where auction_id=p_auction_id and status<>'cancelled'),ends_at=case when anti_sniping_enabled and extension_count<anti_sniping_max_extensions and ends_at-now()<=make_interval(secs=>anti_sniping_window_seconds) then ends_at+make_interval(secs=>anti_sniping_extension_seconds) else ends_at end,status=case when anti_sniping_enabled and extension_count<anti_sniping_max_extensions and ends_at-now()<=make_interval(secs=>anti_sniping_window_seconds) then 'extended' else status end,extension_count=extension_count+case when anti_sniping_enabled and extension_count<anti_sniping_max_extensions and ends_at-now()<=make_interval(secs=>anti_sniping_window_seconds) then 1 else 0 end,updated_at=now() where id=p_auction_id;
  insert into auction_audit_events(auction_id,actor_user_id,event_type,metadata) values(p_auction_id,p_user_id,'bid_accepted',jsonb_build_object('amount',p_amount,'priorLeader',previous_user)); return jsonb_build_object('accepted',true,'bidId',selected_bid,'amount',p_amount); end $$;

create or replace function public.cancel_painting_auction(p_auction_id uuid,p_admin_id uuid,p_reason text) returns boolean language plpgsql security definer set search_path=public as $$ begin if length(trim(p_reason))<5 then raise exception 'REASON_REQUIRED'; end if; update painting_auctions set status='cancelled',updated_by=p_admin_id,updated_at=now() where id=p_auction_id and status not in ('sold','delivered'); update coin_reservations set status='released',released_at=now() where auction_id=p_auction_id and status='active'; insert into auction_audit_events(auction_id,admin_user_id,event_type,metadata) values(p_auction_id,p_admin_id,'auction_cancelled',jsonb_build_object('reason',p_reason)); return true; end $$;

create or replace function public.reorder_catalog_entry(p_entry_id uuid,p_direction integer) returns boolean language plpgsql security definer set search_path=public as $$ declare current_order integer; target_id uuid; target_order integer; begin select sort_order into current_order from vertical_catalog_entries where id=p_entry_id for update; select id,sort_order into target_id,target_order from vertical_catalog_entries where case when p_direction<0 then sort_order<current_order else sort_order>current_order end order by case when p_direction<0 then sort_order end desc,case when p_direction>0 then sort_order end asc limit 1 for update; if target_id is null then return false; end if; update vertical_catalog_entries set sort_order=target_order where id=p_entry_id; update vertical_catalog_entries set sort_order=current_order where id=target_id; return true; end $$;

create index if not exists commerce_products_public_idx on public.commerce_products(product_type,is_published,is_active,sort_order);
create index if not exists commerce_orders_admin_idx on public.commerce_orders(created_at desc,fulfillment_status,is_international);
create index if not exists commerce_order_items_order_idx on public.commerce_order_items(order_id);
create index if not exists painting_auctions_public_idx on public.painting_auctions(is_published,status,ends_at);
create index if not exists painting_bids_auction_idx on public.painting_bids(auction_id,amount desc,created_at);

alter table public.merch_categories enable row level security; alter table public.commerce_products enable row level security; alter table public.product_variants enable row level security; alter table public.commerce_carts enable row level security; alter table public.commerce_cart_items enable row level security; alter table public.inventory_reservations enable row level security; alter table public.commerce_orders enable row level security; alter table public.commerce_order_items enable row level security; alter table public.commerce_shipping_addresses enable row level security; alter table public.commerce_fulfillments enable row level security; alter table public.commerce_order_status_history enable row level security; alter table public.inventory_events enable row level security; alter table public.vertical_catalog_entries enable row level security; alter table public.painting_auctions enable row level security; alter table public.painting_bids enable row level security; alter table public.coin_reservations enable row level security; alter table public.painting_watchlist enable row level security; alter table public.auction_audit_events enable row level security;

create policy "Public reads active merch categories" on public.merch_categories for select using(is_active and not is_hidden);
create policy "Public reads published commerce products" on public.commerce_products for select using(is_active and is_published);
create policy "Public reads active product variants" on public.product_variants for select using(is_active and exists(select 1 from commerce_products p where p.id=product_id and p.is_active and p.is_published));
create policy "Users read own commerce carts" on public.commerce_carts for select using(auth.uid()=user_id);
create policy "Users read own commerce cart items" on public.commerce_cart_items for select using(exists(select 1 from commerce_carts c where c.id=cart_id and c.user_id=auth.uid()));
create policy "Users read own commerce orders" on public.commerce_orders for select using(auth.uid()=user_id);
create policy "Users read own commerce order items" on public.commerce_order_items for select using(exists(select 1 from commerce_orders o where o.id=order_id and o.user_id=auth.uid()));
create policy "Users read own watchlist" on public.painting_watchlist for select using(auth.uid()=user_id);
create policy "Public reads published auctions" on public.painting_auctions for select using(is_published);
create policy "Public reads valid auction bids" on public.painting_bids for select using(status in ('valid','winning'));
create policy "Public reads current catalog" on public.vertical_catalog_entries for select using(status='published' and (publish_at is null or publish_at<=now()) and (expires_at is null or expires_at>now()));

revoke all on function public.adjust_commerce_inventory(uuid,uuid,integer,text,uuid) from public,anon,authenticated;
revoke all on function public.update_commerce_cart_quantity(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.reserve_commerce_cart(uuid,integer) from public,anon,authenticated;
revoke all on function public.checkout_commerce_cart(uuid,text,integer,jsonb) from public,anon,authenticated;
revoke all on function public.place_painting_bid(uuid,uuid,integer,text) from public,anon,authenticated;
revoke all on function public.cancel_painting_auction(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.reorder_catalog_entry(uuid,integer) from public,anon,authenticated;
grant execute on function public.adjust_commerce_inventory(uuid,uuid,integer,text,uuid),public.update_commerce_cart_quantity(uuid,uuid,integer),public.reserve_commerce_cart(uuid,integer),public.checkout_commerce_cart(uuid,text,integer,jsonb),public.place_painting_bid(uuid,uuid,integer,text),public.cancel_painting_auction(uuid,uuid,text),public.reorder_catalog_entry(uuid,integer) to service_role;

alter table public.commerce_order_items add column if not exists auction_id uuid references public.painting_auctions(id) on delete set null;
create table if not exists public.auction_notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  auction_id uuid references public.painting_auctions(id) on delete cascade, notification_type text not null,
  message text not null, read_at timestamptz, created_at timestamptz not null default now()
);
alter table public.auction_notifications enable row level security;
create policy "Users read own auction notifications" on public.auction_notifications for select using(auth.uid()=user_id);

create or replace function public.buy_now_painting(p_user_id uuid,p_auction_id uuid,p_shipping_address jsonb,p_idempotency_key text) returns jsonb language plpgsql security definer set search_path=public as $$ declare auction painting_auctions%rowtype; balance bigint; v_order_id uuid; order_no text; country text; begin
  if p_shipping_address is null or nullif(trim(p_shipping_address->>'fullName'),'') is null or nullif(trim(p_shipping_address->>'addressLine1'),'') is null or nullif(trim(p_shipping_address->>'city'),'') is null or nullif(trim(p_shipping_address->>'postalCode'),'') is null or nullif(trim(p_shipping_address->>'country'),'') is null then raise exception 'SHIPPING_REQUIRED'; end if;
  select * into auction from painting_auctions where id=p_auction_id for update; if not found or auction.status not in ('live','extended') or auction.buy_now_price is null or now()>=auction.ends_at then raise exception 'AUCTION_CLOSED'; end if;
  country:=p_shipping_address->>'country'; if lower(country) not in ('united states','us','usa') and not auction.international_shipping then raise exception 'INTERNATIONAL_UNAVAILABLE'; end if;
  select balance_tokens into balance from token_wallets where user_id=p_user_id for update; if coalesce(balance,0)<auction.buy_now_price then raise exception 'INSUFFICIENT_AVAILABLE_COINS'; end if;
  order_no:='XMF-ART-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)); insert into commerce_orders(order_number,user_id,total_coins,payment_status,fulfillment_status,is_international,idempotency_key) values(order_no,p_user_id,auction.buy_now_price,'paid','new',lower(country) not in ('united states','us','usa'),p_idempotency_key) returning id into v_order_id;
  insert into commerce_order_items(order_id,auction_id,product_name_snapshot,product_type,image_url_snapshot,quantity,unit_coin_price_snapshot,line_total_coins) values(v_order_id,auction.id,auction.title,'painting',auction.images->>0,1,auction.buy_now_price,auction.buy_now_price);
  insert into commerce_shipping_addresses(order_id,full_name,address_line_1,address_line_2,city,region,postal_code,country,phone,delivery_instructions) values(v_order_id,left(p_shipping_address->>'fullName',120),left(p_shipping_address->>'addressLine1',180),left(p_shipping_address->>'addressLine2',180),left(p_shipping_address->>'city',120),left(p_shipping_address->>'region',120),left(p_shipping_address->>'postalCode',40),left(country,100),left(p_shipping_address->>'phone',40),left(p_shipping_address->>'instructions',500));
  update token_wallets set balance_tokens=balance-auction.buy_now_price,updated_at=now() where user_id=p_user_id; update coin_reservations set status='released',released_at=now() where auction_id=p_auction_id and status='active'; update painting_auctions set status='fulfillment_pending',ends_at=now(),updated_at=now() where id=p_auction_id; insert into commerce_fulfillments(order_id) values(v_order_id); insert into commerce_order_status_history(order_id,status,note) values(v_order_id,'new','Painting purchased through Buy Now'); insert into auction_notifications(user_id,auction_id,notification_type,message) values(p_user_id,p_auction_id,'won','You purchased '||auction.title||'.'); return jsonb_build_object('orderId',v_order_id,'orderNumber',order_no); end $$;

create or replace function public.save_painting_winner_address(p_user_id uuid,p_auction_id uuid,p_shipping_address jsonb) returns boolean language plpgsql security definer set search_path=public as $$ declare v_order_id uuid; international_shipping_allowed boolean; country text; begin
  if p_shipping_address is null or nullif(trim(p_shipping_address->>'fullName'),'') is null or nullif(trim(p_shipping_address->>'addressLine1'),'') is null or nullif(trim(p_shipping_address->>'city'),'') is null or nullif(trim(p_shipping_address->>'postalCode'),'') is null or nullif(trim(p_shipping_address->>'country'),'') is null then raise exception 'SHIPPING_REQUIRED'; end if;
  select o.id, a.international_shipping into v_order_id, international_shipping_allowed from commerce_orders o join commerce_order_items oi on oi.order_id=o.id join painting_auctions a on a.id=oi.auction_id where o.user_id=p_user_id and oi.auction_id=p_auction_id and o.payment_status='paid' limit 1;
  if v_order_id is null then raise exception 'NOT_WINNER'; end if; country:=p_shipping_address->>'country'; if lower(country) not in ('united states','us','usa') and not international_shipping_allowed then raise exception 'INTERNATIONAL_UNAVAILABLE'; end if;
  insert into commerce_shipping_addresses(order_id,full_name,address_line_1,address_line_2,city,region,postal_code,country,phone,delivery_instructions) values(v_order_id,left(p_shipping_address->>'fullName',120),left(p_shipping_address->>'addressLine1',180),left(p_shipping_address->>'addressLine2',180),left(p_shipping_address->>'city',120),left(p_shipping_address->>'region',120),left(p_shipping_address->>'postalCode',40),left(country,100),left(p_shipping_address->>'phone',40),left(p_shipping_address->>'instructions',500)) on conflict(order_id) do update set full_name=excluded.full_name,address_line_1=excluded.address_line_1,address_line_2=excluded.address_line_2,city=excluded.city,region=excluded.region,postal_code=excluded.postal_code,country=excluded.country,phone=excluded.phone,delivery_instructions=excluded.delivery_instructions;
  update commerce_orders set is_international=lower(country) not in ('united states','us','usa'),updated_at=now() where id=v_order_id; return true; end $$;

create or replace function public.finalize_expired_painting_auctions() returns integer language plpgsql security definer set search_path=public as $$ declare auction painting_auctions%rowtype; winner painting_bids%rowtype; reservation coin_reservations%rowtype; balance bigint; v_order_id uuid; order_no text; processed integer:=0; begin
  for auction in select * from painting_auctions where status in ('live','extended') and ends_at<=now() for update skip locked loop
    select * into winner from painting_bids where auction_id=auction.id and status='winning' order by amount desc,created_at asc limit 1;
    if winner.id is null then update painting_auctions set status='unsold',updated_at=now() where id=auction.id; processed:=processed+1; continue; end if;
    if auction.reserve_price is not null and winner.amount<auction.reserve_price then update painting_auctions set status='reserve_not_met',updated_at=now() where id=auction.id; update coin_reservations set status='released',released_at=now() where auction_id=auction.id and status='active'; insert into auction_notifications(user_id,auction_id,notification_type,message) values(winner.user_id,auction.id,'reserve_not_met','The reserve was not met for '||auction.title||'.'); processed:=processed+1; continue; end if;
    select * into reservation from coin_reservations where user_id=winner.user_id and auction_id=auction.id and status='active' for update; select balance_tokens into balance from token_wallets where user_id=winner.user_id for update;
    if reservation.id is null or reservation.amount<winner.amount or coalesce(balance,0)<winner.amount then update painting_auctions set status='cancelled',updated_at=now() where id=auction.id; insert into auction_audit_events(auction_id,actor_user_id,event_type,metadata) values(auction.id,winner.user_id,'finalization_failed',jsonb_build_object('reason','reservation_or_balance')); processed:=processed+1; continue; end if;
    order_no:='XMF-ART-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)); insert into commerce_orders(order_number,user_id,total_coins,payment_status,fulfillment_status,is_international,idempotency_key) values(order_no,winner.user_id,winner.amount,'paid','new',false,'auction:'||auction.id::text) returning id into v_order_id;
    insert into commerce_order_items(order_id,auction_id,product_name_snapshot,product_type,image_url_snapshot,quantity,unit_coin_price_snapshot,line_total_coins) values(v_order_id,auction.id,auction.title,'painting',auction.images->>0,1,winner.amount,winner.amount); insert into commerce_fulfillments(order_id) values(v_order_id); insert into commerce_order_status_history(order_id,status,note) values(v_order_id,'new','Auction finalized; winner address pending'); update token_wallets set balance_tokens=balance-winner.amount,updated_at=now() where user_id=winner.user_id; update coin_reservations set status='consumed',consumed_at=now() where id=reservation.id; update painting_auctions set status='fulfillment_pending',updated_at=now() where id=auction.id; insert into auction_notifications(user_id,auction_id,notification_type,message) values(winner.user_id,auction.id,'won','You won '||auction.title||'. Submit your delivery address.'); processed:=processed+1;
  end loop; return processed; end $$;

revoke all on function public.buy_now_painting(uuid,uuid,jsonb,text),public.save_painting_winner_address(uuid,uuid,jsonb),public.finalize_expired_painting_auctions() from public,anon,authenticated;
grant execute on function public.buy_now_painting(uuid,uuid,jsonb,text),public.save_painting_winner_address(uuid,uuid,jsonb),public.finalize_expired_painting_auctions() to service_role;
