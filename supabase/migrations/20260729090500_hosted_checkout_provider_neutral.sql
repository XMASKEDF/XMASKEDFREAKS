-- Provider-neutral hosted checkout. No payment-card data is accepted or stored.

create table if not exists public.hosted_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  provider text not null check (provider in ('test','segpay','ccbill')),
  purpose text not null check (purpose in ('coin_purchase','physical_purchase','digital_purchase','tip','paid_access')),
  status text not null default 'CREATED' check (status in (
    'CREATED','PENDING_REDIRECT','REDIRECTED','PROCESSING','CONFIRMED','DECLINED',
    'CANCELLED','EXPIRED','FAILED','REQUIRES_REVIEW','RECONCILIATION_MISMATCH'
  )),
  package_id text,
  expected_amount_minor bigint not null check (expected_amount_minor > 0),
  expected_currency text not null default 'USD' check (char_length(expected_currency) = 3),
  expected_base_coins integer not null default 0 check (expected_base_coins >= 0),
  expected_bonus_coins integer not null default 0 check (expected_bonus_coins >= 0),
  expected_total_coins integer not null default 0 check (expected_total_coins >= 0),
  idempotency_key text not null unique,
  provider_checkout_reference text,
  provider_transaction_id text,
  environment text not null check (environment in ('test','production')),
  checkout_snapshot jsonb not null default '{}'::jsonb,
  terms_accepted boolean not null default false,
  coin_policy_acknowledged boolean not null default false,
  coin_policy_version text,
  redirected_at timestamptz,
  confirmed_at timestamptz,
  failed_at timestamptz,
  last_callback_at timestamptz,
  failure_reason text,
  reconciliation_status text not null default 'pending' check (reconciliation_status in ('pending','matched','review','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists hosted_payments_provider_transaction_unique
  on public.hosted_payments(provider, provider_transaction_id)
  where provider_transaction_id is not null;
create index if not exists hosted_payments_user_created_idx on public.hosted_payments(user_id, created_at desc);
create index if not exists hosted_payments_reconciliation_idx on public.hosted_payments(reconciliation_status, status, created_at);

create table if not exists public.hosted_payment_events (
  id uuid primary key default gen_random_uuid(),
  hosted_payment_id uuid references public.hosted_payments(id) on delete restrict,
  provider text not null check (provider in ('test','segpay','ccbill')),
  provider_event_id text not null,
  provider_transaction_id text,
  mapped_status text,
  signature_verified boolean not null,
  amount_minor bigint,
  currency text,
  environment text,
  sanitized_metadata jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  processing_result text,
  created_at timestamptz not null default now(),
  unique(provider, provider_event_id)
);

create table if not exists public.hosted_payment_reconciliation (
  id uuid primary key default gen_random_uuid(),
  hosted_payment_id uuid references public.hosted_payments(id) on delete restrict,
  finding_key text not null unique,
  finding_type text not null,
  severity text not null check (severity in ('low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','investigating','resolved','dismissed')),
  summary text not null,
  evidence jsonb not null default '{}'::jsonb,
  resolved_by uuid references public.admin_users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wallet_transactions
  add column if not exists hosted_payment_id uuid references public.hosted_payments(id) on delete restrict;
create unique index if not exists wallet_transactions_hosted_payment_unique
  on public.wallet_transactions(hosted_payment_id)
  where hosted_payment_id is not null;

alter table public.hosted_payments enable row level security;
alter table public.hosted_payment_events enable row level security;
alter table public.hosted_payment_reconciliation enable row level security;

drop policy if exists "Customers read own hosted payments" on public.hosted_payments;
create policy "Customers read own hosted payments" on public.hosted_payments
  for select using (auth.uid() = user_id);

revoke all on public.hosted_payments, public.hosted_payment_events, public.hosted_payment_reconciliation
  from public, anon, authenticated;
grant select on public.hosted_payments to authenticated;
grant all on public.hosted_payments, public.hosted_payment_events, public.hosted_payment_reconciliation to service_role;

-- Historical vault scaffold is retained as evidence but is unreachable from browsers.
revoke all on public.payment_methods, public.payment_intents, public.payment_webhook_events
  from public, anon, authenticated;

create or replace function public.confirm_hosted_coin_payment(
  p_payment_id uuid,
  p_provider text,
  p_provider_transaction_id text,
  p_amount_minor bigint,
  p_currency text,
  p_environment text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payment public.hosted_payments%rowtype;
  wallet_balance bigint;
  next_balance bigint;
  ledger_id uuid;
  profile_record public.profiles%rowtype;
begin
  select * into payment from public.hosted_payments where id = p_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;

  select id into ledger_id from public.wallet_transactions where hosted_payment_id = payment.id;
  if payment.status = 'CONFIRMED' and ledger_id is not null then
    select balance_tokens into wallet_balance from public.token_wallets where user_id = payment.user_id;
    return jsonb_build_object('duplicate', true, 'transactionId', ledger_id, 'tokenBalance', coalesce(wallet_balance, 0));
  end if;

  if payment.purpose <> 'coin_purchase'
    or payment.provider <> p_provider
    or payment.expected_amount_minor <> p_amount_minor
    or payment.expected_currency <> upper(p_currency)
    or payment.environment <> p_environment
  then
    update public.hosted_payments
      set status = 'RECONCILIATION_MISMATCH', reconciliation_status = 'review',
          failure_reason = 'Verified callback did not match the server-authoritative payment record.',
          last_callback_at = now(), updated_at = now()
      where id = payment.id;
    insert into public.hosted_payment_reconciliation(hosted_payment_id,finding_key,finding_type,severity,summary,evidence)
      values(payment.id,'callback-mismatch:'||payment.id::text,'callback_mismatch','critical',
        'A verified processor callback did not match the expected amount, currency, provider, purpose, or environment.',
        jsonb_build_object('receivedAmountMinor',p_amount_minor,'receivedCurrency',upper(p_currency),'receivedEnvironment',p_environment))
      on conflict(finding_key) do update set updated_at=now();
    return jsonb_build_object('credited', false, 'reviewRequired', true);
  end if;

  insert into public.token_wallets(user_id,balance_tokens)
    values(payment.user_id,0) on conflict(user_id) do nothing;
  select balance_tokens into wallet_balance from public.token_wallets where user_id=payment.user_id for update;
  next_balance := wallet_balance + payment.expected_total_coins;
  update public.token_wallets set balance_tokens=next_balance,updated_at=now() where user_id=payment.user_id;

  insert into public.wallet_transactions(
    user_id,transaction_type,amount,base_amount,currency,base_currency,balance_after,
    base_coins,bonus_coins,total_coins,processor_reference,idempotency_key,status,note,
    final_transaction_result,coin_policy_acknowledged,coin_policy_version,hosted_payment_id
  ) values (
    payment.user_id,'COIN_PURCHASE',payment.expected_amount_minor::numeric/100,
    payment.expected_amount_minor::numeric/100,payment.expected_currency,payment.expected_currency,next_balance,
    payment.expected_base_coins,payment.expected_bonus_coins,payment.expected_total_coins,
    p_provider_transaction_id,'hosted-payment:'||payment.id::text,'confirmed',
    'Hosted coin package '||coalesce(payment.package_id,'unknown'),'confirmed',
    payment.coin_policy_acknowledged,payment.coin_policy_version,payment.id
  ) returning id into ledger_id;

  update public.hosted_payments
    set status='CONFIRMED',provider_transaction_id=p_provider_transaction_id,confirmed_at=now(),
        last_callback_at=now(),reconciliation_status='matched',updated_at=now()
    where id=payment.id;

  insert into public.analytics_events(event_type,event_key,user_id,page_path,content_type,content_id,metadata)
    values('hosted_coin_payment_confirmed','hosted-payment:'||payment.id::text,payment.user_id,
      '/wallet','coin_package',payment.package_id,
      jsonb_build_object('paymentId',payment.id,'provider',payment.provider,'amountMinor',payment.expected_amount_minor,
        'currency',payment.expected_currency,'baseCoins',payment.expected_base_coins,
        'bonusCoins',payment.expected_bonus_coins,'totalCoins',payment.expected_total_coins))
    on conflict(event_type,event_key) do nothing;

  select * into profile_record from public.profiles where id=payment.user_id;
  if profile_record.email is not null and position('@' in profile_record.email)>1 then
    insert into public.email_delivery_jobs(user_id,recipient_email,template_key,payload,related_entity_type,related_entity_id,idempotency_key)
      values(payment.user_id,profile_record.email,'coin_receipt',
        jsonb_build_object('nickname',profile_record.display_name,'coinAmount',payment.expected_total_coins,'walletBalance',next_balance),
        'hosted_payment',payment.id::text,'hosted-payment-email:'||payment.id::text)
      on conflict(idempotency_key) do nothing;
  end if;

  return jsonb_build_object('duplicate',false,'transactionId',ledger_id,'tokenBalance',next_balance,'creditedCoins',payment.expected_total_coins);
end;
$$;

create or replace function public.scan_hosted_payment_reconciliation()
returns table(finding_key text,finding_type text,severity text,summary text,payment_id uuid)
language sql
security definer
set search_path=public
as $$
  select 'confirmed-without-ledger:'||p.id::text,'confirmed_without_ledger','critical',
    'Confirmed hosted payment has no wallet ledger credit.',p.id
  from hosted_payments p
  left join wallet_transactions w on w.hosted_payment_id=p.id
  where p.status='CONFIRMED' and w.id is null
  union all
  select 'ledger-without-confirmation:'||p.id::text,'ledger_without_confirmation','critical',
    'Wallet ledger credit exists without a confirmed hosted payment.',p.id
  from hosted_payments p
  join wallet_transactions w on w.hosted_payment_id=p.id
  where p.status<>'CONFIRMED'
  union all
  select 'stuck-payment:'||p.id::text,'stuck_pending','high',
    'Hosted payment has remained pending for more than two hours.',p.id
  from hosted_payments p
  where p.status in ('CREATED','PENDING_REDIRECT','REDIRECTED','PROCESSING')
    and p.created_at < now()-interval '2 hours'
$$;

create or replace function public.protect_hosted_payment_events()
returns trigger language plpgsql as $$
begin raise exception 'HOSTED_PAYMENT_EVENTS_ARE_IMMUTABLE'; end
$$;
drop trigger if exists hosted_payment_events_immutable on public.hosted_payment_events;
create trigger hosted_payment_events_immutable before update or delete on public.hosted_payment_events
for each row execute function public.protect_hosted_payment_events();

revoke all on function public.confirm_hosted_coin_payment(uuid,text,text,bigint,text,text) from public,anon,authenticated;
revoke all on function public.scan_hosted_payment_reconciliation() from public,anon,authenticated;
grant execute on function public.confirm_hosted_coin_payment(uuid,text,text,bigint,text,text) to service_role;
grant execute on function public.scan_hosted_payment_reconciliation() to service_role;
