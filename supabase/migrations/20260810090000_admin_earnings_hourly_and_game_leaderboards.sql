-- Verified internal earnings ledger and hourly settlement records.
-- This is an internal accounting counter, not a processor or bank payout.
create table if not exists public.admin_earnings_wallet (
  id integer primary key default 1 check (id = 1),
  current_balance_minor bigint not null default 0 check (current_balance_minor >= 0),
  updated_at timestamptz not null default now()
);
insert into public.admin_earnings_wallet(id) values (1) on conflict (id) do nothing;

create table if not exists public.admin_earnings_ledger (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('tip','coin_sale','merchandise','painting','audio_clip','auction','subscription','other')),
  source_type text not null,
  source_id text not null,
  gross_amount_minor bigint not null check (gross_amount_minor >= 0),
  shipping_amount_minor bigint not null default 0 check (shipping_amount_minor >= 0),
  fulfillment_cost_minor bigint,
  processor_fee_minor bigint,
  status text not null default 'verified' check (status in ('verified','refunded','reversed')),
  settlement_id uuid,
  verified_at timestamptz not null default now(),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  unique(source_type, source_id)
);
create index if not exists admin_earnings_ledger_category_idx on public.admin_earnings_ledger(category, verified_at desc);
create index if not exists admin_earnings_ledger_unsettled_idx on public.admin_earnings_ledger(settled_at) where settled_at is null and status = 'verified';

create table if not exists public.admin_earnings_settlements (
  id uuid primary key default gen_random_uuid(),
  period_start timestamptz not null,
  period_end timestamptz not null,
  amount_minor bigint not null check (amount_minor >= 0),
  transaction_count integer not null default 0 check (transaction_count >= 0),
  category_totals jsonb not null default '{}',
  status text not null default 'completed' check (status in ('completed','retry','failed')),
  created_at timestamptz not null default now(),
  unique(period_start)
);
alter table public.admin_earnings_ledger add column if not exists settlement_id uuid references public.admin_earnings_settlements(id) on delete set null;
alter table public.admin_earnings_wallet enable row level security;
alter table public.admin_earnings_ledger enable row level security;
alter table public.admin_earnings_settlements enable row level security;
revoke all on public.admin_earnings_wallet, public.admin_earnings_ledger, public.admin_earnings_settlements from public, anon, authenticated;

create or replace function public.record_verified_admin_earning(
  p_category text, p_source_type text, p_source_id text, p_amount_minor bigint,
  p_shipping_minor bigint default 0, p_fulfillment_cost_minor bigint default null, p_processor_fee_minor bigint default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_inserted boolean := false; begin
  if p_amount_minor < 0 then raise exception 'INVALID_EARNING_AMOUNT'; end if;
  insert into admin_earnings_ledger(category,source_type,source_id,gross_amount_minor,shipping_amount_minor,fulfillment_cost_minor,processor_fee_minor)
    values(p_category,p_source_type,p_source_id,p_amount_minor,greatest(0,p_shipping_minor),p_fulfillment_cost_minor,p_processor_fee_minor)
    on conflict(source_type,source_id) do nothing returning id into v_id;
  if v_id is not null then
    update admin_earnings_wallet set current_balance_minor=current_balance_minor+p_amount_minor,updated_at=now() where id=1;
    v_inserted := true;
  else select id into v_id from admin_earnings_ledger where source_type=p_source_type and source_id=p_source_id limit 1; end if;
  return jsonb_build_object('recorded',v_inserted,'ledgerId',v_id,'duplicate',not v_inserted);
end $$;

create or replace function public.settle_admin_earnings() returns jsonb language plpgsql security definer set search_path=public as $$
declare v_start timestamptz; v_end timestamptz := now(); v_amount bigint; v_count integer; v_categories jsonb; v_settlement uuid; begin
  perform 1 from admin_earnings_wallet where id=1 for update;
  select coalesce(max(period_end), now() - interval '1 hour') into v_start from admin_earnings_settlements;
  select coalesce(sum(gross_amount_minor),0), count(*), coalesce(jsonb_object_agg(category, category_total), '{}'::jsonb) into v_amount,v_count,v_categories
    from (select category, sum(gross_amount_minor) category_total from admin_earnings_ledger where settled_at is null and status='verified' group by category) grouped;
  insert into admin_earnings_settlements(period_start,period_end,amount_minor,transaction_count,category_totals) values(v_start,v_end,v_amount,v_count,v_categories) on conflict(period_start) do nothing returning id into v_settlement;
  if v_settlement is null then select id into v_settlement from admin_earnings_settlements where period_start=v_start; return jsonb_build_object('duplicate',true,'settlementId',v_settlement); end if;
  update admin_earnings_ledger set settlement_id=v_settlement,settled_at=v_end where settled_at is null and status='verified';
  update admin_earnings_wallet set current_balance_minor=0,updated_at=v_end where id=1;
  return jsonb_build_object('settled',true,'settlementId',v_settlement,'amountMinor',v_amount,'transactionCount',v_count);
end $$;
revoke all on function public.record_verified_admin_earning(text,text,text,bigint,bigint,bigint,bigint), public.settle_admin_earnings() from public, anon, authenticated;
grant execute on function public.record_verified_admin_earning(text,text,text,bigint,bigint,bigint,bigint), public.settle_admin_earnings() to service_role;

create table if not exists public.game_scores (
  id uuid primary key default gen_random_uuid(),
  game_id text not null,
  game_title text not null,
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  score integer not null check (score >= 0),
  session_seconds integer not null default 0,
  session_id text not null unique,
  difficulty text,
  round_level integer,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.game_scores enable row level security;
revoke all on public.game_scores from public, anon, authenticated;

-- Game scores are isolated by game_id; these fields make the public
-- leaderboard metadata explicit without exposing account or payment data.
alter table public.game_scores add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.game_scores add column if not exists difficulty text;
alter table public.game_scores add column if not exists round_level integer;
create index if not exists game_scores_game_score_idx on public.game_scores(game_id, score desc, created_at desc);
