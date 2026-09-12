-- Replaces the legacy paid-access lock with the server-authoritative
-- 25-Minute Contribution Rule. Historical financial rows remain unchanged.
create table if not exists public.contribution_rule_settings (
  id integer primary key default 1 check (id = 1),
  rule_name text not null default '25-Minute Contribution Rule',
  period_seconds integer not null default 1500 check (period_seconds >= 60),
  required_coins integer not null default 6 check (required_coins >= 1),
  reminder_at_seconds integer not null default 1200 check (reminder_at_seconds >= 0),
  reminder_duration_seconds integer not null default 16 check (reminder_duration_seconds = 16),
  grace_seconds integer not null default 120 check (grace_seconds >= 0),
  ignored_notices_before_restriction integer not null default 1 check (ignored_notices_before_restriction >= 1),
  repeat_attempt_threshold integer check (repeat_attempt_threshold is null or repeat_attempt_threshold >= 1),
  large_tip_threshold_coins integer not null default 20 check (large_tip_threshold_coins >= 6),
  coin_purchase_threshold_coins integer check (coin_purchase_threshold_coins is null or coin_purchase_threshold_coins >= 1),
  merchandise_threshold_coins integer check (merchandise_threshold_coins is null or merchandise_threshold_coins >= 1),
  exemption_duration_minutes integer not null default 60 check (exemption_duration_minutes >= 1),
  maximum_exemption_minutes integer not null default 1440 check (maximum_exemption_minutes >= exemption_duration_minutes),
  exemption_scope text not null default 'current_period' check (exemption_scope in ('current_period','live_session','future_sessions')),
  eligible_purchase_categories text[] not null default array['tip','coin_purchase','merchandise','digital_purchase'],
  activity_protection_seconds integer not null default 300 check (activity_protection_seconds between 0 and 900),
  checkout_protection_seconds integer not null default 600 check (checkout_protection_seconds between 60 and 1800),
  guest_enforcement_enabled boolean not null default true,
  anonymous_tip_events_enabled boolean not null default true,
  public_tip_messages_enabled boolean not null default true,
  clips4sale_destination_reference text not null default 'external_platforms.clips4sale',
  legacy_twenty_five_dollar_rule_disabled boolean not null default true check (legacy_twenty_five_dollar_rule_disabled),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

insert into public.contribution_rule_settings (id) values (1) on conflict (id) do update
set rule_name='25-Minute Contribution Rule', required_coins=6,
    reminder_duration_seconds=16, large_tip_threshold_coins=20,
    legacy_twenty_five_dollar_rule_disabled=true, updated_at=now();

create table if not exists public.contribution_watch_periods (
  id uuid primary key default gen_random_uuid(),
  subject_ref text not null,
  user_id uuid references auth.users(id) on delete set null,
  period_number bigint not null default 1,
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  last_browsing_at timestamptz,
  active_watch_seconds integer not null default 0,
  tip_coins integer not null default 0,
  purchase_coins integer not null default 0,
  required_coins integer not null default 6,
  requirement_satisfied boolean not null default false,
  reminder_displayed_at timestamptz,
  reminder_dismissed_at timestamptz,
  reminder_close_reason text check (reminder_close_reason is null or reminder_close_reason in ('manual','expired')),
  grace_expires_at timestamptz,
  ignored_notice_count integer not null default 0,
  checkout_started_at timestamptz,
  checkout_protected_until timestamptz,
  enforcement_deferred_until timestamptz,
  restricted_at timestamptz,
  restriction_reason text,
  exemption_reason text,
  exemption_source_reference text,
  exemption_started_at timestamptz,
  exemption_expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(subject_ref, period_number)
);

create unique index if not exists contribution_one_open_period_idx
on public.contribution_watch_periods(subject_ref) where completed_at is null;
create index if not exists contribution_period_user_idx on public.contribution_watch_periods(user_id, started_at desc);
create index if not exists contribution_period_restricted_idx on public.contribution_watch_periods(restricted_at desc) where restricted_at is not null;

create table if not exists public.contribution_activity_events (
  id uuid primary key default gen_random_uuid(),
  period_id uuid references public.contribution_watch_periods(id) on delete cascade,
  subject_ref text not null,
  user_id uuid references auth.users(id) on delete set null,
  category text not null check (category in ('browsing','contribution')),
  activity_type text not null,
  route text,
  event_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.contribution_transactions (
  id uuid primary key default gen_random_uuid(),
  period_id uuid references public.contribution_watch_periods(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  category text not null check (category in ('tip','coin_purchase','merchandise','digital_purchase','approved_purchase')),
  coins integer not null check (coins >= 0),
  transaction_reference text not null unique,
  source text not null,
  applied_at timestamptz not null default now()
);

create table if not exists public.contribution_reminder_events (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.contribution_watch_periods(id) on delete cascade,
  event_type text not null check (event_type in ('displayed','manual_close','auto_expired','suppressed_checkout','suppressed_exemption')),
  event_key text not null unique,
  locale text,
  created_at timestamptz not null default now()
);

create table if not exists public.contribution_restrictions (
  id uuid primary key default gen_random_uuid(),
  subject_ref text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  public_display_name text not null default 'Guest',
  status text not null default 'restricted' check (status in ('restricted','temporary_restoration','restored','review')),
  reason text not null,
  first_restricted_at timestamptz not null default now(),
  most_recent_restricted_at timestamptz not null default now(),
  last_site_activity_at timestamptz,
  last_contribution_at timestamptz,
  total_verified_tip_coins bigint not null default 0,
  total_verified_purchase_coins bigint not null default 0,
  ignored_reminder_count integer not null default 0,
  violation_attempt_count integer not null default 0,
  clips4sale_redirect_count integer not null default 0,
  admin_reinstatement_count integer not null default 0,
  active_exemption_reason text,
  active_exemption_expires_at timestamptz,
  identity_confidence text not null default 'session' check (identity_confidence in ('account','session','review')),
  restored_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.contribution_restricted_attempts (
  id uuid primary key default gen_random_uuid(),
  restriction_id uuid not null references public.contribution_restrictions(id) on delete cascade,
  event_key text not null unique,
  route text not null,
  security_signal_hash text,
  created_at timestamptz not null default now()
);

create table if not exists public.contribution_redirect_events (
  id uuid primary key default gen_random_uuid(),
  restriction_id uuid references public.contribution_restrictions(id) on delete set null,
  event_key text not null unique,
  destination_reference text not null,
  destination_url text not null,
  reason text not null,
  referral_source text,
  created_at timestamptz not null default now()
);

create table if not exists public.contribution_admin_reinstatements (
  id uuid primary key default gen_random_uuid(),
  restriction_id uuid not null references public.contribution_restrictions(id) on delete restrict,
  admin_user_id uuid not null,
  restoration_type text not null check (restoration_type in ('temporary','permanent','reverse_incorrect','reset_period')),
  reason text not null check (length(trim(reason)) >= 5),
  previous_status text not null,
  new_status text not null,
  restored_until timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.contribution_admin_notes (
  id uuid primary key default gen_random_uuid(),
  restriction_id uuid not null references public.contribution_restrictions(id) on delete restrict,
  admin_user_id uuid not null,
  note text not null check (length(trim(note)) >= 2),
  created_at timestamptz not null default now()
);

create table if not exists public.public_live_tip_events (
  id uuid primary key default gen_random_uuid(),
  transaction_reference text not null unique,
  public_display_name text not null,
  tip_coins integer not null check (tip_coins >= 1),
  approved_message text,
  created_at timestamptz not null default now(),
  check (position('@' in public_display_name) = 0)
);

create or replace function public.transition_contribution_period(
  p_subject_ref text, p_user_id uuid, p_action text, p_route text,
  p_event_key text, p_metadata jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  settings contribution_rule_settings%rowtype;
  period contribution_watch_periods%rowtype;
  restriction contribution_restrictions%rowtype;
  elapsed integer := 0;
  inserted_count integer := 0;
  is_exempt boolean := false;
  checkout_active boolean := false;
  reminder_due boolean := false;
  should_redirect boolean := false;
  ignored_total integer := 0;
  next_period_number bigint := 0;
begin
  if length(trim(coalesce(p_subject_ref,''))) < 8 or length(trim(coalesce(p_event_key,''))) < 8 then
    raise exception 'INVALID_CONTRIBUTION_EVENT';
  end if;
  select * into settings from contribution_rule_settings where id=1;
  select * into period from contribution_watch_periods where subject_ref=p_subject_ref and completed_at is null for update;
  if period.id is null then
    -- Keep first-visit initialization idempotent when two tabs arrive together.
    insert into contribution_watch_periods(subject_ref,user_id,required_coins)
    values(p_subject_ref,p_user_id,settings.required_coins)
    on conflict (subject_ref, period_number) do nothing;
    select * into period from contribution_watch_periods where subject_ref=p_subject_ref and completed_at is null for update;
  end if;
  select * into restriction from contribution_restrictions where subject_ref=p_subject_ref;
  if restriction.status='temporary_restoration' and restriction.restored_until>now() then
    period.exemption_reason:='admin_temporary_restoration';
    period.exemption_source_reference:='restoration:'||restriction.id;
    period.exemption_started_at:=coalesce(period.exemption_started_at,now());
    period.exemption_expires_at:=restriction.restored_until;
  elsif restriction.status='temporary_restoration' and coalesce(restriction.restored_until,now())<=now() then
    update contribution_restrictions set status='restored',restored_until=null,updated_at=now() where id=restriction.id;
  end if;

  if p_action in ('activity','status') then
    elapsed := least(65, greatest(0, extract(epoch from (now()-period.last_heartbeat_at))::integer));
    if coalesce((p_metadata->>'visible')::boolean,false) and coalesce(p_route,'') like '/live%' then
      period.active_watch_seconds := period.active_watch_seconds + elapsed;
    end if;
    if p_action='activity' then
      insert into contribution_activity_events(period_id,subject_ref,user_id,category,activity_type,route,event_key,metadata)
      values(period.id,p_subject_ref,p_user_id,'browsing',left(coalesce(p_metadata->>'activityType','page_view'),80),left(p_route,500),p_event_key,p_metadata)
      on conflict(event_key) do nothing;
      period.last_browsing_at := now();
    end if;
    period.last_heartbeat_at := now();
  elsif p_action='reminder_displayed' and period.reminder_displayed_at is null then
    insert into contribution_reminder_events(period_id,event_type,event_key,locale)
    values(period.id,'displayed',p_event_key,left(coalesce(p_metadata->>'locale','en'),20))
    on conflict(event_key) do nothing;
    period.reminder_displayed_at := now();
    period.grace_expires_at := now() + make_interval(secs=>settings.grace_seconds);
  elsif p_action in ('reminder_manual_close','reminder_auto_expired') and period.reminder_dismissed_at is null then
    insert into contribution_reminder_events(period_id,event_type,event_key,locale)
    values(period.id,case when p_action='reminder_manual_close' then 'manual_close' else 'auto_expired' end,p_event_key,left(coalesce(p_metadata->>'locale','en'),20))
    on conflict(event_key) do nothing;
    period.reminder_dismissed_at := now();
    period.reminder_close_reason := case when p_action='reminder_manual_close' then 'manual' else 'expired' end;
  elsif p_action='checkout_started' then
    period.checkout_started_at := coalesce(period.checkout_started_at,now());
    period.checkout_protected_until := least(
      period.checkout_started_at + make_interval(secs=>settings.checkout_protection_seconds),
      now() + make_interval(secs=>settings.checkout_protection_seconds)
    );
  end if;

  is_exempt := period.exemption_expires_at is not null and period.exemption_expires_at > now();
  checkout_active := period.checkout_protected_until is not null and period.checkout_protected_until > now();
  period.requirement_satisfied := period.tip_coins + period.purchase_coins >= period.required_coins;
  reminder_due := (p_user_id is not null or settings.guest_enforcement_enabled)
    and not period.requirement_satisfied and not is_exempt and not checkout_active
    and ((period.reminder_displayed_at is null and period.active_watch_seconds >= settings.reminder_at_seconds)
      or (period.reminder_displayed_at is not null and period.reminder_dismissed_at is null));

  if period.active_watch_seconds >= settings.period_seconds and (period.requirement_satisfied or is_exempt) then
    next_period_number := period.period_number + 1;
    update contribution_watch_periods set completed_at=now(),updated_at=now() where id=period.id;
    insert into contribution_watch_periods(
      subject_ref,user_id,period_number,required_coins,exemption_reason,exemption_source_reference,exemption_started_at,exemption_expires_at
    ) values(
      p_subject_ref,p_user_id,next_period_number,settings.required_coins,
      case when settings.exemption_scope<>'current_period' and period.exemption_expires_at>now() then period.exemption_reason end,
      case when settings.exemption_scope<>'current_period' and period.exemption_expires_at>now() then period.exemption_source_reference end,
      case when settings.exemption_scope<>'current_period' and period.exemption_expires_at>now() then period.exemption_started_at end,
      case when settings.exemption_scope<>'current_period' and period.exemption_expires_at>now() then period.exemption_expires_at end
    ) returning * into period;
    is_exempt := period.exemption_expires_at is not null and period.exemption_expires_at>now();
    reminder_due := false;
  end if;

  if period.active_watch_seconds >= settings.period_seconds and period.reminder_dismissed_at is not null
     and coalesce(period.grace_expires_at,now()) <= now() and not period.requirement_satisfied
     and not is_exempt and not checkout_active and period.restricted_at is null
     and (p_user_id is not null or settings.guest_enforcement_enabled) then
    select count(*)::integer into ignored_total
    from contribution_reminder_events event
    join contribution_watch_periods prior on prior.id=event.period_id
    where prior.subject_ref=p_subject_ref and event.event_type in ('manual_close','auto_expired');
    if ignored_total < settings.ignored_notices_before_restriction then
      next_period_number := period.period_number + 1;
      update contribution_watch_periods set ignored_notice_count=ignored_notice_count+1,completed_at=now(),updated_at=now() where id=period.id;
      insert into contribution_watch_periods(subject_ref,user_id,period_number,required_coins)
      values(p_subject_ref,p_user_id,next_period_number,settings.required_coins) returning * into period;
      reminder_due := false;
    else
    if period.last_browsing_at is not null and period.last_browsing_at > now()-make_interval(secs=>settings.activity_protection_seconds) then
      period.enforcement_deferred_until := coalesce(period.enforcement_deferred_until,now()+make_interval(secs=>settings.activity_protection_seconds));
    end if;
    if period.enforcement_deferred_until is null or period.enforcement_deferred_until <= now() then
      period.restricted_at := now();
      period.restriction_reason := 'contribution_requirement_ignored';
      period.ignored_notice_count := period.ignored_notice_count + 1;
      insert into contribution_restrictions(subject_ref,user_id,reason,ignored_reminder_count,last_site_activity_at)
      values(p_subject_ref,p_user_id,period.restriction_reason,period.ignored_notice_count,period.last_browsing_at)
      on conflict(subject_ref) do update set status='restricted',reason=excluded.reason,
        most_recent_restricted_at=now(),ignored_reminder_count=contribution_restrictions.ignored_reminder_count+1,
        last_site_activity_at=excluded.last_site_activity_at,updated_at=now();
    end if;
    end if;
  end if;

  if p_action='restricted_access_attempt' and period.restricted_at is not null then
    select * into restriction from contribution_restrictions where subject_ref=p_subject_ref for update;
    insert into contribution_restricted_attempts(restriction_id,event_key,route)
    values(restriction.id,p_event_key,left(coalesce(p_route,'/live'),500)) on conflict(event_key) do nothing;
    get diagnostics inserted_count = row_count;
    if inserted_count=1 then
      update contribution_restrictions set violation_attempt_count=violation_attempt_count+1,updated_at=now()
      where id=restriction.id returning * into restriction;
    end if;
    should_redirect := settings.repeat_attempt_threshold is not null
      and restriction.violation_attempt_count >= settings.repeat_attempt_threshold;
  end if;

  update contribution_watch_periods set
    last_heartbeat_at=period.last_heartbeat_at,last_browsing_at=period.last_browsing_at,
    active_watch_seconds=period.active_watch_seconds,requirement_satisfied=period.requirement_satisfied,
    reminder_displayed_at=period.reminder_displayed_at,reminder_dismissed_at=period.reminder_dismissed_at,
    reminder_close_reason=period.reminder_close_reason,grace_expires_at=period.grace_expires_at,
    checkout_started_at=period.checkout_started_at,checkout_protected_until=period.checkout_protected_until,
    enforcement_deferred_until=period.enforcement_deferred_until,restricted_at=period.restricted_at,
    restriction_reason=period.restriction_reason,ignored_notice_count=period.ignored_notice_count,
    exemption_reason=period.exemption_reason,exemption_source_reference=period.exemption_source_reference,
    exemption_started_at=period.exemption_started_at,exemption_expires_at=period.exemption_expires_at,updated_at=now()
  where id=period.id;

  return jsonb_build_object(
    'periodId',period.id,'activeWatchSeconds',period.active_watch_seconds,
    'contributedCoins',period.tip_coins,'purchaseCoins',period.purchase_coins,
    'requiredCoins',period.required_coins,'requirementSatisfied',period.requirement_satisfied,
    'reminderDue',reminder_due,'reminderDisplayed',period.reminder_displayed_at is not null,
    'reminderDismissed',period.reminder_dismissed_at is not null,'reminderCloseReason',period.reminder_close_reason,
    'restricted',period.restricted_at is not null,'restrictionReason',period.restriction_reason,
    'exempt',is_exempt,'exemptionReason',period.exemption_reason,'exemptionExpiresAt',period.exemption_expires_at,
    'checkoutProtected',checkout_active,'graceExpiresAt',period.grace_expires_at,
    'redirectToClips4Sale',should_redirect,'violationAttempts',coalesce(restriction.violation_attempt_count,0)
  );
end $$;

create or replace function public.record_verified_contribution(
  p_user_id uuid, p_category text, p_coins integer,
  p_transaction_reference text, p_source text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  settings contribution_rule_settings%rowtype;
  period contribution_watch_periods%rowtype;
  inserted contribution_transactions%rowtype;
  exemption_reason text;
  exemption_minutes integer;
begin
  if p_category not in ('tip','coin_purchase','merchandise','digital_purchase','approved_purchase')
     or p_coins < 0 or length(trim(p_transaction_reference)) < 3 then raise exception 'INVALID_CONTRIBUTION'; end if;
  select * into settings from contribution_rule_settings where id=1;
  select * into period from contribution_watch_periods
  where user_id=p_user_id and completed_at is null order by started_at desc limit 1 for update;
  if period.id is null then
    insert into contribution_watch_periods(subject_ref,user_id,required_coins)
    values('user:'||p_user_id,p_user_id,settings.required_coins) returning * into period;
  end if;
  insert into contribution_transactions(period_id,user_id,category,coins,transaction_reference,source)
  values(period.id,p_user_id,p_category,p_coins,left(p_transaction_reference,180),left(p_source,120))
  on conflict(transaction_reference) do nothing returning * into inserted;
  if inserted.id is null then return jsonb_build_object('applied',false,'duplicate',true,'periodId',period.id); end if;

  if p_category='tip' then period.tip_coins:=period.tip_coins+p_coins; else period.purchase_coins:=period.purchase_coins+p_coins; end if;
  if p_category='tip' and p_coins>=settings.large_tip_threshold_coins then exemption_reason:='large_tip';
  elsif p_category='coin_purchase' and settings.coin_purchase_threshold_coins is not null and p_coins>=settings.coin_purchase_threshold_coins then exemption_reason:='qualifying_coin_purchase';
  elsif p_category='merchandise' and settings.merchandise_threshold_coins is not null and p_coins>=settings.merchandise_threshold_coins then exemption_reason:='qualifying_merchandise_purchase';
  elsif p_category in ('digital_purchase','approved_purchase') and p_category=any(settings.eligible_purchase_categories) then exemption_reason:='approved_purchase';
  end if;
  exemption_minutes:=least(settings.exemption_duration_minutes,settings.maximum_exemption_minutes);
  update contribution_watch_periods set tip_coins=period.tip_coins,purchase_coins=period.purchase_coins,
    requirement_satisfied=(period.tip_coins+period.purchase_coins)>=required_coins,
    exemption_reason=coalesce(exemption_reason,contribution_watch_periods.exemption_reason),
    exemption_source_reference=case when exemption_reason is not null then p_transaction_reference else exemption_source_reference end,
    exemption_started_at=case when exemption_reason is not null then now() else exemption_started_at end,
    exemption_expires_at=case when exemption_reason is not null then now()+make_interval(mins=>exemption_minutes) else exemption_expires_at end,
    updated_at=now() where id=period.id;
  update contribution_restrictions set last_contribution_at=now(),
    total_verified_tip_coins=total_verified_tip_coins+case when p_category='tip' then p_coins else 0 end,
    total_verified_purchase_coins=total_verified_purchase_coins+case when p_category<>'tip' then p_coins else 0 end,
    active_exemption_reason=coalesce(exemption_reason,active_exemption_reason),
    active_exemption_expires_at=case when exemption_reason is not null then now()+make_interval(mins=>exemption_minutes) else active_exemption_expires_at end,
    updated_at=now() where user_id=p_user_id;
  return jsonb_build_object('applied',true,'duplicate',false,'periodId',period.id,
    'requirementSatisfied',(period.tip_coins+period.purchase_coins)>=period.required_coins,
    'exemptionReason',exemption_reason);
end $$;

create or replace function public.admin_restore_contribution_access(
  p_restriction_id uuid,p_admin_user_id uuid,p_restoration_type text,p_reason text,p_restored_until timestamptz default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare restriction contribution_restrictions%rowtype; next_status text;
begin
  if p_restoration_type not in ('temporary','permanent','reverse_incorrect','reset_period') or length(trim(p_reason))<5 then raise exception 'INVALID_RESTORATION'; end if;
  select * into restriction from contribution_restrictions where id=p_restriction_id for update;
  if restriction.id is null then raise exception 'RESTRICTION_NOT_FOUND'; end if;
  next_status:=case when p_restoration_type='temporary' then 'temporary_restoration' else 'restored' end;
  insert into contribution_admin_reinstatements(restriction_id,admin_user_id,restoration_type,reason,previous_status,new_status,restored_until)
  values(restriction.id,p_admin_user_id,p_restoration_type,trim(p_reason),restriction.status,next_status,p_restored_until);
  update contribution_restrictions set status=next_status,admin_reinstatement_count=admin_reinstatement_count+1,
    restored_until=p_restored_until,updated_at=now() where id=restriction.id returning * into restriction;
  update contribution_watch_periods set completed_at=now(),updated_at=now()
  where subject_ref=restriction.subject_ref and completed_at is null;
  return jsonb_build_object('ok',true,'adminReinstatements',restriction.admin_reinstatement_count,
    'violationAttempts',restriction.violation_attempt_count,'status',restriction.status);
end $$;

create or replace function public.admin_set_contribution_exemption(
  p_restriction_id uuid,p_admin_user_id uuid,p_enabled boolean,p_reason text,p_duration_minutes integer default 60
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  restriction contribution_restrictions%rowtype;
  exemption_until timestamptz;
begin
  if length(trim(p_reason))<5 or p_duration_minutes<1 or p_duration_minutes>1440 then
    raise exception 'INVALID_EXEMPTION';
  end if;
  select * into restriction from contribution_restrictions where id=p_restriction_id for update;
  if restriction.id is null then raise exception 'RESTRICTION_NOT_FOUND'; end if;
  exemption_until:=case when p_enabled then now()+make_interval(mins=>p_duration_minutes) else null end;
  update contribution_restrictions set
    active_exemption_reason=case when p_enabled then 'admin_manual' else null end,
    active_exemption_expires_at=exemption_until,updated_at=now()
  where id=restriction.id;
  update contribution_watch_periods set
    exemption_reason=case when p_enabled then 'admin_manual' else null end,
    exemption_source_reference=case when p_enabled then 'admin:'||p_admin_user_id else null end,
    exemption_started_at=case when p_enabled then now() else null end,
    exemption_expires_at=exemption_until,updated_at=now()
  where subject_ref=restriction.subject_ref and completed_at is null;
  insert into contribution_admin_notes(restriction_id,admin_user_id,note)
  values(restriction.id,p_admin_user_id,
    case when p_enabled then '[EXEMPTION ADDED] ' else '[EXEMPTION REMOVED] ' end||trim(p_reason));
  return jsonb_build_object('ok',true,'enabled',p_enabled,'expiresAt',exemption_until);
end $$;

create or replace function public.record_contribution_redirect(
  p_subject_ref text,p_event_key text,p_destination_reference text,p_destination_url text,p_reason text,p_referral_source text
) returns boolean language plpgsql security definer set search_path=public as $$
declare restriction_id uuid; inserted_count integer;
begin
  select id into restriction_id from contribution_restrictions where subject_ref=p_subject_ref for update;
  if restriction_id is null then return false; end if;
  insert into contribution_redirect_events(restriction_id,event_key,destination_reference,destination_url,reason,referral_source)
  values(restriction_id,left(p_event_key,180),left(p_destination_reference,200),left(p_destination_url,1000),left(p_reason,200),left(p_referral_source,500))
  on conflict(event_key) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count=1 then update contribution_restrictions set clips4sale_redirect_count=clips4sale_redirect_count+1,updated_at=now() where id=restriction_id; end if;
  return inserted_count=1;
end $$;

alter table public.contribution_rule_settings enable row level security;
alter table public.contribution_watch_periods enable row level security;
alter table public.contribution_activity_events enable row level security;
alter table public.contribution_transactions enable row level security;
alter table public.contribution_reminder_events enable row level security;
alter table public.contribution_restrictions enable row level security;
alter table public.contribution_restricted_attempts enable row level security;
alter table public.contribution_redirect_events enable row level security;
alter table public.contribution_admin_reinstatements enable row level security;
alter table public.contribution_admin_notes enable row level security;
alter table public.public_live_tip_events enable row level security;

revoke all on public.contribution_rule_settings,public.contribution_watch_periods,public.contribution_activity_events,
  public.contribution_transactions,public.contribution_reminder_events,public.contribution_restrictions,
  public.contribution_restricted_attempts,public.contribution_redirect_events,public.contribution_admin_reinstatements,
  public.contribution_admin_notes from public,anon,authenticated;
grant select on public.public_live_tip_events to anon,authenticated;
grant execute on function public.transition_contribution_period(text,uuid,text,text,text,jsonb) to service_role;
grant execute on function public.record_verified_contribution(uuid,text,integer,text,text) to service_role;
grant execute on function public.admin_restore_contribution_access(uuid,uuid,text,text,timestamptz) to service_role;
grant execute on function public.admin_set_contribution_exemption(uuid,uuid,boolean,text,integer) to service_role;
grant execute on function public.record_contribution_redirect(text,text,text,text,text,text) to service_role;

-- The obsolete access settings cannot silently restore the old rule.
update public.access_control_settings set minimum_payment=3,coin_equivalent=6,
  notification_text='A minimum contribution of $3 or 6 coins applies to each 25-minute contribution period.',
  updated_at=now() where id=1;
