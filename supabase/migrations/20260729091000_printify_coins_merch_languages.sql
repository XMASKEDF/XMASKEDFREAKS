-- Coins-only Printify fulfillment and ADMIN-managed merchandise languages.
-- Additive only: existing wallets, carts, orders, inventory, and history remain authoritative.

alter table public.commerce_products add column if not exists printify_product_id text;
alter table public.commerce_products add column if not exists printify_blueprint_id integer;
alter table public.commerce_products add column if not exists printify_provider_id integer;
alter table public.commerce_products add column if not exists fulfillment_enabled boolean not null default false;
alter table public.commerce_products add column if not exists printify_last_synced_at timestamptz;

alter table public.product_variants add column if not exists fit text;
alter table public.product_variants add column if not exists printify_variant_id integer;
alter table public.product_variants add column if not exists provider_sku text;
alter table public.product_variants add column if not exists fulfillment_available boolean not null default false;
alter table public.product_variants add column if not exists production_cost_minor integer check(production_cost_minor is null or production_cost_minor >= 0);
alter table public.product_variants add column if not exists printify_last_synced_at timestamptz;

create table if not exists public.merch_languages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check(code ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  label text not null check(char_length(label) between 1 and 80),
  native_label text not null check(char_length(native_label) between 1 and 80),
  sort_order integer not null default 100,
  is_enabled boolean not null default false,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.merch_languages(code,label,native_label,sort_order,is_enabled,is_published) values
('en','English','English',10,true,true),
('es','Spanish','Español',20,false,false),
('fr','French','Français',30,false,false),
('de','German','Deutsch',40,false,false),
('pt','Portuguese','Português',50,false,false),
('it','Italian','Italiano',60,false,false),
('ja','Japanese','日本語',70,false,false),
('ko','Korean','한국어',80,false,false),
('ar','Arabic','العربية',90,false,false),
('zh','Chinese','中文',100,false,false)
on conflict(code) do nothing;

create table if not exists public.product_merch_languages (
  product_id uuid not null references public.commerce_products(id) on delete cascade,
  language_id uuid not null references public.merch_languages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(product_id,language_id)
);

create table if not exists public.commerce_checkout_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cart_id uuid not null references public.commerce_carts(id) on delete cascade,
  address_snapshot jsonb not null,
  cart_snapshot jsonb not null,
  merchandise_minor integer not null check(merchandise_minor >= 0),
  merchandise_coins integer not null check(merchandise_coins >= 0),
  shipping_minor integer not null check(shipping_minor >= 0),
  shipping_coins integer not null check(shipping_coins >= 0),
  tax_minor integer not null check(tax_minor >= 0),
  tax_coins integer not null check(tax_coins >= 0),
  total_minor integer not null check(total_minor >= 0),
  total_coins integer not null check(total_coins >= 1),
  coin_value_minor integer not null default 50 check(coin_value_minor = 50),
  rounding_adjustment_minor integer not null default 0 check(rounding_adjustment_minor >= 0),
  shipping_method text not null,
  shipping_provider text not null,
  tax_provider text not null,
  pricing_version text not null default 'coins-50-v1',
  status text not null default 'active' check(status in ('active','completed','expired','cancelled')),
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.commerce_orders add column if not exists checkout_quote_id uuid unique references public.commerce_checkout_quotes(id) on delete restrict;
alter table public.commerce_orders add column if not exists merchandise_coins integer not null default 0;
alter table public.commerce_orders add column if not exists merchandise_minor integer not null default 0;
alter table public.commerce_orders add column if not exists shipping_coins integer not null default 0;
alter table public.commerce_orders add column if not exists shipping_minor integer not null default 0;
alter table public.commerce_orders add column if not exists tax_coins integer not null default 0;
alter table public.commerce_orders add column if not exists tax_minor integer not null default 0;
alter table public.commerce_orders add column if not exists total_minor integer not null default 0;
alter table public.commerce_orders add column if not exists coin_value_minor integer not null default 50;
alter table public.commerce_orders add column if not exists rounding_adjustment_minor integer not null default 0;
alter table public.commerce_orders add column if not exists printify_production_cost_minor integer;
alter table public.commerce_orders add column if not exists printify_shipping_cost_minor integer;
alter table public.commerce_orders add column if not exists estimated_fulfillment_minor integer;
alter table public.commerce_orders add column if not exists estimated_margin_minor integer;
alter table public.commerce_orders add column if not exists financial_currency text not null default 'USD';
alter table public.commerce_orders add column if not exists pricing_timestamp timestamptz;

alter table public.wallet_transactions add column if not exists commerce_breakdown jsonb;
alter table public.commerce_fulfillments add column if not exists printify_order_id text unique;
alter table public.commerce_fulfillments add column if not exists printify_status text;
alter table public.commerce_fulfillments add column if not exists tracking_url text;
alter table public.commerce_fulfillments add column if not exists delivered_at timestamptz;
alter table public.commerce_fulfillments add column if not exists submitted_at timestamptz;

create table if not exists public.printify_fulfillment_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.commerce_orders(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','processing','submitted','retry','failed','manual_approval','disabled')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error_code text,
  printify_order_id text unique,
  locked_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commerce_fulfillment_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.commerce_orders(id) on delete set null,
  event_type text not null,
  actor_type text not null default 'system' check(actor_type in ('system','admin','provider')),
  admin_user_id uuid references public.admin_users(id) on delete set null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists merch_languages_public_idx on public.merch_languages(is_published,is_enabled,sort_order);
create index if not exists product_merch_languages_product_idx on public.product_merch_languages(product_id);
create index if not exists commerce_checkout_quotes_active_idx on public.commerce_checkout_quotes(user_id,status,expires_at);
create index if not exists printify_fulfillment_jobs_ready_idx on public.printify_fulfillment_jobs(status,next_attempt_at);
create index if not exists commerce_fulfillment_events_order_idx on public.commerce_fulfillment_events(order_id,created_at desc);

alter table public.merch_languages enable row level security;
alter table public.product_merch_languages enable row level security;
alter table public.commerce_checkout_quotes enable row level security;
alter table public.printify_fulfillment_jobs enable row level security;
alter table public.commerce_fulfillment_events enable row level security;

drop policy if exists "Public reads published merch languages" on public.merch_languages;
create policy "Public reads published merch languages" on public.merch_languages for select using(is_enabled and is_published);
drop policy if exists "Public reads product merch languages" on public.product_merch_languages;
create policy "Public reads product merch languages" on public.product_merch_languages for select using(exists(select 1 from public.commerce_products p where p.id=product_id and p.is_active and p.is_published));
drop policy if exists "Users read own checkout quotes" on public.commerce_checkout_quotes;
create policy "Users read own checkout quotes" on public.commerce_checkout_quotes for select using(auth.uid()=user_id);

create or replace function public.complete_printify_merch_checkout(p_user_id uuid,p_quote_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  quote commerce_checkout_quotes%rowtype; existing commerce_orders%rowtype; selected_order uuid; selected_digital_order uuid;
  item_count integer; physical_count integer; calculated_merchandise integer; digital_total integer; balance_before bigint; balance_after bigint; current_cart_snapshot jsonb;
  order_no text; country text; international boolean;
begin
  if p_idempotency_key is null or length(trim(p_idempotency_key))<12 then raise exception 'IDEMPOTENCY_REQUIRED'; end if;
  select * into existing from commerce_orders where user_id=p_user_id and idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('duplicate',true,'orderId',existing.id,'orderNumber',existing.order_number,'totalCoins',existing.total_coins,'tokenBalance',(select balance_tokens from token_wallets where user_id=p_user_id)); end if;
  select * into quote from commerce_checkout_quotes where id=p_quote_id and user_id=p_user_id for update;
  if not found then raise exception 'QUOTE_NOT_FOUND'; end if;
  if quote.status<>'active' or quote.completed_at is not null then raise exception 'QUOTE_USED'; end if;
  if quote.expires_at<=now() then update commerce_checkout_quotes set status='expired',updated_at=now() where id=quote.id; raise exception 'QUOTE_EXPIRED'; end if;
  perform 1 from commerce_carts where id=quote.cart_id and user_id=p_user_id for update; if not found then raise exception 'CART_EMPTY'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',ci.id,'product_id',ci.product_id,'variant_id',ci.variant_id,'quantity',ci.quantity,'selected_options',ci.selected_options) order by ci.created_at),'[]'::jsonb)
  into current_cart_snapshot from commerce_cart_items ci where ci.cart_id=quote.cart_id;
  if current_cart_snapshot<>quote.cart_snapshot then raise exception 'CART_CHANGED'; end if;
  select count(*),count(*) filter(where p.requires_shipping),coalesce(sum(coalesce(v.coin_price_override,p.coin_price)*ci.quantity),0)
  into item_count,physical_count,calculated_merchandise
  from commerce_cart_items ci join commerce_products p on p.id=ci.product_id left join product_variants v on v.id=ci.variant_id
  where ci.cart_id=quote.cart_id and p.is_active and p.is_published;
  if item_count=0 or physical_count=0 then raise exception 'PHYSICAL_CART_REQUIRED'; end if;
  if calculated_merchandise<>quote.merchandise_coins or quote.merchandise_minor<>calculated_merchandise*50 then raise exception 'PRICE_CHANGED'; end if;
  if quote.total_coins<>quote.merchandise_coins+quote.shipping_coins+quote.tax_coins or quote.total_minor<>quote.merchandise_minor+quote.shipping_minor+quote.tax_minor then raise exception 'QUOTE_INVALID'; end if;
  if quote.shipping_coins<>ceil(quote.shipping_minor::numeric/50)::integer or quote.tax_coins<>ceil(quote.tax_minor::numeric/50)::integer then raise exception 'QUOTE_INVALID'; end if;
  if exists(select 1 from commerce_cart_items ci join commerce_products p on p.id=ci.product_id left join product_variants v on v.id=ci.variant_id where ci.cart_id=quote.cart_id and p.requires_shipping and (not p.fulfillment_enabled or p.printify_product_id is null or v.printify_variant_id is null or not coalesce(v.fulfillment_available,false) or ci.quantity>coalesce(v.inventory_quantity,p.inventory_quantity) or not exists(select 1 from inventory_reservations r where r.cart_item_id=ci.id and r.quantity=ci.quantity and r.expires_at>now() and r.consumed_at is null and r.released_at is null))) then raise exception 'FULFILLMENT_UNAVAILABLE'; end if;
  country:=coalesce(quote.address_snapshot->>'country',''); international:=lower(country) not in ('united states','us','usa');
  if international and exists(select 1 from commerce_cart_items ci join commerce_products p on p.id=ci.product_id where ci.cart_id=quote.cart_id and p.requires_shipping and not p.international_shipping_allowed) then raise exception 'INTERNATIONAL_UNAVAILABLE'; end if;
  insert into token_wallets(user_id,balance_tokens) values(p_user_id,0) on conflict(user_id) do nothing;
  select balance_tokens into balance_before from token_wallets where user_id=p_user_id for update;
  if balance_before<quote.total_coins then raise exception 'INSUFFICIENT_TOKENS'; end if;
  balance_after:=balance_before-quote.total_coins;
  order_no:='XMF-MERCH-'||to_char(now(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into commerce_orders(order_number,user_id,total_coins,payment_status,fulfillment_status,is_international,idempotency_key,checkout_quote_id,merchandise_coins,merchandise_minor,shipping_coins,shipping_minor,tax_coins,tax_minor,total_minor,coin_value_minor,rounding_adjustment_minor,financial_currency,pricing_timestamp)
  values(order_no,p_user_id,quote.total_coins,'paid','new',international,p_idempotency_key,quote.id,quote.merchandise_coins,quote.merchandise_minor,quote.shipping_coins,quote.shipping_minor,quote.tax_coins,quote.tax_minor,quote.total_minor,50,quote.rounding_adjustment_minor,'USD',quote.created_at) returning id into selected_order;
  insert into commerce_order_items(order_id,product_id,variant_id,product_name_snapshot,product_type,image_url_snapshot,sku_snapshot,variant_label_snapshot,quantity,unit_coin_price_snapshot,line_total_coins,entitlement_status)
  select selected_order,p.id,v.id,p.title,case when p.product_type='physical' then 'physical' else 'digital' end,coalesce(v.image_url,p.image_url),coalesce(v.sku,p.sku),concat_ws(' · ',v.size,v.color,v.style,v.fit,v.material),ci.quantity,coalesce(v.coin_price_override,p.coin_price),coalesce(v.coin_price_override,p.coin_price)*ci.quantity,case when p.product_type='digital' then 'granted' else null end
  from commerce_cart_items ci join commerce_products p on p.id=ci.product_id left join product_variants v on v.id=ci.variant_id where ci.cart_id=quote.cart_id;
  select coalesce(sum(p.coin_price*ci.quantity),0) into digital_total from commerce_cart_items ci join commerce_products p on p.id=ci.product_id where ci.cart_id=quote.cart_id and p.product_type='digital';
  if digital_total>0 then
    insert into digital_orders(user_id,total_coins,status,idempotency_key,completed_at) values(p_user_id,digital_total,'completed',p_idempotency_key||':digital',now()) returning id into selected_digital_order;
    insert into digital_order_items(order_id,product_id,product_name_snapshot,coin_price_snapshot,file_path_snapshot,mime_type_snapshot,file_extension_snapshot) select selected_digital_order,p.source_product_id,p.title,p.coin_price,p.digital_file_path,p.digital_mime_type,p.digital_file_extension from commerce_cart_items ci join commerce_products p on p.id=ci.product_id where ci.cart_id=quote.cart_id and p.product_type='digital';
    insert into purchase_entitlements(user_id,product_id,order_item_id) select p_user_id,oi.product_id,oi.id from digital_order_items oi where oi.order_id=selected_digital_order on conflict(user_id,product_id) do update set order_item_id=excluded.order_item_id,granted_at=now(),revoked_at=null;
  end if;
  insert into commerce_shipping_addresses(order_id,full_name,address_line_1,address_line_2,city,region,postal_code,country,phone,delivery_instructions) values(selected_order,left(quote.address_snapshot->>'fullName',120),left(quote.address_snapshot->>'addressLine1',180),left(quote.address_snapshot->>'addressLine2',180),left(quote.address_snapshot->>'city',120),left(quote.address_snapshot->>'region',120),left(quote.address_snapshot->>'postalCode',40),left(country,100),left(quote.address_snapshot->>'phone',40),left(quote.address_snapshot->>'instructions',500));
  insert into commerce_fulfillments(order_id,printify_status) values(selected_order,'queued');
  update product_variants v set inventory_quantity=v.inventory_quantity-ci.quantity,updated_at=now() from commerce_cart_items ci where ci.cart_id=quote.cart_id and ci.variant_id=v.id;
  update commerce_products p set inventory_quantity=p.inventory_quantity-ci.quantity,updated_at=now() from commerce_cart_items ci where ci.cart_id=quote.cart_id and ci.product_id=p.id and ci.variant_id is null and p.inventory_tracking_enabled;
  insert into inventory_events(product_id,variant_id,order_id,event_type,quantity_delta,quantity_after,reason) select ci.product_id,ci.variant_id,selected_order,'purchase',-ci.quantity,coalesce(v.inventory_quantity,p.inventory_quantity),'Order '||order_no from commerce_cart_items ci join commerce_products p on p.id=ci.product_id left join product_variants v on v.id=ci.variant_id where ci.cart_id=quote.cart_id and p.inventory_tracking_enabled;
  update inventory_reservations set consumed_at=now() where cart_id=quote.cart_id and consumed_at is null and released_at is null;
  update token_wallets set balance_tokens=balance_after,updated_at=now() where user_id=p_user_id;
  insert into wallet_transactions(user_id,transaction_type,amount,balance_after,total_coins,idempotency_key,status,note,final_transaction_result,commerce_breakdown) values(p_user_id,'COMMERCE_PURCHASE',0,balance_after,-quote.total_coins,p_idempotency_key,'confirmed','Coins-only merchandise order '||order_no,'completed',jsonb_build_object('orderId',selected_order,'merchandiseCoins',quote.merchandise_coins,'shippingCoins',quote.shipping_coins,'taxCoins',quote.tax_coins,'totalCoins',quote.total_coins,'coinValueMinor',50));
  insert into printify_fulfillment_jobs(order_id,status) values(selected_order,'pending') on conflict(order_id) do nothing;
  insert into commerce_order_status_history(order_id,status,note) values(selected_order,'new','Coins-only order received; Printify fulfillment queued');
  insert into analytics_events(event_type,event_key,user_id,page_path,content_type,content_id,metadata) values('merchandise_purchase_completed','merch-order:'||selected_order::text,p_user_id,'/merch','physical_merch',selected_order::text,jsonb_build_object('merchandiseCoins',quote.merchandise_coins,'shippingCoins',quote.shipping_coins,'taxCoins',quote.tax_coins,'totalCoins',quote.total_coins,'totalMinor',quote.total_minor,'international',international)) on conflict(event_type,event_key) do nothing;
  insert into commerce_fulfillment_events(order_id,event_type,metadata) values(selected_order,'fulfillment_queued',jsonb_build_object('quoteId',quote.id,'idempotencyKey',p_idempotency_key));
  update commerce_checkout_quotes set status='completed',completed_at=now(),updated_at=now() where id=quote.id;
  delete from commerce_cart_items where cart_id=quote.cart_id; update commerce_carts set updated_at=now() where id=quote.cart_id;
  return jsonb_build_object('duplicate',false,'orderId',selected_order,'orderNumber',order_no,'totalCoins',quote.total_coins,'tokenBalance',balance_after,'itemCount',item_count,'merchandiseCoins',quote.merchandise_coins,'shippingCoins',quote.shipping_coins,'taxCoins',quote.tax_coins);
end $$;

revoke all on function public.complete_printify_merch_checkout(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.complete_printify_merch_checkout(uuid,uuid,text) to service_role;

create or replace function public.claim_printify_fulfillment_jobs(p_limit integer default 5)
returns setof public.printify_fulfillment_jobs
language sql
security definer
set search_path=public
as $$
  with candidates as (
    select id
    from public.printify_fulfillment_jobs
    where status in ('pending','retry')
      and next_attempt_at <= now()
    order by created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,5),20))
  )
  update public.printify_fulfillment_jobs jobs
  set status='processing', attempts=attempts+1, locked_at=now(), updated_at=now()
  from candidates
  where jobs.id=candidates.id
  returning jobs.*;
$$;

revoke all on function public.claim_printify_fulfillment_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_printify_fulfillment_jobs(integer) to service_role;
