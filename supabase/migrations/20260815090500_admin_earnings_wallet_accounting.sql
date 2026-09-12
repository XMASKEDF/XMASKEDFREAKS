alter table public.admin_earnings_wallet add column if not exists lifetime_gross_earnings_minor bigint not null default 0 check (lifetime_gross_earnings_minor >= 0);
alter table public.admin_earnings_wallet add column if not exists lifetime_net_earnings_minor bigint not null default 0 check (lifetime_net_earnings_minor >= 0);
alter table public.admin_earnings_wallet add column if not exists deposited_total_minor bigint not null default 0 check (deposited_total_minor >= 0);
alter table public.admin_earnings_wallet add column if not exists pending_processor_minor bigint not null default 0 check (pending_processor_minor >= 0);
alter table public.admin_earnings_wallet add column if not exists reserve_minor bigint not null default 0 check (reserve_minor >= 0);

create table if not exists public.admin_deposit_batches (
  id uuid primary key default gen_random_uuid(),
  payout_request_id uuid unique references public.admin_payout_requests(id) on delete set null,
  gross_amount_minor bigint not null default 0 check (gross_amount_minor >= 0),
  fee_amount_minor bigint not null default 0 check (fee_amount_minor >= 0),
  net_amount_minor bigint not null default 0 check (net_amount_minor >= 0),
  destination_last4 text check (destination_last4 is null or destination_last4 ~ '^[0-9]{4}$'),
  provider text not null,
  method text not null default 'provider_settlement',
  requested_at timestamptz not null default now(),
  confirmed_at timestamptz,
  settlement_status text not null default 'pending' check (settlement_status in ('pending','confirmed','failed','reconciliation_required')),
  provider_reference text
);

alter table public.admin_earnings_ledger add column if not exists deposit_batch_id uuid references public.admin_deposit_batches(id) on delete set null;
create index if not exists admin_earnings_ledger_deposit_idx on public.admin_earnings_ledger(deposit_batch_id);
alter table public.admin_deposit_batches enable row level security;
revoke all on public.admin_deposit_batches from public, anon, authenticated;

create or replace function public.record_verified_admin_earning(
  p_category text, p_source_type text, p_source_id text, p_amount_minor bigint,
  p_shipping_minor bigint default 0, p_fulfillment_cost_minor bigint default null, p_processor_fee_minor bigint default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_inserted boolean := false; v_net bigint;
begin
  if p_amount_minor < 0 then raise exception 'INVALID_EARNING_AMOUNT'; end if;
  -- Serialize ledger insertion with payout confirmation so a concurrent earning
  -- cannot be marked settled without being included in the captured balance.
  perform 1 from admin_earnings_wallet where id=1 for update;
  v_net := greatest(0, p_amount_minor - greatest(0, p_shipping_minor) - greatest(0, coalesce(p_fulfillment_cost_minor, 0)) - greatest(0, coalesce(p_processor_fee_minor, 0)));
  insert into admin_earnings_ledger(category,source_type,source_id,gross_amount_minor,shipping_amount_minor,fulfillment_cost_minor,processor_fee_minor)
    values(p_category,p_source_type,p_source_id,p_amount_minor,greatest(0,p_shipping_minor),p_fulfillment_cost_minor,p_processor_fee_minor)
    on conflict(source_type,source_id) do nothing returning id into v_id;
  if v_id is not null then
    update admin_earnings_wallet set current_balance_minor=current_balance_minor+v_net,lifetime_gross_earnings_minor=lifetime_gross_earnings_minor+p_amount_minor,lifetime_net_earnings_minor=lifetime_net_earnings_minor+v_net,updated_at=now() where id=1;
    v_inserted := true;
  else select id into v_id from admin_earnings_ledger where source_type=p_source_type and source_id=p_source_id limit 1; end if;
  return jsonb_build_object('recorded',v_inserted,'ledgerId',v_id,'duplicate',not v_inserted,'netAmountMinor',v_net);
end $$;

create or replace function public.confirm_admin_payout(p_payout_request_id uuid, p_provider_reference text, p_confirmed_at timestamptz default now()) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_request public.admin_payout_requests%rowtype; v_wallet public.admin_earnings_wallet%rowtype; v_batch uuid; v_amount bigint;
begin
  select * into v_request from admin_payout_requests where id=p_payout_request_id for update;
  if v_request.id is null then raise exception 'PAYOUT_NOT_FOUND'; end if;
  if v_request.status = 'confirmed' then return jsonb_build_object('duplicate', true, 'payoutId', v_request.id); end if;
  if v_request.status not in ('action_required','queued','processing','submitted') then raise exception 'PAYOUT_NOT_CONFIRMABLE'; end if;
  if nullif(trim(p_provider_reference), '') is null then raise exception 'PROVIDER_REFERENCE_REQUIRED'; end if;
  p_confirmed_at := coalesce(p_confirmed_at, now());
  select * into v_wallet from admin_earnings_wallet where id=1 for update;
  v_amount := v_wallet.current_balance_minor;
  if v_amount <= 0 then raise exception 'NO_ELIGIBLE_EARNINGS'; end if;
  insert into admin_deposit_batches(payout_request_id,gross_amount_minor,fee_amount_minor,net_amount_minor,destination_last4,provider,requested_at,confirmed_at,settlement_status,provider_reference)
    values(v_request.id,v_amount,v_request.fee_minor,greatest(0,v_amount-v_request.fee_minor),v_request.destination_last4,v_request.provider,v_request.requested_at,p_confirmed_at,'confirmed',p_provider_reference) returning id into v_batch;
  update admin_earnings_ledger set deposit_batch_id=v_batch,settled_at=p_confirmed_at where settled_at is null and status='verified';
  update admin_payout_requests set status='confirmed',provider_reference=p_provider_reference,confirmed_at=p_confirmed_at where id=v_request.id;
  update admin_earnings_wallet set current_balance_minor=0,deposited_total_minor=deposited_total_minor+v_amount,updated_at=p_confirmed_at where id=1;
  insert into admin_payout_events(payout_request_id,event_type,previous_status,next_status,provider_reference,metadata) values(v_request.id,'provider_confirmed',v_request.status,'confirmed',p_provider_reference,jsonb_build_object('depositBatchId',v_batch,'amountMinor',v_amount));
  return jsonb_build_object('confirmed',true,'payoutId',v_request.id,'depositBatchId',v_batch,'amountMinor',v_amount);
end $$;

revoke all on function public.confirm_admin_payout(uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.confirm_admin_payout(uuid,text,timestamptz) to service_role;
