-- Active Live delivery analytics and the first-visit unpaid playback boundary.
-- This migration extends existing contribution state and analytics; it does not
-- replace wallet, tip, order, or displayed viewer-count records.

alter table if exists public.contribution_rule_settings
  add column if not exists first_reminder_at_seconds integer not null default 106,
  add column if not exists second_reminder_at_seconds integer not null default 130,
  add column if not exists unpaid_cutoff_seconds integer not null default 166;

alter table if exists public.contribution_watch_periods
  add column if not exists first_reminder_displayed_at timestamptz,
  add column if not exists first_reminder_dismissed_at timestamptz,
  add column if not exists second_reminder_displayed_at timestamptz,
  add column if not exists second_reminder_dismissed_at timestamptz,
  add column if not exists unpaid_playback_stopped_at timestamptz;

alter table if exists public.contribution_reminder_events
  add column if not exists reminder_stage text;

alter table public.contribution_rule_settings
  drop constraint if exists contribution_rule_settings_first_reminder_at_seconds_check,
  drop constraint if exists contribution_rule_settings_second_reminder_at_seconds_check,
  drop constraint if exists contribution_rule_settings_unpaid_cutoff_seconds_check;
alter table public.contribution_rule_settings
  add constraint contribution_rule_settings_first_reminder_at_seconds_check check (first_reminder_at_seconds between 1 and 86400),
  add constraint contribution_rule_settings_second_reminder_at_seconds_check check (second_reminder_at_seconds > first_reminder_at_seconds and second_reminder_at_seconds < 86400),
  add constraint contribution_rule_settings_unpaid_cutoff_seconds_check check (unpaid_cutoff_seconds > second_reminder_at_seconds and unpaid_cutoff_seconds < period_seconds);

alter table public.contribution_reminder_events
  drop constraint if exists contribution_reminder_events_reminder_stage_check;
alter table public.contribution_reminder_events
  add constraint contribution_reminder_events_reminder_stage_check check (reminder_stage is null or reminder_stage in ('first','second'));

update public.contribution_rule_settings
set first_reminder_at_seconds = 106,
    second_reminder_at_seconds = 130,
    unpaid_cutoff_seconds = 166,
    updated_at = now()
where id = 1;

create table if not exists public.live_viewer_sessions (
  playback_session_id text primary key,
  live_session_id text not null default 'daily-live',
  live_input_id text,
  user_id uuid references auth.users(id) on delete set null,
  anonymous_session_hash text,
  playback_started_at timestamptz not null default now(),
  playback_stopped_at timestamptz,
  active_watch_seconds integer not null default 0 check (active_watch_seconds >= 0),
  pause_seconds integer not null default 0 check (pause_seconds >= 0),
  hidden_seconds integer not null default 0 check (hidden_seconds >= 0),
  route_exit_at timestamptz,
  reconnect_count integer not null default 0 check (reconnect_count >= 0),
  qualifying_contribution_at timestamptz,
  contribution_coins integer not null default 0 check (contribution_coins >= 0),
  cumulative_tip_coins integer not null default 0 check (cumulative_tip_coins >= 0),
  environment text not null default 'production' check (environment in ('production','sandbox')),
  last_heartbeat_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists live_viewer_sessions_active_idx
  on public.live_viewer_sessions(environment, playback_started_at desc, playback_stopped_at);
create index if not exists live_viewer_sessions_user_idx
  on public.live_viewer_sessions(user_id, playback_started_at desc);

create table if not exists public.live_viewer_watch_minute_buckets (
  playback_session_id text not null references public.live_viewer_sessions(playback_session_id) on delete cascade,
  minute_index integer not null check (minute_index >= 0),
  active_seconds integer not null default 0 check (active_seconds between 0 and 60),
  first_active_at timestamptz,
  last_active_at timestamptz,
  environment text not null default 'production' check (environment in ('production','sandbox')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (playback_session_id, minute_index)
);

create table if not exists public.live_viewer_tip_correlations (
  id uuid primary key default gen_random_uuid(),
  playback_session_id text not null references public.live_viewer_sessions(playback_session_id) on delete cascade,
  transaction_reference text not null unique,
  watch_seconds_before_tip integer not null default 0 check (watch_seconds_before_tip >= 0),
  watch_minute integer not null default 0 check (watch_minute >= 0),
  coins_tipped integer not null check (coins_tipped >= 0),
  qualifying boolean not null default false,
  environment text not null default 'production' check (environment in ('production','sandbox')),
  created_at timestamptz not null default now()
);

create index if not exists live_viewer_tip_correlations_minute_idx
  on public.live_viewer_tip_correlations(environment, watch_minute, created_at desc);

create table if not exists public.live_delivery_cost_settings (
  provider text primary key,
  delivered_minutes_per_unit integer not null default 1000 check (delivered_minutes_per_unit > 0),
  unit_price_minor integer not null default 100 check (unit_price_minor >= 0),
  currency text not null default 'USD',
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.live_delivery_cost_settings(provider, delivered_minutes_per_unit, unit_price_minor, currency)
values ('cloudflare-stream', 1000, 100, 'USD')
on conflict (provider) do nothing;

create or replace view public.live_viewer_economics as
select
  s.environment,
  count(*)::integer as playback_sessions,
  count(*) filter (where s.active_watch_seconds > 0)::integer as real_viewers,
  coalesce(sum(s.active_watch_seconds), 0)::bigint as active_watch_seconds,
  coalesce(sum(s.active_watch_seconds) / 60.0, 0)::numeric as active_watch_minutes,
  coalesce((sum(s.active_watch_seconds) / 60.0) / nullif(c.delivered_minutes_per_unit, 0) * c.unit_price_minor, 0)::numeric as estimated_delivery_cost_minor,
  coalesce(sum(s.cumulative_tip_coins), 0)::bigint as tip_coins,
  count(*) filter (where s.qualifying_contribution_at is not null)::integer as qualifying_viewers
from public.live_viewer_sessions s
left join public.live_delivery_cost_settings c on c.provider = 'cloudflare-stream' and c.enabled
group by s.environment, c.delivered_minutes_per_unit, c.unit_price_minor;

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
  legacy_snapshot := public.transition_contribution_period(
    p_subject_ref, p_user_id,
    case when p_action in ('reminder_displayed','reminder_manual_close','reminder_auto_expired') then 'status' else p_action end,
    p_route, p_event_key, normalized_metadata
  );
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

alter table public.live_viewer_sessions enable row level security;
alter table public.live_viewer_watch_minute_buckets enable row level security;
alter table public.live_viewer_tip_correlations enable row level security;
alter table public.live_delivery_cost_settings enable row level security;
revoke all on public.live_viewer_sessions, public.live_viewer_watch_minute_buckets, public.live_viewer_tip_correlations, public.live_delivery_cost_settings from anon, authenticated;
grant execute on function public.transition_live_contribution_period(text,uuid,text,text,text,jsonb) to service_role;
