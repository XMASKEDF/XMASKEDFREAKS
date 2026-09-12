-- Project-owned baseline objects required by the feature migrations.
-- This runs after the applied admin_users foundation and before media/tip updates.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null check (char_length(display_name) <= 12),
  device_id text,
  country_code text,
  preferred_currency text not null default 'USD',
  preferred_language text not null default 'en',
  preferred_time_zone text not null default 'America/Chicago',
  two_factor_enabled boolean not null default false,
  two_factor_method text not null default 'none' check (two_factor_method in ('none', 'totp', 'email', 'passkey', 'hardware_key')),
  two_factor_last_verified_at timestamptz,
  trusted_device_inactivity_days integer not null default 30,
  email_live_alerts_enabled boolean not null default true,
  push_live_alerts_enabled boolean not null default false,
  sms_live_alerts_enabled boolean not null default false,
  total_tips numeric not null default 0,
  total_watch_seconds integer not null default 0,
  "returning" boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.access_control_settings (
  id integer primary key default 1 check (id = 1),
  viewing_threshold_minutes integer not null default 25,
  minimum_payment numeric not null default 3 check (minimum_payment >= 3),
  coin_equivalent integer not null default 6 check (coin_equivalent >= 6),
  checkout_timer_seconds integer not null default 64,
  blur_strength integer not null default 16,
  unlock_duration_minutes integer not null default 25,
  clips_redirect_percent integer not null default 60 check (clips_redirect_percent between 0 and 100),
  fansly_redirect_percent integer not null default 40 check (fansly_redirect_percent between 0 and 100),
  clips_redirect_url text not null default 'https://www.clips4sale.com/studio/444327/xmaskedfreaks',
  fansly_redirect_url text not null default 'https://fansly.com/1SexualTension',
  retry_limit integer not null default 1,
  notification_text text not null default 'A minimum contribution of $3 or 6 coins applies to each 25-minute contribution period.',
  secondary_pin_hash text,
  failed_attempts integer not null default 0,
  panel_locked_until timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  transaction_type text not null,
  amount numeric not null,
  base_amount numeric,
  currency text not null default 'USD',
  base_currency text not null default 'USD',
  customer_currency text,
  customer_local_amount numeric,
  settlement_currency text,
  exchange_rate numeric,
  rate_source text,
  rate_timestamp timestamptz,
  processor_fee numeric,
  final_transaction_result text,
  coin_policy_acknowledged boolean not null default false,
  coin_policy_version text,
  coin_policy_disclosure text,
  balance_after numeric not null,
  base_coins integer not null default 0,
  bonus_coins integer not null default 0,
  total_coins integer not null default 0,
  package_id uuid,
  processor_reference text,
  idempotency_key text unique,
  status text not null default 'confirmed',
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.coin_packages (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  amount numeric not null check (amount >= 10 and amount <= 1000),
  currency text not null default 'USD',
  base_coins integer not null check (base_coins >= 0),
  bonus_percent numeric not null default 0 check (bonus_percent >= 0 and bonus_percent <= 15),
  badge_text text,
  display_order integer not null default 1,
  highlighted boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  processor_customer_id text not null,
  processor_payment_token text not null,
  brand text,
  last4 text check (last4 is null or char_length(last4) = 4),
  exp_month integer,
  exp_year integer,
  billing_label text,
  is_default boolean not null default false,
  active boolean not null default true,
  consent_saved_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  amount numeric not null check (amount >= 2 and amount <= 1000),
  base_amount numeric,
  currency text not null default 'USD',
  base_currency text not null default 'USD',
  customer_currency text,
  customer_local_amount numeric,
  settlement_currency text,
  exchange_rate numeric,
  rate_source text,
  rate_timestamp timestamptz,
  processor_fee numeric,
  final_transaction_result text,
  country_code text,
  payment_context text,
  coin_policy_acknowledged boolean not null default false,
  coin_policy_version text,
  coin_policy_disclosure text,
  coin_package_id uuid references public.coin_packages(id) on delete set null,
  expected_base_coins integer not null default 0,
  expected_bonus_coins integer not null default 0,
  expected_total_coins integer not null default 0,
  processor_reference text,
  idempotency_key text unique not null,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  status text not null default 'created',
  risk_score integer not null default 0,
  requires_additional_verification boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  processor text not null,
  processor_event_id text unique not null,
  event_type text not null,
  payment_intent_id uuid references public.payment_intents(id) on delete set null,
  processed boolean not null default false,
  received_at timestamptz not null default now()
);

create table if not exists public.security_settings (
  id integer primary key default 1 check (id = 1),
  middleware_enabled boolean not null default true,
  rate_limit_per_minute integer not null default 90,
  hard_block_per_minute integer not null default 180,
  failed_auth_limit integer not null default 4,
  temporary_block_minutes integer not null default 15,
  cdn_provider text not null default 'Cloudflare',
  ddos_provider_enabled boolean not null default false,
  bot_detection_enabled boolean not null default true,
  bot_detection_level text not null default 'easy' check (bot_detection_level in ('simple', 'easy', 'medium', 'hard')),
  bot_detection_supervisor_agent_id text not null default 'Sage',
  alert_email text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.game_issue_reports (
  id uuid primary key default gen_random_uuid(),
  game_id text,
  severity text not null default 'info',
  message text not null,
  reported_by text not null default 'Todd',
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid,
  event_type text not null,
  ip_address text,
  user_agent text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references public.admin_users(id) on delete cascade,
  session_token_hash text unique not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 hours'),
  revoked_at timestamptz
);

create table if not exists public.admin_password_reset_events (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references public.admin_users(id) on delete set null,
  email text not null,
  requested_ip_address text,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.token_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance_tokens bigint not null default 0 check (balance_tokens >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.tip_options (
  id text primary key,
  emoji text not null,
  phrase text not null,
  token_cost integer not null check (token_cost > 0 and token_cost <= 1000),
  enabled boolean not null default true,
  display_order integer not null default 1,
  featured boolean not null default false,
  temporary_available boolean not null default true,
  live_only boolean not null default true,
  alert_style text not null default 'glow',
  sound_style text not null default 'ching',
  media_id uuid,
  artwork_url text,
  updated_by uuid references public.admin_users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.tip_menu_settings (
  id integer primary key default 1 check (id = 1),
  low_balance_threshold integer not null default 20 check (low_balance_threshold >= 0),
  custom_tips_enabled boolean not null default true,
  minimum_custom_tokens integer not null default 4 check (minimum_custom_tokens > 0),
  maximum_custom_tokens integer not null default 1000 check (maximum_custom_tokens >= minimum_custom_tokens and maximum_custom_tokens <= 1000),
  refill_entry_point text not null default '#coin-packages',
  require_confirmation boolean not null default false,
  updated_by uuid references public.admin_users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.access_control_settings enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.coin_packages enable row level security;
alter table public.payment_methods enable row level security;
alter table public.payment_intents enable row level security;
alter table public.payment_webhook_events enable row level security;
alter table public.security_settings enable row level security;
alter table public.game_issue_reports enable row level security;
alter table public.admin_audit_events enable row level security;
alter table public.admin_sessions enable row level security;
alter table public.admin_password_reset_events enable row level security;
alter table public.token_wallets enable row level security;
alter table public.tip_options enable row level security;
alter table public.tip_menu_settings enable row level security;

create policy "Users can read own profile"
on public.profiles for select using (auth.uid() = id);

create policy "Users can upsert own profile"
on public.profiles for insert with check (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "Anyone can read enabled coin packages"
on public.coin_packages for select using (enabled = true);

create policy "Users can read own wallet transactions"
on public.wallet_transactions for select to authenticated using (auth.uid() = user_id);

create policy "Users can read own token wallet"
on public.token_wallets for select to authenticated using (auth.uid() = user_id);

create policy "Anyone can read available tip options"
on public.tip_options for select using (enabled = true and temporary_available = true);

create policy "Anyone can read tip menu settings"
on public.tip_menu_settings for select using (true);

create policy "Users can read own payment methods"
on public.payment_methods for select to authenticated using (auth.uid() = user_id);

create policy "Users can create own tokenized payment methods"
on public.payment_methods for insert to authenticated with check (auth.uid() = user_id);

create policy "Users can deactivate own payment methods"
on public.payment_methods for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can read own payment intents"
on public.payment_intents for select to authenticated using (auth.uid() = user_id);

create policy "Users can create own payment intents"
on public.payment_intents for insert to authenticated with check (auth.uid() = user_id);

create policy "Authenticated users can read security settings"
on public.security_settings for select to authenticated using (true);

create policy "Authenticated users can read admin audit events"
on public.admin_audit_events for select to authenticated using (true);

create policy "Authenticated users can read admin sessions"
on public.admin_sessions for select to authenticated using (true);

create policy "Authenticated users can read admin password reset events"
on public.admin_password_reset_events for select to authenticated using (true);

insert into public.tip_options (id, emoji, phrase, token_cost, display_order, featured, alert_style, sound_style)
values
  ('great-show', '😩', 'Great Show', 8, 1, false, 'glow', 'ching'),
  ('need-more', '💦', 'I Need More', 10, 2, false, 'glow', 'ching'),
  ('favorite-creators', '😈', 'You’re My Favorite Creators', 100, 3, false, 'pulse', 'bell'),
  ('cant-stop-watching', '👅', 'Can’t Stop Watching', 50, 4, false, 'glow', 'ching'),
  ('worth-every-minute', '🤤', 'Worth Every Minute', 30, 5, false, 'glow', 'ching'),
  ('doing-amazing', '💋', 'You’re Doing Amazing', 32, 6, false, 'spark', 'bell'),
  ('appreciate-content', '💎', 'Appreciate The Content', 20, 7, false, 'glow', 'pulse'),
  ('yall-nasty', '🙈', 'YALL NASTY!!', 200, 8, false, 'pulse', 'arcade'),
  ('big-tipper', '💰', 'BIG TIPPER!!!', 400, 9, true, 'spark', 'arcade')
on conflict (id) do nothing;

insert into public.tip_menu_settings (id) values (1) on conflict (id) do nothing;
