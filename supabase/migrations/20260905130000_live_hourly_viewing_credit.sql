-- Server-authoritative refillable Live viewing credit. This migration is additive:
-- entry contribution periods and wallet/order history remain unchanged.
alter table if exists public.contribution_rule_settings
  add column if not exists hourly_rate_coins integer not null default 32,
  add column if not exists hourly_rate_minor integer not null default 1600,
  add column if not exists entry_grace_seconds integer not null default 180,
  add column if not exists low_credit_threshold_seconds integer not null default 120,
  add column if not exists refill_warning_seconds integer not null default 70,
  add column if not exists refill_final_warning_seconds integer not null default 46,
  add column if not exists redirect_grace_seconds integer not null default 30;

create table if not exists public.live_viewing_credit_accounts (
  subject_ref text not null,
  user_id uuid references auth.users(id) on delete set null,
  environment text not null default 'production' check (environment in ('production','sandbox')),
  entry_requirement_satisfied boolean not null default false,
  entry_satisfied_at timestamptz,
  entry_coins_applied integer not null default 0 check (entry_coins_applied >= 0),
  entry_progress_coins integer not null default 0 check (entry_progress_coins >= 0 and entry_progress_coins < 10),
  grace_expires_at timestamptz,
  credit_half_seconds bigint not null default 0 check (credit_half_seconds >= 0),
  consumed_half_seconds bigint not null default 0 check (consumed_half_seconds >= 0),
  last_consumed_at timestamptz,
  last_playback_session_id text,
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (subject_ref, environment)
);

create index if not exists live_viewing_credit_accounts_user_idx
  on public.live_viewing_credit_accounts(user_id, environment, updated_at desc);

create table if not exists public.live_viewing_credit_events (
  id uuid primary key default gen_random_uuid(),
  subject_ref text not null,
  user_id uuid references auth.users(id) on delete set null,
  environment text not null default 'production' check (environment in ('production','sandbox')),
  event_type text not null check (event_type in ('entry','refill','consume')),
  transaction_reference text,
  playback_session_id text,
  coin_amount integer not null default 0 check (coin_amount >= 0),
  credited_half_seconds bigint not null default 0 check (credited_half_seconds >= 0),
  consumed_half_seconds bigint not null default 0 check (consumed_half_seconds >= 0),
  balance_before_half_seconds bigint not null default 0 check (balance_before_half_seconds >= 0),
  balance_after_half_seconds bigint not null default 0 check (balance_after_half_seconds >= 0),
  created_at timestamptz not null default now(),
  unique (environment, transaction_reference)
);

create index if not exists live_viewing_credit_events_subject_idx
  on public.live_viewing_credit_events(subject_ref, environment, created_at desc);

alter table if exists public.live_viewer_sessions
  add column if not exists paid_watch_half_seconds bigint not null default 0 check (paid_watch_half_seconds >= 0),
  add column if not exists credit_before_half_seconds bigint,
  add column if not exists credit_after_half_seconds bigint,
  add column if not exists post_cutoff boolean not null default false,
  add column if not exists post_cutoff_contribution_at timestamptz;

create or replace function public.get_live_viewing_credit(
  p_subject_ref text, p_user_id uuid default null, p_environment text default 'production'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare account live_viewing_credit_accounts%rowtype;
begin
  select * into account from public.live_viewing_credit_accounts
    where subject_ref = p_subject_ref and environment = p_environment;
  if account.subject_ref is null then
    return jsonb_build_object('entryRequirementSatisfied', false, 'graceExpiresAt', null,
      'creditHalfSeconds', 0, 'consumedHalfSeconds', 0, 'lastConsumedAt', null);
  end if;
  return jsonb_build_object(
    'entryRequirementSatisfied', account.entry_requirement_satisfied,
    'graceExpiresAt', account.grace_expires_at,
    'creditHalfSeconds', account.credit_half_seconds,
    'consumedHalfSeconds', account.consumed_half_seconds,
    'lastConsumedAt', account.last_consumed_at
  );
end $$;

create or replace function public.apply_live_viewing_credit(
  p_subject_ref text, p_user_id uuid, p_transaction_reference text,
  p_coins integer, p_playback_session_id text default null,
  p_environment text default 'production'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  account live_viewing_credit_accounts%rowtype;
  existing_event live_viewing_credit_events%rowtype;
  entry_coins integer := 0;
  hourly_coins integer := 0;
  entry_progress integer := 0;
  added_half_seconds bigint := 0;
  balance_before bigint := 0;
  is_new_entry boolean := false;
  entry_required integer := 10;
  grace_seconds integer := 180;
begin
  if p_coins is null or p_coins < 1 or p_transaction_reference is null or length(trim(p_transaction_reference)) = 0 then
    raise exception 'INVALID_VIEWING_CREDIT_INPUT';
  end if;
  select * into existing_event from public.live_viewing_credit_events
    where environment = p_environment and transaction_reference = left(p_transaction_reference, 180);
  if existing_event.id is not null then
    select * into account from public.live_viewing_credit_accounts
      where subject_ref = p_subject_ref and environment = p_environment for update;
    return jsonb_build_object('duplicate', true, 'entryRequirementSatisfied', coalesce(account.entry_requirement_satisfied, false),
      'graceExpiresAt', account.grace_expires_at, 'creditHalfSeconds', coalesce(account.credit_half_seconds, 0),
      'consumedHalfSeconds', coalesce(account.consumed_half_seconds, 0), 'addedHalfSeconds', 0,
      'entryCoins', 0, 'hourlyCoins', 0);
  end if;
  select coalesce(entry_grace_seconds, 180)
    into grace_seconds from public.contribution_rule_settings where id = 1;
  insert into public.live_viewing_credit_accounts(subject_ref, user_id, environment)
    values (p_subject_ref, p_user_id, p_environment)
    on conflict (subject_ref, environment) do nothing;
  select * into account from public.live_viewing_credit_accounts
    where subject_ref = p_subject_ref and environment = p_environment for update;
  balance_before := account.credit_half_seconds;
  if not account.entry_requirement_satisfied then
    entry_progress := account.entry_progress_coins + p_coins;
    if entry_progress < entry_required then
      update public.live_viewing_credit_accounts set
        entry_progress_coins = entry_progress,
        last_playback_session_id = coalesce(p_playback_session_id, last_playback_session_id),
        version = version + 1, updated_at = now()
        where subject_ref = p_subject_ref and environment = p_environment;
      insert into public.live_viewing_credit_events(subject_ref,user_id,environment,event_type,transaction_reference,playback_session_id,coin_amount,credited_half_seconds,balance_before_half_seconds,balance_after_half_seconds)
        values(p_subject_ref,p_user_id,p_environment,'entry',left(p_transaction_reference,180),p_playback_session_id,p_coins,0,balance_before,balance_before);
      return jsonb_build_object('duplicate', false, 'entryRequirementSatisfied', false,
        'graceExpiresAt', account.grace_expires_at, 'creditHalfSeconds', balance_before,
        'consumedHalfSeconds', account.consumed_half_seconds, 'addedHalfSeconds', 0,
        'entryCoins', 0, 'hourlyCoins', 0, 'entryProgressCoins', entry_progress);
    end if;
    entry_coins := entry_required;
    hourly_coins := entry_progress - entry_required;
    is_new_entry := true;
  else
    hourly_coins := p_coins;
  end if;
  added_half_seconds := hourly_coins * 225;
  update public.live_viewing_credit_accounts set
    user_id = coalesce(p_user_id, user_id),
    entry_requirement_satisfied = entry_requirement_satisfied or is_new_entry,
    entry_satisfied_at = case when is_new_entry then coalesce(entry_satisfied_at, now()) else entry_satisfied_at end,
    entry_coins_applied = entry_coins_applied + entry_coins,
    entry_progress_coins = case when is_new_entry then 0 else entry_progress_coins end,
    grace_expires_at = case when is_new_entry then now() + make_interval(secs => grace_seconds) else grace_expires_at end,
    credit_half_seconds = credit_half_seconds + added_half_seconds,
    last_playback_session_id = coalesce(p_playback_session_id, last_playback_session_id),
    version = version + 1, updated_at = now()
    where subject_ref = p_subject_ref and environment = p_environment;
  insert into public.live_viewing_credit_events(subject_ref,user_id,environment,event_type,transaction_reference,playback_session_id,coin_amount,credited_half_seconds,balance_before_half_seconds,balance_after_half_seconds)
    values(p_subject_ref,p_user_id,p_environment,case when is_new_entry then 'entry' else 'refill' end,left(p_transaction_reference,180),p_playback_session_id,p_coins,added_half_seconds,balance_before,balance_before+added_half_seconds);
  select * into account from public.live_viewing_credit_accounts
    where subject_ref = p_subject_ref and environment = p_environment;
  return jsonb_build_object('duplicate', false, 'entryRequirementSatisfied', account.entry_requirement_satisfied,
    'graceExpiresAt', account.grace_expires_at, 'creditHalfSeconds', account.credit_half_seconds,
    'consumedHalfSeconds', account.consumed_half_seconds, 'addedHalfSeconds', added_half_seconds,
    'entryCoins', entry_coins, 'hourlyCoins', hourly_coins);
end $$;

create or replace function public.consume_live_viewing_credit(
  p_subject_ref text, p_user_id uuid, p_playback_session_id text,
  p_active boolean, p_environment text default 'production'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  account live_viewing_credit_accounts%rowtype;
  elapsed_half_seconds bigint := 0;
  consumed_now bigint := 0;
  grace_active boolean := false;
begin
  select * into account from public.live_viewing_credit_accounts
    where subject_ref = p_subject_ref and environment = p_environment for update;
  if account.subject_ref is null then
    return jsonb_build_object('entryRequirementSatisfied',false,'graceExpiresAt',null,'creditHalfSeconds',0,'consumedHalfSeconds',0,'consumedNowHalfSeconds',0,'zero',true);
  end if;
  grace_active := account.grace_expires_at is not null and account.grace_expires_at > now();
  if account.last_consumed_at is null then
    elapsed_half_seconds := 0;
  elsif p_active and account.entry_requirement_satisfied and not grace_active then
    elapsed_half_seconds := least(90, greatest(0, floor(extract(epoch from (now() - account.last_consumed_at)) * 2))::bigint);
  end if;
  consumed_now := least(account.credit_half_seconds, elapsed_half_seconds);
  update public.live_viewing_credit_accounts set
    credit_half_seconds = credit_half_seconds - consumed_now,
    consumed_half_seconds = consumed_half_seconds + consumed_now,
    last_consumed_at = now(),
    last_playback_session_id = coalesce(p_playback_session_id, last_playback_session_id),
    version = version + case when consumed_now > 0 then 1 else 0 end,
    updated_at = now()
    where subject_ref = p_subject_ref and environment = p_environment;
  return jsonb_build_object('entryRequirementSatisfied',account.entry_requirement_satisfied,
    'graceExpiresAt',account.grace_expires_at,'creditHalfSeconds',account.credit_half_seconds-consumed_now,
    'consumedHalfSeconds',account.consumed_half_seconds+consumed_now,
    'consumedNowHalfSeconds',consumed_now,'lastConsumedAt',now(),
    'zero',(account.credit_half_seconds-consumed_now) <= 0 and not grace_active);
end $$;

alter table public.live_viewing_credit_accounts enable row level security;
alter table public.live_viewing_credit_events enable row level security;
revoke all on public.live_viewing_credit_accounts, public.live_viewing_credit_events from anon, authenticated;
grant execute on function public.get_live_viewing_credit(text,uuid,text) to service_role;
grant execute on function public.apply_live_viewing_credit(text,uuid,text,integer,text,text) to service_role;
grant execute on function public.consume_live_viewing_credit(text,uuid,text,boolean,text) to service_role;
