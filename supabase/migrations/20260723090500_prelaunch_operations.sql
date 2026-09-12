-- Additive pre-launch operations layer. No existing records or tables are removed.

alter table public.commerce_products add column if not exists restock_at timestamptz;
alter table public.commerce_products add column if not exists restock_notifications_enabled boolean not null default false;
alter table public.commerce_products add column if not exists show_exact_inventory boolean not null default false;
alter table public.product_variants add column if not exists low_stock_threshold integer not null default 0 check (low_stock_threshold >= 0);
alter table public.product_variants add column if not exists restock_at timestamptz;

create table if not exists public.restock_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  product_id uuid not null references public.commerce_products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,
  consented_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, product_id, variant_id)
);

create table if not exists public.customer_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  title text not null check (char_length(title) between 1 and 180),
  message text not null check (char_length(message) between 1 and 600),
  image_url text,
  destination_url text,
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  related_entity_type text,
  related_entity_id text,
  idempotency_key text not null unique,
  read_at timestamptz,
  dismissed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.site_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  image_url text,
  destination_url text,
  audience text not null default 'all_visitors' check (audience in ('all_visitors','customers','purchasers','admin_test')),
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  starts_at timestamptz,
  ends_at timestamptz,
  published boolean not null default false,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_templates (
  template_key text primary key,
  subject text not null,
  body_text text not null,
  header_image_url text,
  button_label text,
  enabled boolean not null default true,
  transactional boolean not null default true,
  allowed_variables text[] not null default '{}',
  updated_by uuid references public.admin_users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.email_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  recipient_email text not null,
  template_key text not null references public.email_templates(template_key),
  payload jsonb not null default '{}',
  related_entity_type text,
  related_entity_id text,
  idempotency_key text not null unique,
  status text not null default 'queued' check (status in ('queued','sending','sent','retry','failed','cancelled')),
  retry_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  failure_reason text
);

insert into public.email_templates(template_key,subject,body_text,transactional,allowed_variables) values
('account_created','Welcome to XMASKEDFREAKS','Hi {{nickname}}, your account is ready.',true,array['nickname']),
('email_verification','Verify your email','Hi {{nickname}}, verify your email to finish securing your account.',true,array['nickname','verificationUrl']),
('password_reset','Reset your password','Use the secure link to reset your password: {{resetUrl}}',true,array['resetUrl']),
('security_alert','New sign-in alert','Hi {{nickname}}, a new sign-in was detected for your account.',true,array['nickname']),
('coin_receipt','Coin purchase receipt','Hi {{nickname}}, {{coinAmount}} coins were added. Your balance is {{walletBalance}} coins.',true,array['nickname','coinAmount','walletBalance']),
('order_confirmation','Order {{orderNumber}} confirmed','Hi {{nickname}}, your order for {{productName}} is confirmed. Your wallet balance is {{walletBalance}} coins.',true,array['nickname','orderNumber','productName','walletBalance']),
('order_processing','Order {{orderNumber}} is processing','Your order is now being prepared.',true,array['orderNumber']),
('order_shipped','Order {{orderNumber}} shipped','Your order has shipped. Tracking: {{trackingNumber}}',true,array['orderNumber','trackingNumber']),
('order_delivered','Order {{orderNumber}} delivered','Your order has been marked delivered.',true,array['orderNumber']),
('order_cancelled','Order {{orderNumber}} cancelled','Your order was cancelled. Review your account for details.',true,array['orderNumber']),
('refund_issued','Refund issued','A refund for {{coinAmount}} coins has been completed.',true,array['coinAmount']),
('download_ready','Your download is ready','Hi {{nickname}}, {{productName}} is ready. Use the secure download from your account dashboard.',true,array['nickname','productName','downloadUrl']),
('restock','{{productName}} is back','Hi {{nickname}}, {{productName}} is available again.',false,array['nickname','productName']),
('live_alert','HURRY THEY''RE LIVE!!!!','{{message}}',false,array['message','liveUrl']),
('new_release','New from XMASKEDFREAKS','{{releaseTitle}} is now available.',false,array['releaseTitle']),
('support_response','Support update','Hi {{nickname}}, {{message}}',true,array['nickname','message','supportLink']),
('important_account_notice','Important account notice','Hi {{nickname}}, {{message}}',true,array['nickname','message'])
on conflict(template_key) do nothing;

create table if not exists public.policy_documents (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  requires_acceptance boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policy_documents(id) on delete cascade,
  version_number integer not null,
  body_text text not null,
  status text not null default 'draft' check (status in ('draft','scheduled','published','archived')),
  effective_at timestamptz,
  publish_at timestamptz,
  published_at timestamptz,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(policy_id, version_number)
);
alter table public.policy_versions add column if not exists language_code text not null default 'en';
create unique index if not exists policy_versions_language_version_idx on public.policy_versions(policy_id, language_code, version_number);

create table if not exists public.policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  policy_version_id uuid not null references public.policy_versions(id) on delete restrict,
  method text not null,
  session_reference_hash text,
  ip_hash text,
  accepted_at timestamptz not null default now(),
  unique(user_id, policy_version_id)
);

insert into public.policy_documents(slug,title,requires_acceptance) values
('terms','Terms of Service',true),
('privacy','Privacy Policy',true),
('dmca','DMCA Policy',false),
('refunds','Refund Policy',true),
('community','Community Rules',true),
('cookies','Cookie Policy',false),
('acceptable-use','Acceptable Use Policy',true),
('digital-downloads','Digital Download Policy',false),
('physical-orders','Physical Order Policy',false),
('paintings','Painting Purchase Policy',false),
('auctions','Auction Policy',false),
('international','International Shipping Notice',false),
('prerecorded','Prerecorded Content Notice',true),
('age','Age Restriction Notice',true)
on conflict(slug) do nothing;

create table if not exists public.maintenance_settings (
  id text primary key default 'primary' check (id = 'primary'),
  enabled boolean not null default false,
  title text not null default 'We will be right back',
  message text not null default 'XMASKEDFREAKS is receiving a scheduled update.',
  image_url text,
  expected_return_at timestamptz,
  support_url text,
  allowed_routes text[] not null default array['/policies','/api/health','/api/maintenance'],
  block_new_checkouts boolean not null default true,
  updated_by uuid references public.admin_users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.maintenance_settings(id) values('primary') on conflict(id) do nothing;

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  event_key text,
  anonymous_session_hash text,
  user_id uuid references auth.users(id) on delete set null,
  page_path text,
  content_type text,
  content_id text,
  search_term text,
  result_count integer,
  filter_value text,
  destination_type text,
  country_code text,
  language_code text,
  device_type text,
  referrer_host text,
  metadata jsonb not null default '{}',
  occurred_at timestamptz not null default now(),
  unique(event_type, event_key)
);

create index if not exists customer_notifications_user_unread_idx on public.customer_notifications(user_id, created_at desc) where read_at is null and dismissed_at is null;
create index if not exists email_delivery_jobs_queue_idx on public.email_delivery_jobs(status, next_attempt_at);
create index if not exists restock_requests_pending_idx on public.restock_requests(product_id, variant_id) where fulfilled_at is null and unsubscribed_at is null;
create unique index if not exists restock_requests_guest_unique_idx on public.restock_requests(lower(email),product_id,coalesce(variant_id,'00000000-0000-0000-0000-000000000000'::uuid)) where user_id is null and unsubscribed_at is null;
create unique index if not exists restock_requests_user_unique_idx on public.restock_requests(user_id,product_id,coalesce(variant_id,'00000000-0000-0000-0000-000000000000'::uuid)) where user_id is not null and unsubscribed_at is null;
create index if not exists policy_versions_public_idx on public.policy_versions(policy_id, status, published_at desc);
create index if not exists analytics_events_type_date_idx on public.analytics_events(event_type, occurred_at desc);
create index if not exists analytics_search_no_results_idx on public.analytics_events(occurred_at desc) where event_type='search' and result_count=0;

alter table public.restock_requests enable row level security;
alter table public.customer_notifications enable row level security;
alter table public.site_announcements enable row level security;
alter table public.email_templates enable row level security;
alter table public.email_delivery_jobs enable row level security;
alter table public.policy_documents enable row level security;
alter table public.policy_versions enable row level security;
alter table public.policy_acceptances enable row level security;
alter table public.maintenance_settings enable row level security;
alter table public.analytics_events enable row level security;

create policy "Customers manage own restock requests" on public.restock_requests for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "Customers read own notifications" on public.customer_notifications for select using(auth.uid()=user_id);
create policy "Customers update own notifications" on public.customer_notifications for update using(auth.uid()=user_id);
create policy "Public reads active announcements" on public.site_announcements for select using(published and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now()));
create policy "Public reads policy documents" on public.policy_documents for select using(true);
create policy "Public reads published policy versions" on public.policy_versions for select using(status='published' and (publish_at is null or publish_at<=now()));
create policy "Customers read own policy acceptances" on public.policy_acceptances for select using(auth.uid()=user_id);
create policy "Customers insert own policy acceptances" on public.policy_acceptances for insert with check(auth.uid()=user_id);

create or replace function public.queue_order_customer_communications()
returns trigger language plpgsql security definer set search_path=public as $$
declare profile_record profiles%rowtype;
declare wallet_balance bigint;
begin
  select * into profile_record from profiles where id=new.user_id;
  select balance_tokens into wallet_balance from token_wallets where user_id=new.user_id;
  insert into customer_notifications(user_id,notification_type,title,message,destination_url,priority,related_entity_type,related_entity_id,idempotency_key)
  values(new.user_id,'purchase_completed','Purchase complete','Order '||new.order_number||' was created successfully.','/account','high','commerce_order',new.id::text,'order:'||new.id::text)
  on conflict(idempotency_key) do nothing;
  if profile_record.email is not null and position('@' in profile_record.email) > 1 then
    insert into email_delivery_jobs(user_id,recipient_email,template_key,payload,related_entity_type,related_entity_id,idempotency_key)
    values(new.user_id,profile_record.email,'order_confirmation',jsonb_build_object('nickname',profile_record.display_name,'orderNumber',new.order_number,'productName','Order '||new.order_number,'walletBalance',coalesce(wallet_balance,0)),'commerce_order',new.id::text,'order-email:'||new.id::text)
    on conflict(idempotency_key) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists commerce_order_customer_communications on public.commerce_orders;
create trigger commerce_order_customer_communications after insert on public.commerce_orders for each row execute function public.queue_order_customer_communications();

create or replace function public.notify_wallet_change()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into customer_notifications(user_id,notification_type,title,message,destination_url,related_entity_type,related_entity_id,idempotency_key)
  values(new.user_id,case when new.total_coins>=0 then 'coins_added' else 'coins_spent' end,case when new.total_coins>=0 then 'Coins added' else 'Coins spent' end,abs(new.total_coins)||' coins were '||case when new.total_coins>=0 then 'added to' else 'used from' end||' your wallet.','/account','wallet_transaction',new.id::text,'wallet:'||new.id::text)
  on conflict(idempotency_key) do nothing;
  return new;
end $$;
drop trigger if exists wallet_customer_notification on public.wallet_transactions;
create trigger wallet_customer_notification after insert on public.wallet_transactions for each row execute function public.notify_wallet_change();

create or replace function public.queue_account_welcome()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.email is not null then
    insert into email_delivery_jobs(user_id,recipient_email,template_key,payload,related_entity_type,related_entity_id,idempotency_key)
    values(new.id,new.email,'account_created',jsonb_build_object('nickname',new.display_name),'profile',new.id::text,'account-welcome:'||new.id::text)
    on conflict(idempotency_key) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists profile_account_welcome on public.profiles;
create trigger profile_account_welcome after insert on public.profiles for each row execute function public.queue_account_welcome();

create or replace function public.protect_admin_audit_events()
returns trigger language plpgsql as $$
begin
  raise exception 'ADMIN_AUDIT_EVENTS_ARE_IMMUTABLE';
end $$;
drop trigger if exists admin_audit_events_immutable on public.admin_audit_events;
create trigger admin_audit_events_immutable before update or delete on public.admin_audit_events
for each row execute function public.protect_admin_audit_events();

-- Rollback: disable the two triggers first, then archive these additive tables.
