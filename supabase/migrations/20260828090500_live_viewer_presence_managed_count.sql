-- Durable Live presence for the managed public viewer display.
-- Visitor and tab identifiers arrive already hashed by the server adapter.
create table if not exists public.live_viewer_presence_visitors (
  broadcast_id text not null,
  visitor_key_hash text not null,
  entry_units integer not null default 10 check (entry_units between 1 and 100),
  exit_units integer not null default 0 check (exit_units >= 0),
  departure_recorded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (broadcast_id, visitor_key_hash)
);

create table if not exists public.live_viewer_presence_tabs (
  broadcast_id text not null,
  visitor_key_hash text not null,
  tab_key_hash text not null,
  joined_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  primary key (broadcast_id, tab_key_hash),
  foreign key (broadcast_id, visitor_key_hash)
    references public.live_viewer_presence_visitors (broadcast_id, visitor_key_hash)
    on delete cascade
);

create index if not exists live_viewer_presence_tabs_expiry_idx
  on public.live_viewer_presence_tabs (broadcast_id, last_heartbeat_at);

alter table public.live_viewer_presence_visitors enable row level security;
alter table public.live_viewer_presence_tabs enable row level security;

create or replace function public.update_live_viewer_presence(
  p_broadcast_id text,
  p_visitor_key_hash text,
  p_tab_key_hash text,
  p_action text,
  p_multiplier integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  event_time timestamptz := clock_timestamp();
  entry_delta integer := 0;
  leave_delta integer := 0;
  real_count integer := 0;
  display_count integer := 0;
  stale_tab record;
begin
  if length(coalesce(p_broadcast_id, '')) = 0
    or length(coalesce(p_visitor_key_hash, '')) = 0
    or length(coalesce(p_tab_key_hash, '')) = 0
    or p_action not in ('join', 'heartbeat', 'leave') then
    raise exception 'INVALID_PRESENCE_EVENT';
  end if;

  -- Expire abandoned tabs before handling the new event so browser crashes,
  -- sleep, and network loss produce one departure rather than ghost viewers.
  for stale_tab in
    select broadcast_id, tab_key_hash
    from public.live_viewer_presence_tabs
    where last_heartbeat_at < event_time - interval '45 seconds'
  loop
    delete from public.live_viewer_presence_tabs
    where broadcast_id = stale_tab.broadcast_id and tab_key_hash = stale_tab.tab_key_hash;
  end loop;

  update public.live_viewer_presence_visitors as visitor
  set exit_units = visitor.exit_units + 1,
      departure_recorded = true,
      updated_at = event_time
  where visitor.broadcast_id = p_broadcast_id
    and visitor.departure_recorded = false
    and not exists (
      select 1 from public.live_viewer_presence_tabs tab
      where tab.broadcast_id = visitor.broadcast_id
        and tab.visitor_key_hash = visitor.visitor_key_hash
    );
  get diagnostics leave_delta = row_count;

  if p_action in ('join', 'heartbeat') then
    insert into public.live_viewer_presence_visitors (broadcast_id, visitor_key_hash, entry_units)
    values (p_broadcast_id, p_visitor_key_hash, greatest(1, least(100, coalesce(p_multiplier, 10))))
    on conflict (broadcast_id, visitor_key_hash) do nothing;

    if found then
      entry_delta := greatest(1, least(100, coalesce(p_multiplier, 10)));
    end if;

    insert into public.live_viewer_presence_tabs (broadcast_id, visitor_key_hash, tab_key_hash, last_heartbeat_at)
    values (p_broadcast_id, p_visitor_key_hash, p_tab_key_hash, event_time)
    on conflict (broadcast_id, tab_key_hash) do update
      set visitor_key_hash = excluded.visitor_key_hash,
          last_heartbeat_at = excluded.last_heartbeat_at;

    update public.live_viewer_presence_visitors
    set departure_recorded = false, updated_at = event_time
    where broadcast_id = p_broadcast_id and visitor_key_hash = p_visitor_key_hash;
  else
    delete from public.live_viewer_presence_tabs
    where broadcast_id = p_broadcast_id
      and tab_key_hash = p_tab_key_hash;

    if found and not exists (
      select 1 from public.live_viewer_presence_tabs
      where broadcast_id = p_broadcast_id and visitor_key_hash = p_visitor_key_hash
    ) then
      update public.live_viewer_presence_visitors
      set exit_units = exit_units + 1,
          departure_recorded = true,
          updated_at = event_time
      where broadcast_id = p_broadcast_id
        and visitor_key_hash = p_visitor_key_hash
        and departure_recorded = false;
      if found then leave_delta := leave_delta + 1; end if;
    end if;
  end if;

  select count(*)::integer into real_count
  from public.live_viewer_presence_visitors visitor
  where visitor.broadcast_id = p_broadcast_id
    and exists (
      select 1 from public.live_viewer_presence_tabs tab
      where tab.broadcast_id = visitor.broadcast_id
        and tab.visitor_key_hash = visitor.visitor_key_hash
    );

  select coalesce(sum(greatest(0, entry_units - exit_units)), 0)::integer into display_count
  from public.live_viewer_presence_visitors
  where broadcast_id = p_broadcast_id;

  return jsonb_build_object(
    'realLiveViewerCount', greatest(0, real_count),
    'publicViewerDisplayValue', greatest(0, display_count),
    'entryDelta', greatest(0, entry_delta),
    'leaveDelta', greatest(0, leave_delta)
  );
end;
$$;

revoke all on function public.update_live_viewer_presence(text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.update_live_viewer_presence(text, text, text, text, integer) to service_role;
