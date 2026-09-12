begin;

create table if not exists public.external_platform_settings (
  id text primary key default 'primary',
  fansly_url text not null,
  fansly_enabled boolean not null default true,
  fansly_button_label text not null default 'JOIN CRAZY 8 ON FANSLY',
  fansly_handle text not null default '@XMASKEDFREAKS',
  fansly_biography text not null default '',
  fansly_hero_image text not null default '/branding/optimized/mask-logo-1024.png',
  clips_store_url text not null,
  clips_button_label text not null default 'VIEW THE FULL STORE',
  clips_biography text not null default '',
  updated_by uuid references public.admin_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (id = 'primary'),
  check (fansly_url ~ '^https://'),
  check (clips_store_url ~ '^https://')
);

create table if not exists public.clips4sale_items (
  id text primary key,
  title text not null,
  description text not null default '',
  thumbnail_url text not null,
  duration text not null default '',
  product_url text,
  sort_order integer not null default 100,
  published boolean not null default false,
  featured boolean not null default false,
  updated_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (product_url is null or product_url ~ '^https://')
);

create table if not exists public.vertical_catalog_settings (
  id text primary key default 'primary',
  speed_seconds integer not null default 36 check (speed_seconds between 12 and 90),
  paused boolean not null default false,
  updated_by uuid references public.admin_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (id = 'primary')
);

insert into public.external_platform_settings (
  id, fansly_url, fansly_handle, fansly_biography, clips_store_url, clips_biography
) values (
  'primary',
  'https://fansly.com/1SexualTension',
  '@XMASKEDFREAKS',
  'Ready to join Crazy 8? Our Fansly subscription gives you eight randomly selected videos every month, creating a new mix of XMASKEDFREAKS content each time. The selection is designed to keep the subscription unpredictable, entertaining, and worth returning to. Members can discover videos they may have missed, revisit standout moments, and experience a rotating monthly collection without having to choose every title individually. Join Crazy 8 and let us choose the eight videos waiting for you this month.',
  'https://www.clips4sale.com/studio/444327/xmaskedfreaks',
  'That video was good, wasn''t it? The full experience is waiting for you on our Clips4Sale store. We add downloadable videos regularly and new releases can appear at any time. Clips4Sale is where our newest full-length videos usually arrive first, so you may find something there that has not appeared in the live experience yet. Browse the collection, choose the video that catches your attention, and download it directly through Clips4Sale.'
) on conflict (id) do nothing;

insert into public.vertical_catalog_settings (id) values ('primary') on conflict (id) do nothing;

insert into public.clips4sale_items (id, title, description, thumbnail_url, duration, sort_order, published, featured)
select 'clip-' || value::text, 'Masked Preview ' || lpad(value::text, 2, '0'), 'Configure the exact product destination in ADMIN before publishing this tile.', '/assets/preview-' || lpad((((value - 1) % 4) + 1)::text, 2, '0') || '.svg', '', value, value <= 6, value = 1
from generate_series(1, 6) as value
on conflict (id) do nothing;

alter table public.external_platform_settings enable row level security;
alter table public.clips4sale_items enable row level security;
alter table public.vertical_catalog_settings enable row level security;

drop policy if exists "Public reads external platform settings" on public.external_platform_settings;
create policy "Public reads external platform settings" on public.external_platform_settings for select using (true);
drop policy if exists "Public reads published Clips4Sale items" on public.clips4sale_items;
create policy "Public reads published Clips4Sale items" on public.clips4sale_items for select using (published);
drop policy if exists "Public reads vertical catalog settings" on public.vertical_catalog_settings;
create policy "Public reads vertical catalog settings" on public.vertical_catalog_settings for select using (true);

alter table public.painting_auctions add column if not exists image_alt jsonb not null default '[]'::jsonb;
alter table public.painting_auctions add column if not exists image_captions jsonb not null default '[]'::jsonb;
alter table public.painting_auctions add column if not exists cover_image_index integer not null default 0 check (cover_image_index >= 0);
alter table public.painting_auctions alter column international_shipping set default true;
update public.painting_auctions set international_shipping = true, domestic_shipping = true, reserve_price = null, status = 'unsold' where status = 'reserve_not_met';
update public.painting_auctions set international_shipping = true, domestic_shipping = true, reserve_price = null where international_shipping is not true or reserve_price is not null;
alter table public.painting_auctions drop constraint if exists painting_auctions_status_check;
alter table public.painting_auctions add constraint painting_auctions_status_check check (status in ('draft','scheduled','live','extended','sold','unsold','cancelled','fulfillment_pending','shipped','delivered'));

create or replace function public.place_painting_bid(p_user_id uuid,p_auction_id uuid,p_amount integer,p_idempotency_key text) returns jsonb language plpgsql security definer set search_path=public as $$ declare auction painting_auctions%rowtype; balance bigint; reserved_other bigint; previous_user uuid; selected_bid uuid; next_min integer; increment_amount integer; begin
  if exists(select 1 from painting_bids where idempotency_key=p_idempotency_key) then raise exception 'DUPLICATE_ACTION'; end if;
  select * into auction from painting_auctions where id=p_auction_id for update; if not found or auction.status not in ('live','extended') or now()<auction.starts_at or now()>=auction.ends_at then raise exception 'AUCTION_CLOSED'; end if;
  increment_amount:=case when auction.current_bid<100 then 5 when auction.current_bid<500 then 10 when auction.current_bid<1000 then 25 when auction.current_bid<5000 then 50 else greatest(100,ceil((auction.current_bid*0.02)/10.0)::integer*10) end;
  next_min:=case when auction.bid_count=0 then auction.starting_bid else auction.current_bid+increment_amount end; if p_amount<next_min then raise exception 'BID_TOO_LOW'; end if;
  select user_id into previous_user from painting_bids where auction_id=p_auction_id and status in ('valid','winning') order by amount desc,created_at asc limit 1;
  select balance_tokens into balance from token_wallets where user_id=p_user_id for update; select coalesce(sum(amount),0) into reserved_other from coin_reservations where user_id=p_user_id and auction_id<>p_auction_id and status='active'; if coalesce(balance,0)-reserved_other<p_amount then raise exception 'INSUFFICIENT_AVAILABLE_COINS'; end if;
  update painting_bids set status='valid' where auction_id=p_auction_id and status='winning'; insert into painting_bids(auction_id,user_id,bidder_label,amount,idempotency_key,status) values(p_auction_id,p_user_id,'Bidder '||substr(p_user_id::text,1,6),p_amount,p_idempotency_key,'winning') returning id into selected_bid;
  update coin_reservations set status='released',released_at=now() where auction_id=p_auction_id and status='active'; insert into coin_reservations(user_id,auction_id,bid_id,amount,status) values(p_user_id,p_auction_id,selected_bid,p_amount,'active') on conflict(user_id,auction_id) do update set bid_id=excluded.bid_id,amount=excluded.amount,status='active',released_at=null,consumed_at=null;
  update painting_auctions set current_bid=p_amount,bid_count=bid_count+1,bidder_count=(select count(distinct user_id) from painting_bids where auction_id=p_auction_id and status<>'cancelled'),ends_at=case when anti_sniping_enabled and extension_count<anti_sniping_max_extensions and ends_at-now()<=make_interval(secs=>anti_sniping_window_seconds) then ends_at+make_interval(secs=>anti_sniping_extension_seconds) else ends_at end,status=case when anti_sniping_enabled and extension_count<anti_sniping_max_extensions and ends_at-now()<=make_interval(secs=>anti_sniping_window_seconds) then 'extended' else status end,extension_count=extension_count+case when anti_sniping_enabled and extension_count<anti_sniping_max_extensions and ends_at-now()<=make_interval(secs=>anti_sniping_window_seconds) then 1 else 0 end,updated_at=now() where id=p_auction_id;
  insert into auction_audit_events(auction_id,actor_user_id,event_type,metadata) values(p_auction_id,p_user_id,'bid_accepted',jsonb_build_object('amount',p_amount,'priorLeader',previous_user,'automaticIncrement',increment_amount)); return jsonb_build_object('accepted',true,'bidId',selected_bid,'amount',p_amount,'nextMinimum',p_amount+case when p_amount<100 then 5 when p_amount<500 then 10 when p_amount<1000 then 25 when p_amount<5000 then 50 else greatest(100,ceil((p_amount*0.02)/10.0)::integer*10) end); end $$;

create or replace function public.finalize_expired_painting_auctions() returns integer language plpgsql security definer set search_path=public as $$ declare auction painting_auctions%rowtype; winner painting_bids%rowtype; reservation coin_reservations%rowtype; balance bigint; v_order_id uuid; order_no text; processed integer:=0; begin
  for auction in select * from painting_auctions where status in ('live','extended') and ends_at<=now() for update skip locked loop
    select * into winner from painting_bids where auction_id=auction.id and status='winning' order by amount desc,created_at asc limit 1;
    if winner.id is null then update painting_auctions set status='unsold',updated_at=now() where id=auction.id; processed:=processed+1; continue; end if;
    select * into reservation from coin_reservations where user_id=winner.user_id and auction_id=auction.id and status='active' for update; select balance_tokens into balance from token_wallets where user_id=winner.user_id for update;
    if reservation.id is null or reservation.amount<winner.amount or coalesce(balance,0)<winner.amount then update painting_auctions set status='cancelled',updated_at=now() where id=auction.id; insert into auction_audit_events(auction_id,actor_user_id,event_type,metadata) values(auction.id,winner.user_id,'finalization_failed',jsonb_build_object('reason','reservation_or_balance')); processed:=processed+1; continue; end if;
    order_no:='XMF-ART-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)); insert into commerce_orders(order_number,user_id,total_coins,payment_status,fulfillment_status,is_international,idempotency_key) values(order_no,winner.user_id,winner.amount,'paid','new',false,'auction:'||auction.id::text) returning id into v_order_id;
    insert into commerce_order_items(order_id,auction_id,product_name_snapshot,product_type,image_url_snapshot,quantity,unit_coin_price_snapshot,line_total_coins) values(v_order_id,auction.id,auction.title,'painting',auction.images->>greatest(auction.cover_image_index,0),1,winner.amount,winner.amount); insert into commerce_fulfillments(order_id) values(v_order_id); insert into commerce_order_status_history(order_id,status,note) values(v_order_id,'new','Auction finalized; winner address pending'); update token_wallets set balance_tokens=balance-winner.amount,updated_at=now() where user_id=winner.user_id; update coin_reservations set status='consumed',consumed_at=now() where id=reservation.id; update painting_auctions set status='fulfillment_pending',updated_at=now() where id=auction.id; insert into auction_notifications(user_id,auction_id,notification_type,message) values(winner.user_id,auction.id,'won','You won '||auction.title||'. Submit your delivery address.'); processed:=processed+1;
  end loop; return processed; end $$;

revoke all on table public.external_platform_settings, public.clips4sale_items, public.vertical_catalog_settings from anon, authenticated;
grant select on table public.external_platform_settings, public.clips4sale_items, public.vertical_catalog_settings to anon, authenticated;
grant all on table public.external_platform_settings, public.clips4sale_items, public.vertical_catalog_settings to service_role;
revoke all on function public.place_painting_bid(uuid,uuid,integer,text), public.finalize_expired_painting_auctions() from public,anon,authenticated;
grant execute on function public.place_painting_bid(uuid,uuid,integer,text), public.finalize_expired_painting_auctions() to service_role;

commit;
