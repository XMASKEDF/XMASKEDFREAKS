-- Live quick tips use the existing hosted payment boundary but never become wallet packages or cart orders.

alter table public.tip_menu_settings
  add column if not exists quick_tip_amounts jsonb not null default '[
    {"id":"quick-5","label":"$5","tokenCost":10,"enabled":true,"displayOrder":1},
    {"id":"quick-8","label":"$8","tokenCost":16,"enabled":true,"displayOrder":2},
    {"id":"quick-10","label":"$10","tokenCost":20,"enabled":true,"displayOrder":3},
    {"id":"quick-16","label":"$16","tokenCost":32,"enabled":true,"displayOrder":4},
    {"id":"quick-20","label":"$20","tokenCost":40,"enabled":true,"displayOrder":5},
    {"id":"quick-32","label":"$32","tokenCost":64,"enabled":true,"displayOrder":6}
  ]'::jsonb;

alter table public.hosted_payments
  add column if not exists subject_ref text,
  add column if not exists guest_reference text,
  add column if not exists live_display_name text,
  add column if not exists live_message text,
  add column if not exists live_anonymous boolean not null default false;

alter table public.hosted_payments
  alter column user_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.hosted_payments'::regclass
      and conname = 'hosted_payments_identity_check'
  ) then
    alter table public.hosted_payments
      add constraint hosted_payments_identity_check
      check (user_id is not null or guest_reference is not null);
  end if;
end $$;

create index if not exists hosted_payments_subject_created_idx
  on public.hosted_payments(subject_ref, created_at desc);
create index if not exists hosted_payments_guest_created_idx
  on public.hosted_payments(guest_reference, created_at desc)
  where guest_reference is not null;

create or replace function public.confirm_hosted_live_tip_payment(
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
  settings public.contribution_rule_settings%rowtype;
  period public.contribution_watch_periods%rowtype;
  subject text;
  transaction_id uuid;
  credit_snapshot jsonb;
  next_requirement_satisfied boolean;
begin
  select * into payment
  from public.hosted_payments
  where id = p_payment_id
  for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;

  subject := coalesce(payment.subject_ref, payment.guest_reference);
  if payment.status = 'CONFIRMED' then
    select id into transaction_id
    from public.contribution_transactions
    where transaction_reference = p_provider_transaction_id;
    if transaction_id is not null then
      return jsonb_build_object('credited', false, 'duplicate', true, 'transactionId', transaction_id, 'subjectRef', subject);
    end if;
  end if;

  if payment.purpose <> 'tip'
    or payment.provider <> p_provider
    or payment.expected_amount_minor <> p_amount_minor
    or payment.expected_currency <> upper(p_currency)
    or payment.environment <> p_environment
    or subject is null
    or payment.expected_total_coins < 1
    or p_provider_transaction_id is null
  then
    update public.hosted_payments
      set status = 'RECONCILIATION_MISMATCH', reconciliation_status = 'review',
          failure_reason = 'Verified Live tip callback did not match the server-authoritative payment record.',
          last_callback_at = now(), updated_at = now()
    where id = payment.id;
    insert into public.hosted_payment_reconciliation(hosted_payment_id, finding_key, finding_type, severity, summary, evidence)
      values(payment.id, 'live-tip-callback-mismatch:' || payment.id::text, 'callback_mismatch', 'critical',
        'A verified Live tip callback did not match the expected amount, currency, provider, purpose, environment, or identity.',
        jsonb_build_object('receivedAmountMinor', p_amount_minor, 'receivedCurrency', upper(p_currency), 'receivedEnvironment', p_environment))
      on conflict(finding_key) do update set updated_at = now();
    return jsonb_build_object('credited', false, 'reviewRequired', true);
  end if;

  select id into transaction_id
  from public.contribution_transactions
  where transaction_reference = p_provider_transaction_id;
  if transaction_id is not null then
    update public.hosted_payments
      set status = 'RECONCILIATION_MISMATCH', reconciliation_status = 'review',
          failure_reason = 'Provider transaction reference was already used by another contribution.',
          last_callback_at = now(), updated_at = now()
    where id = payment.id;
    return jsonb_build_object('credited', false, 'reviewRequired', true);
  end if;

  select * into settings from public.contribution_rule_settings where id = 1;
  select * into period
  from public.contribution_watch_periods
  where subject_ref = subject and completed_at is null
  order by started_at desc
  limit 1
  for update;
  if period.id is null then
    insert into public.contribution_watch_periods(subject_ref, user_id, required_coins)
      values(subject, payment.user_id, coalesce(settings.required_coins, 10))
      returning * into period;
  end if;

  insert into public.contribution_transactions(period_id, user_id, category, coins, transaction_reference, source)
    values(period.id, payment.user_id, 'tip', payment.expected_total_coins, left(p_provider_transaction_id, 180), 'direct_live_tip')
    returning id into transaction_id;

  next_requirement_satisfied := (period.tip_coins + period.purchase_coins + payment.expected_total_coins) >= period.required_coins;
  update public.contribution_watch_periods
    set tip_coins = tip_coins + payment.expected_total_coins,
        requirement_satisfied = next_requirement_satisfied,
        updated_at = now()
  where id = period.id;

  update public.contribution_restrictions
    set last_contribution_at = now(),
        total_verified_tip_coins = total_verified_tip_coins + payment.expected_total_coins,
        updated_at = now()
  where subject_ref = subject;

  credit_snapshot := public.apply_live_viewing_credit(
    subject,
    payment.user_id,
    left(p_provider_transaction_id, 180),
    payment.expected_total_coins,
    null,
    p_environment
  );

  update public.hosted_payments
    set status = 'CONFIRMED', provider_transaction_id = p_provider_transaction_id,
        confirmed_at = now(), last_callback_at = now(), reconciliation_status = 'matched', updated_at = now()
  where id = payment.id;

  insert into public.analytics_events(event_type, event_key, user_id, page_path, content_type, content_id, metadata)
    values('hosted_live_tip_confirmed', 'hosted-live-tip:' || payment.id::text, payment.user_id,
      '/live', 'live_tip', payment.id::text,
      jsonb_build_object('paymentId', payment.id, 'provider', payment.provider,
        'amountMinor', payment.expected_amount_minor, 'coins', payment.expected_total_coins,
        'subjectRef', subject, 'stage', coalesce(payment.checkout_snapshot->>'stage', 'voluntary')))
    on conflict(event_type, event_key) do nothing;

  return jsonb_build_object(
    'credited', true, 'duplicate', false, 'transactionId', transaction_id,
    'contributionCoins', payment.expected_total_coins, 'subjectRef', subject,
    'requirementSatisfied', next_requirement_satisfied, 'viewingCredit', credit_snapshot
  );
end;
$$;

revoke all on function public.confirm_hosted_live_tip_payment(uuid, text, text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.confirm_hosted_live_tip_payment(uuid, text, text, bigint, text, text) to service_role;
