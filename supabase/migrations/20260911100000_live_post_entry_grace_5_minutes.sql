-- Current Live policy: the entry requirement unlocks access, then the
-- server-authoritative viewing-credit account owns exactly five minutes of
-- complimentary grace. The historical contribution tables remain intact.
alter table if exists public.contribution_rule_settings
  alter column grace_seconds set default 300,
  alter column entry_grace_seconds set default 300;

update public.contribution_rule_settings
set grace_seconds = 300,
    entry_grace_seconds = 300,
    updated_at = now()
where id = 1;

update public.contribution_watch_periods
set grace_expires_at = null,
    updated_at = now()
where completed_at is null and not requirement_satisfied;

update public.access_control_settings
set notification_text = 'A $5 or 10-coin entry contribution unlocks Live access, followed by exactly 5 minutes of complimentary grace and refillable viewing credit at 32 coins per hour. Low-credit reminders replace the retired 25-minute cycle.',
    updated_at = now()
where id = 1;

-- The current wrapper still uses the historical transition for shared period
-- bookkeeping. Skip only its reminder-display call so that legacy grace is not
-- started by a reminder; apply_live_viewing_credit starts grace after the
-- confirmed entry transaction instead.
create or replace function public.transition_live_contribution_period(
  p_subject_ref text, p_user_id uuid, p_action text, p_route text,
  p_event_key text, p_metadata jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  legacy_snapshot jsonb;
  settings contribution_rule_settings%rowtype;
  period contribution_watch_periods%rowtype;
  stage text := case when p_metadata->>'reminderStage' = 'second' then 'second' else 'first' end;
  reminder_due boolean := false;
  stopped boolean := false;
  normalized_metadata jsonb := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'visible', coalesce((p_metadata->>'visible')::boolean, false) and coalesce((p_metadata->>'mediaActive')::boolean, false)
  );
begin
  legacy_snapshot := case when p_action = 'reminder_displayed' then '{}'::jsonb else public.transition_contribution_period(
    p_subject_ref, p_user_id,
    case when p_action in ('reminder_manual_close','reminder_auto_expired') then 'status' else p_action end,
    p_route, p_event_key, normalized_metadata
  ) end;
  select * into settings from public.contribution_rule_settings where id = 1;
  select * into period from public.contribution_watch_periods where subject_ref = p_subject_ref and completed_at is null for update;
  if period.id is null then raise exception 'CONTRIBUTION_PERIOD_NOT_FOUND'; end if;
  stopped := period.unpaid_playback_stopped_at is not null;

  if p_action = 'reminder_displayed' then
    if stage = 'first' and period.first_reminder_displayed_at is null and period.active_watch_seconds >= settings.first_reminder_at_seconds then
      period.first_reminder_displayed_at := now();
      insert into public.contribution_reminder_events(period_id,event_type,event_key,locale,reminder_stage)
      values(period.id,'displayed',p_event_key,left(coalesce(p_metadata->>'locale','en'),20),'first') on conflict(event_key) do nothing;
    elsif stage = 'second' and period.second_reminder_displayed_at is null and period.active_watch_seconds >= settings.second_reminder_at_seconds then
      period.second_reminder_displayed_at := now();
      insert into public.contribution_reminder_events(period_id,event_type,event_key,locale,reminder_stage)
      values(period.id,'displayed',p_event_key,left(coalesce(p_metadata->>'locale','en'),20),'second') on conflict(event_key) do nothing;
    end if;
  elsif p_action in ('reminder_manual_close','reminder_auto_expired') then
    if stage = 'first' and period.first_reminder_displayed_at is not null and period.first_reminder_dismissed_at is null then
      period.first_reminder_dismissed_at := now();
    elsif stage = 'second' and period.second_reminder_displayed_at is not null and period.second_reminder_dismissed_at is null then
      period.second_reminder_dismissed_at := now();
    end if;
    insert into public.contribution_reminder_events(period_id,event_type,event_key,locale,reminder_stage)
    values(period.id,case when p_action='reminder_manual_close' then 'manual_close' else 'auto_expired' end,p_event_key,left(coalesce(p_metadata->>'locale','en'),20),stage)
    on conflict(event_key) do nothing;
  end if;

  if period.requirement_satisfied or period.exemption_expires_at > now() then
    stopped := false;
  elsif period.active_watch_seconds >= settings.unpaid_cutoff_seconds then
    period.unpaid_playback_stopped_at := coalesce(period.unpaid_playback_stopped_at, now());
    stopped := true;
  end if;
  if stopped then reminder_due := false; end if;

  reminder_due := not period.requirement_satisfied
    and (period.exemption_expires_at is null or period.exemption_expires_at <= now())
    and period.unpaid_playback_stopped_at is null
    and ((period.first_reminder_displayed_at is null and period.active_watch_seconds >= settings.first_reminder_at_seconds)
      or (period.first_reminder_displayed_at is not null and period.first_reminder_dismissed_at is null)
      or (period.first_reminder_dismissed_at is not null and period.second_reminder_displayed_at is null and period.active_watch_seconds >= settings.second_reminder_at_seconds)
      or (period.second_reminder_displayed_at is not null and period.second_reminder_dismissed_at is null));

  update public.contribution_watch_periods set
    first_reminder_displayed_at = period.first_reminder_displayed_at,
    first_reminder_dismissed_at = period.first_reminder_dismissed_at,
    second_reminder_displayed_at = period.second_reminder_displayed_at,
    second_reminder_dismissed_at = period.second_reminder_dismissed_at,
    unpaid_playback_stopped_at = period.unpaid_playback_stopped_at,
    updated_at = now()
  where id = period.id;

  return jsonb_build_object(
    'periodId', period.id,
    'activeWatchSeconds', period.active_watch_seconds,
    'contributedCoins', period.tip_coins,
    'purchaseCoins', period.purchase_coins,
    'requiredCoins', period.required_coins,
    'requirementSatisfied', period.requirement_satisfied,
    'reminderDue', reminder_due,
    'reminderStage', case when not reminder_due then null when period.first_reminder_displayed_at is null then 'first' when period.first_reminder_dismissed_at is null then 'first' when period.second_reminder_displayed_at is null then 'second' when period.second_reminder_dismissed_at is null then 'second' else null end,
    'reminderDisplayed', period.first_reminder_displayed_at is not null or period.second_reminder_displayed_at is not null,
    'reminderDismissed', period.first_reminder_dismissed_at is not null or period.second_reminder_dismissed_at is not null,
    'reminderCloseReason', case when period.second_reminder_dismissed_at is not null or period.first_reminder_dismissed_at is not null then 'manual' else null end,
    'restricted', period.restricted_at is not null,
    'restrictionReason', period.restriction_reason,
    'exempt', period.exemption_expires_at is not null and period.exemption_expires_at > now(),
    'exemptionReason', period.exemption_reason,
    'exemptionExpiresAt', period.exemption_expires_at,
    'checkoutProtected', period.checkout_protected_until is not null and period.checkout_protected_until > now(),
    'graceExpiresAt', period.grace_expires_at,
    'redirectToClips4Sale', coalesce((legacy_snapshot->>'redirectToClips4Sale')::boolean, false),
    'violationAttempts', coalesce((legacy_snapshot->>'violationAttempts')::integer, 0),
    'unpaidPlaybackStopped', stopped
  );
end $$;

grant execute on function public.transition_live_contribution_period(text,uuid,text,text,text,jsonb) to service_role;
