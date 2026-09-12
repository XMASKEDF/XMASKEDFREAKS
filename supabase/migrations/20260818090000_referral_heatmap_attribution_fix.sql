-- Forward-only refinement for the existing Referring Websites heatmap RPC.
-- It preserves the existing signature and 7x12 response contract while making
-- purchase attribution use the same session/first/latest-touch model as traffic.

create or replace function public.get_referral_heatmap(
  p_start timestamptz,
  p_end timestamptz,
  p_time_zone text default 'America/Chicago',
  p_source text default 'all',
  p_referrer_host text default '',
  p_attribution_model text default 'session',
  p_purchase_category text default 'all',
  p_page_section text default 'all'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_timezone text := coalesce(nullif(trim(p_time_zone), ''), 'America/Chicago');
  v_result jsonb;
begin
  if p_end <= p_start then raise exception 'INVALID_HEATMAP_RANGE'; end if;
  if not exists (select 1 from pg_timezone_names where name = v_timezone) then v_timezone := 'America/Chicago'; end if;

  with base_events as (
    select e.id, e.event_type, e.anonymous_session_hash, e.user_id, e.page_path, e.content_id, e.event_key, e.occurred_at,
      regexp_replace(regexp_replace(lower(trim(coalesce(e.referrer_host, ''))), '^https?://', ''), '^www\\.', '') as referrer_host,
      case lower(nullif(trim(e.source), ''))
        when 'direct traffic' then 'direct'
        when 'google search' then 'google'
        when 'external referral' then 'external_referral'
        when 'search' then 'search'
        else lower(nullif(trim(e.source), ''))
      end as source_value
    from public.analytics_events e
    where e.environment = 'production'
      and e.occurred_at >= p_start and e.occurred_at < p_end
      and e.event_type not in ('health_check', 'monitoring')
      and coalesce(e.metadata->>'is_bot', 'false') <> 'true'
  ),
  event_sources as (
    select b.*, coalesce(b.source_value, nullif(b.referrer_host, ''), 'direct') as source_label,
      case
        when b.page_path like '/live%' then 'live'
        when b.page_path like '/merch%' then 'merch'
        when b.page_path like '/paintings%' then 'paintings'
        when b.page_path like '/audio-clips%' then 'audio'
        when b.page_path like '/games%' then 'games'
        when b.page_path like '/fansly%' or b.page_path like '/subscribe%' then 'subscribe'
        when b.page_path is null or b.page_path = '' then 'other'
        else 'other'
      end as page_section
    from base_events b
  ),
  first_touch as (
    select distinct on (anonymous_session_hash) anonymous_session_hash, source_label
    from event_sources where anonymous_session_hash is not null
    order by anonymous_session_hash, occurred_at asc, id asc
  ),
  latest_touch as (
    select distinct on (anonymous_session_hash) anonymous_session_hash, source_label
    from event_sources where anonymous_session_hash is not null
    order by anonymous_session_hash, occurred_at desc, id desc
  ),
  attributed_events as (
    select e.*,
      case lower(coalesce(p_attribution_model, 'session'))
        when 'first_touch' then coalesce(f.source_label, e.source_label)
        when 'latest_touch' then coalesce(l.source_label, e.source_label)
        else e.source_label
      end as attributed_source
    from event_sources e
    left join first_touch f on f.anonymous_session_hash = e.anonymous_session_hash
    left join latest_touch l on l.anonymous_session_hash = e.anonymous_session_hash
  ),
  filtered_events as (
    select a.*, extract(isodow from (a.occurred_at at time zone v_timezone))::integer - 1 as day_index,
      floor(extract(hour from (a.occurred_at at time zone v_timezone)) / 2)::integer as bucket_index
    from attributed_events a
    where (lower(coalesce(p_source, 'all')) = 'all' or a.attributed_source = lower(trim(p_source)) or a.referrer_host = lower(trim(p_source)))
      and (nullif(trim(coalesce(p_referrer_host, '')), '') is null or a.referrer_host = lower(trim(p_referrer_host)))
      and (lower(coalesce(p_page_section, 'all')) = 'all' or a.page_section = lower(trim(p_page_section)))
  ),
  visitor_rollup as (
    select day_index, bucket_index,
      count(*) filter (where event_type = 'page_view')::bigint as impressions,
      count(distinct nullif(anonymous_session_hash, ''))::bigint as sessions,
      count(distinct coalesce(user_id::text, nullif(anonymous_session_hash, '')))::bigint as unique_visitors
    from filtered_events
    where event_type in ('page_view', 'session_start', 'impression')
    group by day_index, bucket_index
  ),
  visitor_cells as (
    select d.day_index as day, b.bucket_index as bucket,
      coalesce(v.impressions, 0)::bigint as impressions,
      coalesce(v.sessions, 0)::bigint as sessions,
      coalesce(v.unique_visitors, 0)::bigint as unique_visitors
    from generate_series(0, 6) d(day_index) cross join generate_series(0, 11) b(bucket_index)
    left join visitor_rollup v on v.day_index = d.day_index and v.bucket_index = b.bucket_index
  ),
  purchase_rows as (
    select l.id, l.category, l.gross_amount_minor,
      extract(isodow from (l.verified_at at time zone v_timezone))::integer - 1 as day_index,
      floor(extract(hour from (l.verified_at at time zone v_timezone)) / 2)::integer as bucket_index,
      coalesce(linked.attributed_source, 'unknown') as purchase_source,
      coalesce(linked.page_section, 'other') as purchase_page_section,
      linked.anonymous_session_hash
    from public.admin_earnings_ledger l
    left join lateral (
      select a.attributed_source, a.referrer_host, a.page_section, a.anonymous_session_hash
      from attributed_events a
      where a.content_id = l.source_id or a.event_key = l.source_id
      order by a.occurred_at desc, a.id desc limit 1
    ) linked on true
    where l.status = 'verified'
      and lower(l.source_type) not in ('sandbox', 'test', 'test_transaction')
      and l.verified_at >= p_start and l.verified_at < p_end
      and case lower(coalesce(p_purchase_category, 'all'))
        when 'all' then true
        when 'merch' then l.category = 'merchandise'
        when 'paintings' then l.category = 'painting'
        when 'audio' then l.category = 'audio_clip'
        when 'coins' then l.category = 'coin_sale'
        when 'tips' then l.category = 'tip'
        when 'subscriptions' then l.category = 'subscription'
        when 'other' then l.category in ('auction', 'other')
        else false
      end
      and (lower(coalesce(p_source, 'all')) = 'all' or coalesce(linked.attributed_source, 'unknown') = lower(trim(p_source)))
      and (nullif(trim(coalesce(p_referrer_host, '')), '') is null or linked.referrer_host = lower(trim(p_referrer_host)))
      and (lower(coalesce(p_page_section, 'all')) = 'all' or coalesce(linked.page_section, 'other') = lower(trim(p_page_section)))
  ),
  purchase_rollup as (
    select day_index, bucket_index, count(*)::bigint as purchases,
      coalesce(sum(gross_amount_minor), 0)::bigint as revenue_minor,
      coalesce(round(avg(gross_amount_minor)), 0)::bigint as average_order_minor,
      count(distinct nullif(anonymous_session_hash, ''))::bigint as purchase_sessions
    from purchase_rows group by day_index, bucket_index
  ),
  purchase_cells as (
    select d.day_index as day, b.bucket_index as bucket,
      coalesce(p.purchases, 0)::bigint as purchases,
      coalesce(p.revenue_minor, 0)::bigint as revenue_minor,
      coalesce(p.average_order_minor, 0)::bigint as average_order_minor,
      case when coalesce(v.sessions, 0) > 0 then round(coalesce(p.purchase_sessions, 0)::numeric / v.sessions, 4) else 0 end as conversion_rate
    from generate_series(0, 6) d(day_index) cross join generate_series(0, 11) b(bucket_index)
    left join purchase_rollup p on p.day_index = d.day_index and p.bucket_index = b.bucket_index
    left join visitor_rollup v on v.day_index = d.day_index and v.bucket_index = b.bucket_index
  )
  select jsonb_build_object(
    'configured', true, 'timezone', v_timezone,
    'visitorCells', coalesce((select jsonb_agg(to_jsonb(vc) order by vc.day, vc.bucket) from visitor_cells vc), '[]'::jsonb),
    'purchaseCells', coalesce((select jsonb_agg(to_jsonb(pc) order by pc.day, pc.bucket) from purchase_cells pc), '[]'::jsonb),
    'visitorTotals', jsonb_build_object(
      'impressions', coalesce((select sum(impressions) from visitor_cells), 0),
      'sessions', coalesce((select count(distinct nullif(fe.anonymous_session_hash, '')) from filtered_events fe where fe.event_type in ('page_view', 'session_start', 'impression')), 0),
      'uniqueVisitors', coalesce((select count(distinct coalesce(fe.user_id::text, nullif(fe.anonymous_session_hash, ''))) from filtered_events fe where fe.event_type in ('page_view', 'session_start', 'impression')), 0)
    ),
    'purchaseTotals', jsonb_build_object(
      'purchases', coalesce((select sum(purchases) from purchase_cells), 0),
      'revenueMinor', coalesce((select sum(revenue_minor) from purchase_cells), 0),
      'averageOrderMinor', coalesce((select round(sum(revenue_minor)::numeric / nullif(sum(purchases), 0)) from purchase_cells), 0)
    )
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.get_referral_heatmap(timestamptz, timestamptz, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.get_referral_heatmap(timestamptz, timestamptz, text, text, text, text, text, text) to service_role;
