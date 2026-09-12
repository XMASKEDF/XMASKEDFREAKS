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

create table if not exists public.auth_trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  device_hash text not null,
  browser_hash text,
  label text,
  last_verified_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, device_hash)
);

create table if not exists public.auth_totp_factors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  secret_encrypted text not null,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

create table if not exists public.auth_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.auth_password_reset_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  requested_ip_hash text,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.auth_policy_settings (
  id integer primary key default 1 check (id = 1),
  standard_user_2fa_optional boolean not null default true,
  admin_2fa_required boolean not null default true,
  trusted_device_inactivity_days integer not null default 30,
  allow_totp boolean not null default true,
  allow_email_verification boolean not null default false,
  allow_passkeys boolean not null default false,
  allow_hardware_keys boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.tip_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  coins integer not null check (coins >= 4),
  amount numeric not null,
  base_amount numeric,
  base_currency text not null default 'USD',
  customer_currency text,
  customer_local_amount numeric,
  settlement_currency text,
  exchange_rate numeric,
  rate_source text,
  rate_timestamp timestamptz,
  processor_fee numeric,
  processor_reference text,
  final_transaction_result text,
  label text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.live_access_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  session_id text unique not null,
  device_hash text,
  ip_hash text,
  secure_cookie_hash text,
  expires_at timestamptz not null default (now() + interval '25 minutes'),
  locked boolean not null default false,
  lock_reason text,
  checkout_started_at timestamptz,
  checkout_expires_at timestamptz,
  unlock_count integer not null default 0,
  last_transaction_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.live_access_contributions (
  id uuid primary key default gen_random_uuid(),
  access_session_id uuid references public.live_access_sessions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  amount numeric not null check (amount >= 3 and amount <= 200),
  base_amount numeric,
  base_currency text not null default 'USD',
  customer_currency text,
  customer_local_amount numeric,
  settlement_currency text,
  exchange_rate numeric,
  rate_source text,
  rate_timestamp timestamptz,
  processor_fee numeric,
  final_transaction_result text,
  coins integer not null check (coins >= 6),
  unlock_minutes integer not null default 25,
  transaction_reference text not null,
  processor_reference text,
  created_at timestamptz not null default now()
);

create table if not exists public.live_access_redirects (
  id uuid primary key default gen_random_uuid(),
  access_session_id uuid references public.live_access_sessions(id) on delete set null,
  idempotency_key text unique not null,
  destination text not null check (destination in ('Clips4Sale', 'Fansly')),
  destination_url text not null,
  reason text not null,
  campaign_id text,
  referral_source text,
  created_at timestamptz not null default now()
);

create table if not exists public.access_control_settings (
  id integer primary key default 1 check (id = 1),
  viewing_threshold_minutes integer not null default 25,
  minimum_payment numeric not null default 5 check (minimum_payment >= 5),
  coin_equivalent integer not null default 10 check (coin_equivalent >= 10),
  checkout_timer_seconds integer not null default 64,
  blur_strength integer not null default 16,
  unlock_duration_minutes integer not null default 25,
  clips_redirect_percent integer not null default 60 check (clips_redirect_percent between 0 and 100),
  fansly_redirect_percent integer not null default 40 check (fansly_redirect_percent between 0 and 100),
  clips_redirect_url text not null default 'https://www.clips4sale.com/studio/444327/xmaskedfreaks',
  fansly_redirect_url text not null default 'https://fansly.com/1SexualTension',
  retry_limit integer not null default 1,
  notification_text text not null default 'A minimum contribution of $5 or 10 coins applies to each 25-minute contribution period.',
  secondary_pin_hash text,
  failed_attempts integer not null default 0,
  panel_locked_until timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.access_control_audit_events (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  success boolean not null default false,
  reason text,
  ip_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.cost_providers (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  provider text not null,
  feature text not null,
  fixed_monthly numeric not null default 0,
  usage_monthly numeric not null default 0,
  usage_percent numeric not null default 0,
  free_remaining text,
  usage_limit_label text,
  automated_usage_enabled boolean not null default false,
  manual_entry boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cost_snapshots (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references public.cost_providers(id) on delete cascade,
  snapshot_date date not null default current_date,
  daily_estimate numeric not null default 0,
  weekly_estimate numeric not null default 0,
  monthly_estimate numeric not null default 0,
  projected_month_end numeric not null default 0,
  allowance_used_percent numeric not null default 0,
  raw_usage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.cost_budgets (
  id integer primary key default 1 check (id = 1),
  monthly_budget numeric not null default 1200,
  warning_threshold_percent numeric not null default 80,
  finance_role_required text not null default 'FINANCE_ADMIN',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.cost_alerts (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references public.cost_providers(id) on delete set null,
  severity text not null default 'warning',
  message text not null,
  acknowledged boolean not null default false,
  acknowledged_by uuid references auth.users(id) on delete set null,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  device_id text,
  country_code text,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.live_email_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  language text not null default 'en',
  live_alerts_enabled boolean not null default true,
  unsubscribed_at timestamptz,
  unsubscribe_token text unique default encode(gen_random_bytes(18), 'hex'),
  created_at timestamptz not null default now()
);

create table if not exists public.live_notification_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null default 'XMASKEDFREAKS is live',
  body text not null default 'HURRY THEY''RE LIVE!!!!',
  cta_text text not null default 'Enter live',
  destination_url text not null default '/#live',
  language text not null default 'en',
  audience_segment text not null default 'all_opted_in',
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.live_notification_campaigns (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.live_notification_templates(id) on delete set null,
  admin_user_id uuid references auth.users(id) on delete set null,
  subject text not null,
  body text not null,
  cta_text text not null,
  destination_url text not null,
  language text not null default 'en',
  audience_segment text not null default 'all_opted_in',
  channel text not null default 'email',
  status text not null default 'draft',
  stream_confirmed_active boolean not null default false,
  scheduled_for timestamptz,
  sent_at timestamptz,
  cooldown_minutes integer not null default 90,
  broadcast_session_key text,
  audience_size integer not null default 0,
  successful_deliveries integer not null default 0,
  failed_deliveries integer not null default 0,
  opens integer not null default 0,
  clicks integer not null default 0,
  opt_outs integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.live_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.live_notification_campaigns(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  email text,
  channel text not null default 'email',
  status text not null default 'queued',
  provider_message_id text,
  opened_at timestamptz,
  clicked_at timestamptz,
  opted_out_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.stream_settings (
  id integer primary key default 1 check (id = 1),
  provider text not null default 'mux' check (provider in ('mux', 'bunny', 'cloudflare')),
  mux_playback_id text,
  bunny_library_id text,
  bunny_video_id text,
  bunny_hostname text not null default 'iframe.mediadelivery.net',
  cloudflare_customer_subdomain text,
  cloudflare_video_id text,
  fallback_url text,
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  visitor_message text not null,
  assistant_reply text not null,
  assigned_agent text not null default 'Maya',
  issue_type text not null default 'General support',
  escalated boolean not null default false,
  escalation_payload jsonb,
  status text not null default 'answered',
  created_at timestamptz not null default now()
);

create table if not exists public.support_agent_settings (
  id text primary key,
  display_name text not null,
  avatar text not null,
  color text not null,
  role text not null,
  working_hours text not null,
  capabilities text not null,
  auto_response_behavior text not null,
  escalation_rules text not null,
  admin_email text,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.background_music_playlists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mode text not null default 'automatic' check (mode in ('automatic', 'lobby-only', 'live-background', 'disabled')),
  enabled boolean not null default true,
  shuffle boolean not null default false,
  repeat boolean not null default true,
  crossfade_seconds integer not null default 4,
  lobby_volume integer not null default 32 check (lobby_volume between 0 and 100),
  live_ducking_volume integer not null default 8 check (live_ducking_volume between 0 and 30),
  pre_live_start_minutes integer not null default 20,
  post_live_behavior text not null default 'resume' check (post_live_behavior in ('resume', 'post-show', 'stop')),
  stop_when_live boolean not null default false,
  notice_seconds integer not null default 5,
  cache_minutes integer not null default 60,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.background_music_tracks (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid references public.background_music_playlists(id) on delete cascade,
  title text not null,
  artist text,
  storage_path text,
  protected_source_ref text,
  mime_type text,
  duration_seconds integer,
  enabled boolean not null default true,
  track_order integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.background_music_logs (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid references public.background_music_playlists(id) on delete set null,
  track_id uuid references public.background_music_tracks(id) on delete set null,
  event_type text not null,
  message text not null,
  runtime_state text,
  volume_level numeric,
  cache_minutes integer,
  admin_user_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.missing_translation_events (
  id uuid primary key default gen_random_uuid(),
  locale text not null,
  translation_key text not null,
  page_path text,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.redirect_logs (
  id uuid primary key default gen_random_uuid(),
  referrer text,
  destination text not null,
  campaign_id text,
  country_code text,
  created_at timestamptz not null default now()
);

create table if not exists public.redirect_manager_settings (
  id integer primary key default 1 check (id = 1),
  obs_priority_enabled boolean not null default true,
  time_zone text not null default 'America/Chicago',
  clips_percent integer not null default 60 check (clips_percent between 0 and 100),
  fansly_percent integer generated always as (100 - clips_percent) stored,
  manual_destination text not null default 'automatic' check (manual_destination in ('automatic', 'clips4sale', 'fansly')),
  offline_blocks jsonb not null default '[{"id":"overnight-offline","label":"Overnight offline","start":"00:00","end":"08:00","destination":"split"},{"id":"midday-offline","label":"Midday offline","start":"11:00","end":"13:00","destination":"split"},{"id":"evening-offline","label":"Evening offline","start":"16:00","end":"22:00","destination":"split"}]'::jsonb,
  live_url text not null default '/#live',
  clips_url text not null default 'https://www.clips4sale.com/studio/444327/xmaskedfreaks',
  fansly_url text not null default 'https://fansly.com/1SexualTension',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.redirect_manager_logs (
  id uuid primary key default gen_random_uuid(),
  destination text not null check (destination in ('live', 'clips4sale', 'fansly')),
  destination_url text not null,
  reason text not null,
  obs_live boolean not null default false,
  bucket integer check (bucket between 0 and 99),
  chicago_minute integer check (chicago_minute between 0 and 1439),
  matched_block text,
  referrer text,
  campaign_id text,
  user_agent text,
  country_code text,
  session_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  campaign_id text unique not null,
  name text not null,
  traffic_source text,
  platform text,
  destination_url text,
  status text not null default 'active',
  budget numeric default 0,
  notes text,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.referral_events (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'Direct Traffic',
  source_type text default 'Other websites',
  referrer_url text,
  landing_page text,
  session_id text,
  user_id uuid references auth.users(id) on delete set null,
  campaign_id text,
  clicks integer not null default 1,
  conversion_type text,
  conversion_action text,
  revenue numeric default 0,
  session_duration_seconds integer default 0,
  bounced boolean not null default false,
  provider_name text,
  provider_event_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.referral_source_rollups (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_type text not null default 'Other websites',
  date_bucket date not null,
  visitors integer not null default 0,
  unique_visitors integer not null default 0,
  clicks integer not null default 0,
  tips integer not null default 0,
  registrations integer not null default 0,
  purchases integer not null default 0,
  revenue numeric not null default 0,
  average_session_seconds integer not null default 0,
  bounce_rate numeric not null default 0,
  top_landing_pages jsonb not null default '[]'::jsonb,
  trend_points jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (source, date_bucket)
);

create table if not exists public.geo_visitor_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  ip_hash text not null,
  encrypted_ip text,
  country_code text,
  country_name text,
  region_name text,
  city_name text,
  time_zone text,
  language text,
  browser text,
  operating_system text,
  device_type text,
  referral_source text,
  campaign_id text,
  current_page text,
  pages_viewed integer not null default 1,
  session_seconds integer not null default 0,
  "returning" boolean not null default false,
  active boolean not null default true,
  conversion_type text,
  conversion_value numeric not null default 0,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.geo_country_rollups (
  id uuid primary key default gen_random_uuid(),
  rollup_date date not null,
  country_code text not null,
  country_name text,
  active_visitors integer not null default 0,
  unique_visitors integer not null default 0,
  returning_visitors integer not null default 0,
  historical_visits integer not null default 0,
  average_session_seconds integer not null default 0,
  pages_viewed integer not null default 0,
  peak_local_hour integer,
  top_language text,
  top_referral_source text,
  registrations integer not null default 0,
  wallet_deposits integer not null default 0,
  purchases integer not null default 0,
  tips integer not null default 0,
  created_at timestamptz not null default now(),
  unique (rollup_date, country_code)
);

create table if not exists public.geo_reports (
  id uuid primary key default gen_random_uuid(),
  cadence text not null check (cadence in ('daily', 'weekly', 'monthly')),
  period_start date not null,
  period_end date not null,
  summary jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now()
);

create table if not exists public.geo_security_reviews (
  id uuid primary key default gen_random_uuid(),
  session_id text,
  ip_hash text not null,
  encrypted_ip text,
  reason text not null,
  restricted_to_role text not null default 'SECURITY_ADMIN',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
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
  amount numeric not null check (amount >= 5 and amount <= 1000),
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

create table if not exists public.global_payment_settings (
  id integer primary key default 1 check (id = 1),
  base_currency text not null default 'USD',
  fallback_currency text not null default 'USD',
  conversion_provider text not null default 'internal_cached_rates',
  exchange_rate_refresh_minutes integer not null default 240,
  rounding_rule text not null default 'standard' check (rounding_rule in ('standard', 'up', 'down')),
  tax_display_enabled boolean not null default false,
  converter_enabled boolean not null default true,
  provider_enabled boolean not null default true,
  supported_payment_methods jsonb not null default '["card","saved-card","wallet","processor-vault"]'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_country_rules (
  id uuid primary key default gen_random_uuid(),
  country_code text not null unique,
  enabled boolean not null default true,
  supported_currencies jsonb not null default '[]'::jsonb,
  supported_payment_methods jsonb not null default '[]'::jsonb,
  restriction_reason text,
  fallback_destination text,
  last_changed_by uuid references auth.users(id) on delete set null,
  last_changed_at timestamptz not null default now()
);

create table if not exists public.payment_currency_rules (
  id uuid primary key default gen_random_uuid(),
  currency_code text not null unique,
  enabled boolean not null default true,
  min_transaction_value numeric not null default 2,
  max_transaction_value numeric not null default 1000,
  direct_settlement_enabled boolean not null default false,
  fee_display_enabled boolean not null default true,
  last_changed_by uuid references auth.users(id) on delete set null,
  last_changed_at timestamptz not null default now()
);

create table if not exists public.exchange_rate_cache (
  id uuid primary key default gen_random_uuid(),
  base_currency text not null,
  quote_currency text not null,
  exchange_rate numeric not null,
  rate_source text not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (base_currency, quote_currency, rate_source)
);

create table if not exists public.international_payment_analytics (
  id uuid primary key default gen_random_uuid(),
  rollup_date date not null,
  country_code text,
  currency_code text,
  payment_context text,
  checkout_count integer not null default 0,
  successful_payments integer not null default 0,
  failed_payments integer not null default 0,
  abandoned_checkouts integer not null default 0,
  revenue_base_amount numeric not null default 0,
  customer_local_amount numeric not null default 0,
  settlement_amount numeric not null default 0,
  processor_fees numeric not null default 0,
  conversion_costs numeric not null default 0,
  refunds numeric not null default 0,
  chargebacks numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (rollup_date, country_code, currency_code, payment_context)
);

create table if not exists public.coin_policy_settings (
  id integer primary key default 1 check (id = 1),
  policy_version text not null default 'v1',
  disclosure_text text not null default 'Platform Coins can only be used for tipping during live streams and for eligible merchandise available on this website. Coins cannot be exchanged for cash and cannot be transferred outside the platform.',
  require_acknowledgement_every_purchase boolean not null default false,
  show_in_purchase boolean not null default true,
  show_in_wallet boolean not null default true,
  show_in_faq boolean not null default true,
  show_in_receipts boolean not null default true,
  merchandise_enabled boolean not null default true,
  eligible_merchandise_note text not null default 'Future platform-approved merchandise only',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.coin_policy_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  session_id text,
  device_hash text,
  policy_version text not null,
  disclosure_text text not null,
  source text not null default 'checkout',
  acknowledged_at timestamptz not null default now()
);

create table if not exists public.coin_policy_audit_events (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  policy_version text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  ip_address text,
  country_code text,
  user_agent text,
  browser text,
  endpoint text,
  reason text not null,
  action text not null default 'logged',
  abuse_score integer not null default 0,
  request_rate integer not null default 0,
  provider text not null default 'next-middleware',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.security_rules (
  id uuid primary key default gen_random_uuid(),
  rule_type text not null check (rule_type in ('ip_whitelist', 'ip_blacklist', 'country_blacklist', 'user_agent_blacklist')),
  value text not null,
  reason text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (rule_type, value)
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

create table if not exists public.security_alerts (
  id uuid primary key default gen_random_uuid(),
  severity text not null default 'warning',
  title text not null,
  message text not null,
  acknowledged boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.moderation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  display_name text,
  message text,
  reason text not null,
  enforcement text not null,
  appeal_status text not null default 'none',
  created_at timestamptz not null default now()
);

create table if not exists public.moderation_rules (
  id uuid primary key default gen_random_uuid(),
  phrase text not null,
  category text not null default 'prohibited language',
  enforcement text not null default 'temporary',
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.moderation_bans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  display_name text,
  reason text not null,
  enforcement text not null,
  permanent boolean not null default false,
  expires_at timestamptz,
  appeal_status text not null default 'not requested',
  device_signal_hash text,
  ip_signal_hash text,
  cookie_signal_hash text,
  created_at timestamptz not null default now()
);

create index if not exists moderation_bans_permanent_idx
on public.moderation_bans (permanent, expires_at);

create table if not exists public.creator_deposit_schedules (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references auth.users(id) on delete set null,
  frequency text not null default 'manual' check (frequency in ('manual', 'hourly', 'every_4_hours', 'every_8_hours', 'every_12_hours', 'daily', 'weekly', 'monthly')),
  last_deposit_at timestamptz,
  next_deposit_at timestamptz,
  timezone text not null default 'America/Chicago',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_lockdown (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default false,
  reason text,
  activated_by uuid references auth.users(id) on delete set null,
  activated_at timestamptz,
  lifted_at timestamptz
);

create table if not exists public.game_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  game_id text not null,
  game_title text,
  display_name text,
  score integer not null default 0,
  session_seconds integer not null default 0,
  session_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.game_scores add column if not exists session_id text;
alter table public.game_scores add column if not exists metadata jsonb not null default '{}'::jsonb;
create unique index if not exists game_scores_session_id_unique on public.game_scores(session_id) where session_id is not null;

create table if not exists public.game_catalog (
  id text primary key,
  slug text unique,
  title text not null,
  kind text not null default 'space' check (kind in ('space', 'pacman', 'slither')),
  category text not null default 'Arcade',
  difficulty text not null default 'Medium',
  description text,
  thumbnail_url text,
  thumbnail_alt text not null default '',
  thumbnail_width integer,
  thumbnail_height integer,
  thumbnail_mime_type text,
  thumbnail_file_size integer,
  thumbnail_updated_at timestamptz,
  thumbnail_updated_by uuid,
  featured boolean not null default false,
  hidden boolean not null default false,
  enabled boolean not null default true,
  display_order integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.game_catalog add column if not exists slug text;
alter table public.game_catalog add column if not exists thumbnail_alt text not null default '';
alter table public.game_catalog add column if not exists thumbnail_width integer;
alter table public.game_catalog add column if not exists thumbnail_height integer;
alter table public.game_catalog add column if not exists thumbnail_mime_type text;
alter table public.game_catalog add column if not exists thumbnail_file_size integer;
alter table public.game_catalog add column if not exists thumbnail_updated_at timestamptz;
alter table public.game_catalog add column if not exists thumbnail_updated_by uuid;
create unique index if not exists game_catalog_slug_idx on public.game_catalog(slug) where slug is not null;
create index if not exists game_catalog_visibility_order_idx on public.game_catalog(enabled, hidden, display_order);

insert into public.game_catalog (id, slug, title, kind, category, difficulty, description, thumbnail_url, thumbnail_alt, featured, hidden, enabled, display_order)
values
  ('space-sweep', 'space-invader-sweep', 'MASK INVADERS', 'space', 'Arcade', 'Medium', 'Pilot a neon ship, defend your shields, and clear waves before they reach the floor.', '/games/thumbnails/space-invader-sweep.svg', 'Neon spacecraft battling an alien wave in deep space.', false, false, true, 1),
  ('pac-mask', 'pac-mask-chase', 'Pac-Mask Chase', 'pacman', 'Arcade', 'Medium', 'Move through a compact neon maze, collect energy dots, and survive the chase.', '/games/thumbnails/pac-mask-chase.svg', 'Masked arcade character navigating a glowing neon maze.', false, false, true, 2),
  ('slither', 'slither', 'MASKED UP', 'slither', 'Arcade', 'Hard', 'SLIME THEM OUT. Consume energy orbs, avoid rival creatures, and become the longest in the arena.', '/games/thumbnails/slither.svg', 'Glowing green serpent moving through a dark energy arena.', true, false, true, 3)
on conflict (id) do update set
  slug = excluded.slug,
  title = excluded.title,
  description = excluded.description,
  thumbnail_alt = case when public.game_catalog.thumbnail_alt = '' then excluded.thumbnail_alt else public.game_catalog.thumbnail_alt end;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('game-thumbnails', 'game-thumbnails', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read game thumbnails" on storage.objects;
create policy "Public can read game thumbnails"
on storage.objects for select
using (bucket_id = 'game-thumbnails');

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  game_id text not null,
  score integer not null default 0,
  session_seconds integer not null default 0,
  difficulty_level integer not null default 1,
  audio_muted boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.game_runtime_settings (
  id text primary key default 'default' check (id = 'default'),
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

insert into public.game_runtime_settings (id, settings)
values ('default', '{"gamesEnabled":true,"gameVolume":0.18,"powerUpDropChance":0.12,"multiShotSeconds":10,"rapidFireSeconds":10,"shieldSeconds":8,"fruitSpawnChancePerSecond":0.035,"fruitVisibleSeconds":9,"powerPelletSeconds":7,"enemyDifficulty":1,"maskedUpCameraScale":2.25}'::jsonb)
on conflict (id) do nothing;

create table if not exists public.game_issue_reports (
  id uuid primary key default gen_random_uuid(),
  game_id text,
  severity text not null default 'info',
  message text not null,
  reported_by text not null default 'Todd',
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_engagement_messages (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  enabled boolean not null default true,
  placement text not null default 'chat',
  frequency_minutes integer not null default 20,
  created_at timestamptz not null default now()
);

create table if not exists public.intelligence_activity_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid,
  request_command text not null,
  system_name text not null,
  assigned_agents jsonb not null default '[]'::jsonb,
  tools_used jsonb not null default '[]'::jsonb,
  findings text,
  actions_taken text,
  approval_required boolean not null default false,
  result jsonb,
  unresolved_risks jsonb not null default '[]'::jsonb,
  compact_packet jsonb not null default '{}'::jsonb,
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

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  email text unique not null,
  password_hash text not null,
  role text not null default 'ADMIN',
  two_factor_required boolean not null default true,
  two_factor_enabled boolean not null default false,
  failed_login_attempts integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  password_reset_required boolean not null default false,
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

create table if not exists public.admin_feature_switches (
  feature_id text primary key,
  enabled boolean not null default true,
  last_changed_by uuid references public.admin_users(id) on delete set null,
  last_changed_at timestamptz not null default now(),
  last_change_ip text,
  last_change_user_agent text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.performance_power_settings (
  id uuid primary key default gen_random_uuid(),
  mode text not null default 'automatic',
  pause_hidden_work boolean not null default true,
  coordinate_tabs boolean not null default true,
  adaptive_video_recommendations boolean not null default true,
  reduce_decorative_effects boolean not null default true,
  updated_by uuid references public.admin_users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.performance_power_logs (
  id uuid primary key default gen_random_uuid(),
  profile text not null default 'automatic',
  visitor_mode text not null default 'visitor',
  device_summary text,
  browser_signal_summary jsonb not null default '{}'::jsonb,
  resource_problem text,
  action_taken text not null,
  duration_ms integer,
  improved boolean,
  created_at timestamptz not null default now()
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

alter table public.tip_options add column if not exists media_id uuid;
alter table public.tip_options add column if not exists artwork_url text;

insert into public.tip_options (id, emoji, phrase, token_cost, display_order, featured, alert_style, sound_style)
values
  ('great-show', '😩', 'Great Show', 8, 1, false, 'glow', 'ching'),
  ('need-more', '💦', 'I Need More', 10, 2, false, 'glow', 'ching'),
  ('im-watching', '👀', 'I’m Watching', 4, 10, false, 'glow', 'ching'),
  ('that-was-hot', '🔥', 'That Was Hot', 6, 11, false, 'glow', 'ching'),
  ('keep-going', '😏', 'Keep Going', 12, 12, false, 'glow', 'ching'),
  ('dont-stop', '🫦', 'Don’t Stop', 16, 13, false, 'glow', 'ching'),
  ('okayyy-i-see-yall', '🥵', 'Okayyy I See Y’all', 24, 14, false, 'glow', 'ching'),
  ('show-some-love', '❤️', 'Show Some Love', 40, 15, false, 'glow', 'ching'),
  ('turn-it-up', '😈', 'Turn It Up', 60, 16, false, 'pulse', 'bell'),
  ('keep-the-show-going', '💚', 'Keep The Show Going', 80, 17, false, 'glow', 'ching'),
  ('vip-energy', '👑', 'VIP Energy', 150, 18, false, 'pulse', 'bell'),
  ('yall-wild', '🚨', 'Y’ALL WILD', 300, 19, false, 'spark', 'arcade'),
  ('favorite-creators', '😈', 'You’re My Favorite Creators', 100, 3, false, 'pulse', 'bell'),
  ('cant-stop-watching', '👅', 'Can’t Stop Watching', 50, 4, false, 'glow', 'ching'),
  ('worth-every-minute', '🤤', 'Worth Every Minute', 30, 5, false, 'glow', 'ching'),
  ('doing-amazing', '💋', 'You’re Doing Amazing', 32, 6, false, 'spark', 'bell'),
  ('appreciate-content', '💎', 'Appreciate The Content', 20, 7, false, 'glow', 'pulse'),
  ('yall-nasty', '🙈', 'YALL NASTY!!', 200, 8, false, 'pulse', 'arcade'),
  ('big-tipper', '💰', 'BIG TIPPER!!!', 400, 9, true, 'spark', 'arcade')
on conflict (id) do nothing;

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

insert into public.tip_menu_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.live_tip_transactions (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  stream_id text not null,
  tip_option_id text not null,
  tip_phrase text not null,
  tip_emoji text not null,
  token_amount integer not null check (token_amount > 0),
  wallet_balance_before bigint not null check (wallet_balance_before >= 0),
  wallet_balance_after bigint not null check (wallet_balance_after >= 0),
  transaction_type text not null default 'LIVE_TIP' check (transaction_type = 'LIVE_TIP'),
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'failed', 'reversed')),
  display_name text not null,
  idempotency_key text unique not null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create table if not exists public.live_tip_totals (
  stream_id text primary key,
  total_tokens bigint not null default 0 check (total_tokens >= 0),
  updated_at timestamptz not null default now()
);

create or replace function public.submit_live_tip(
  p_user_id uuid,
  p_tip_option_id text,
  p_custom_tokens integer,
  p_idempotency_key text,
  p_session_id text,
  p_stream_id text,
  p_display_name text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.live_tip_transactions%rowtype;
  selected public.tip_options%rowtype;
  before_balance bigint;
  after_balance bigint;
  selected_tokens integer;
  selected_phrase text;
  selected_emoji text;
  transaction_id uuid;
  stream_total bigint;
  menu_settings public.tip_menu_settings%rowtype;
begin
  select * into existing from public.live_tip_transactions where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('duplicate', true, 'transactionId', existing.id, 'tokenBalance', existing.wallet_balance_after, 'tokenAmount', existing.token_amount, 'tipOptionId', existing.tip_option_id, 'tipPhrase', existing.tip_phrase, 'emoji', existing.tip_emoji);
  end if;

  select * into menu_settings from public.tip_menu_settings where id = 1;
  if p_tip_option_id = 'custom' then
    if not menu_settings.custom_tips_enabled or p_custom_tokens is null or p_custom_tokens < menu_settings.minimum_custom_tokens or p_custom_tokens > menu_settings.maximum_custom_tokens then
      raise exception 'TIP_OPTION_UNAVAILABLE';
    end if;
    selected_tokens := p_custom_tokens;
    selected_phrase := 'Custom Tip';
    selected_emoji := '✨';
  else
    select * into selected from public.tip_options where id = p_tip_option_id and enabled = true and temporary_available = true;
    if not found then raise exception 'TIP_OPTION_UNAVAILABLE'; end if;
    selected_tokens := selected.token_cost;
    selected_phrase := selected.phrase;
    selected_emoji := selected.emoji;
  end if;

  insert into public.token_wallets (user_id, balance_tokens) values (p_user_id, 0) on conflict (user_id) do nothing;
  select balance_tokens into before_balance from public.token_wallets where user_id = p_user_id for update;
  if before_balance < selected_tokens then raise exception 'INSUFFICIENT_TOKENS'; end if;
  after_balance := before_balance - selected_tokens;
  update public.token_wallets set balance_tokens = after_balance, updated_at = now() where user_id = p_user_id;

  insert into public.live_tip_transactions (session_id, user_id, stream_id, tip_option_id, tip_phrase, tip_emoji, token_amount, wallet_balance_before, wallet_balance_after, status, display_name, idempotency_key, confirmed_at)
  values (p_session_id, p_user_id, p_stream_id, p_tip_option_id, selected_phrase, selected_emoji, selected_tokens, before_balance, after_balance, 'confirmed', left(p_display_name, 12), p_idempotency_key, now())
  returning id into transaction_id;

  insert into public.wallet_transactions (user_id, transaction_type, amount, balance_after, total_coins, idempotency_key, status, note, final_transaction_result)
  values (p_user_id, 'LIVE_TIP', 0, after_balance, -selected_tokens, p_idempotency_key, 'confirmed', selected_phrase || ' — ' || selected_tokens || ' tokens', 'confirmed');

  insert into public.live_tip_totals (stream_id, total_tokens) values (p_stream_id, selected_tokens)
  on conflict (stream_id) do update set total_tokens = public.live_tip_totals.total_tokens + excluded.total_tokens, updated_at = now()
  returning total_tokens into stream_total;

  return jsonb_build_object('duplicate', false, 'transactionId', transaction_id, 'tokenBalance', after_balance, 'tokenAmount', selected_tokens, 'tipOptionId', p_tip_option_id, 'tipPhrase', selected_phrase, 'emoji', selected_emoji, 'streamTotalTokens', stream_total, 'status', 'confirmed');
end;
$$;

create or replace function public.credit_token_wallet(p_user_id uuid, p_tokens integer, p_idempotency_key text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare current_balance bigint; new_balance bigint;
begin
  if p_tokens <= 0 then raise exception 'INVALID_TOKEN_CREDIT'; end if;
  if exists(select 1 from public.wallet_transactions where idempotency_key = p_idempotency_key) then
    select balance_tokens into current_balance from public.token_wallets where user_id = p_user_id;
    return jsonb_build_object('duplicate', true, 'tokenBalance', coalesce(current_balance, 0));
  end if;
  insert into public.token_wallets (user_id, balance_tokens) values (p_user_id, 0) on conflict (user_id) do nothing;
  update public.token_wallets set balance_tokens = balance_tokens + p_tokens, updated_at = now() where user_id = p_user_id returning balance_tokens into new_balance;
  insert into public.wallet_transactions (user_id, transaction_type, amount, balance_after, total_coins, idempotency_key, status, note, final_transaction_result)
  values (p_user_id, 'TOKEN_DEPOSIT', 0, new_balance, p_tokens, p_idempotency_key, 'confirmed', p_note, 'confirmed');
  return jsonb_build_object('duplicate', false, 'tokenBalance', new_balance, 'creditedTokens', p_tokens);
end;
$$;

revoke all on function public.submit_live_tip(uuid, text, integer, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_live_tip(uuid, text, integer, text, text, text, text) to service_role;
revoke all on function public.credit_token_wallet(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.credit_token_wallet(uuid, integer, text, text) to service_role;

create table if not exists public.media_categories (
  id text primary key,
  name text not null,
  slug text unique not null,
  description text not null default '',
  icon text not null default '○',
  enabled boolean not null default true,
  archived boolean not null default false,
  display_order integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.media_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  parent_id uuid references public.media_folders(id) on delete restrict,
  path text unique not null,
  archived boolean not null default false,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  original_filename text not null,
  storage_path text unique not null,
  public_url text not null,
  thumbnail_url text,
  mime_type text not null,
  extension text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  aspect_ratio numeric(12,6) not null,
  file_size bigint not null check (file_size > 0),
  content_hash text not null,
  category_id text references public.media_categories(id) on delete set null,
  folder_id uuid references public.media_folders(id) on delete set null,
  alt_text text not null default '',
  description text not null default '',
  tags text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published', 'private', 'archived')),
  focal_point_x numeric(5,4) not null default 0.5 check (focal_point_x between 0 and 1),
  focal_point_y numeric(5,4) not null default 0.5 check (focal_point_y between 0 and 1),
  crop_preference text not null default 'original' check (crop_preference in ('original', '16:9', '4:3', '1:1', '9:16')),
  is_animated boolean not null default false,
  is_public boolean not null default false,
  game_metadata jsonb not null default '{}'::jsonb,
  watermark_settings jsonb not null default '{"enabled":false}'::jsonb,
  uploaded_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.media_variants (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null references public.media_assets(id) on delete cascade,
  variant_name text not null check (variant_name in ('thumbnail', 'small', 'medium', 'large', 'original')),
  storage_path text not null,
  public_url text not null,
  width integer not null,
  height integer not null,
  file_size bigint,
  format text not null,
  created_at timestamptz not null default now(),
  unique (media_id, variant_name)
);

create table if not exists public.media_usage (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null references public.media_assets(id) on delete restrict,
  usage_type text not null,
  resource_id text,
  route text,
  field_name text,
  created_at timestamptz not null default now(),
  unique (usage_type, resource_id, field_name)
);

create table if not exists public.media_action_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references public.admin_users(id) on delete set null,
  action text not null,
  media_id uuid references public.media_assets(id) on delete set null,
  previous_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.site_background_settings (
  id text primary key default 'default' check (id = 'default'),
  enabled boolean not null default false,
  background_type text not null default 'static' check (background_type in ('static', 'video', 'canvas', 'webgl')),
  matrix_slim_settings jsonb not null default '{}'::jsonb,
  desktop_media_id uuid references public.media_assets(id) on delete set null,
  desktop_url text,
  mobile_media_id uuid references public.media_assets(id) on delete set null,
  mobile_url text,
  fallback_media_id uuid references public.media_assets(id) on delete set null,
  fallback_url text,
  video_url text not null default '',
  opacity numeric(5,4) not null default 0.28 check (opacity between 0 and 1),
  overlay text not null default 'rgba(0,0,0,0.72)',
  scope text not null default 'global' check (scope in ('global', 'live', 'games', 'admin', 'landing')),
  focal_point_x numeric(5,4) not null default 0.5 check (focal_point_x between 0 and 1),
  focal_point_y numeric(5,4) not null default 0.5 check (focal_point_y between 0 and 1),
  responsive_scaling boolean not null default true,
  maximum_pixel_ratio numeric(4,2) not null default 2 check (maximum_pixel_ratio between 1 and 3),
  resize_debounce_ms integer not null default 75 check (resize_debounce_ms between 50 and 250),
  particle_density_scaling boolean not null default true,
  maintain_aspect_ratio boolean not null default true,
  dynamic_resolution boolean not null default true,
  mobile_performance_mode boolean not null default true,
  automatic_gpu_optimization boolean not null default true,
  updated_by uuid references public.admin_users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.site_branding_settings (
  id text primary key default 'default' check (id = 'default'),
  logo_media_id uuid references public.media_assets(id) on delete set null,
  logo_url text not null default '/branding/mask-logo.png',
  updated_by uuid references public.admin_users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.site_branding_settings (id) values ('default') on conflict (id) do nothing;

insert into public.site_background_settings (id) values ('default') on conflict (id) do nothing;

create index if not exists media_assets_created_idx on public.media_assets(created_at desc);
create index if not exists media_assets_category_status_idx on public.media_assets(category_id, status);
create index if not exists media_assets_folder_idx on public.media_assets(folder_id);
create index if not exists media_assets_hash_idx on public.media_assets(content_hash);
create index if not exists media_assets_tags_idx on public.media_assets using gin(tags);
create index if not exists media_usage_media_idx on public.media_usage(media_id);

insert into public.media_categories (id, name, slug, description, icon, display_order)
values
  ('backgrounds', 'Backgrounds', 'backgrounds', 'Global and page background images.', '▧', 1),
  ('video-backgrounds', 'Video Backgrounds', 'video-backgrounds', 'Approved looping video backgrounds.', '▶', 2),
  ('interactive-backgrounds', 'Interactive Backgrounds', 'interactive-backgrounds', 'Canvas and interactive background presets.', '◎', 3),
  ('threejs-presets', 'Three.js Presets', 'threejs-presets', 'Approved WebGL scene presets.', '◇', 4),
  ('animated-backgrounds', 'Animated Backgrounds', 'animated-backgrounds', 'Animated WebP and GIF backgrounds.', '◌', 5),
  ('game-thumbnails', 'Game Thumbnails', 'game-thumbnails', 'Game-card and launch artwork.', '▣', 2),
  ('game-assets', 'Game Assets', 'game-assets', 'Game entities, textures, sprites, and effects.', '✦', 3),
  ('logos', 'Logos', 'logos', 'Brand marks and identity artwork.', '◇', 4),
  ('banners', 'Banners', 'banners', 'Live and promotional banners.', '▬', 5),
  ('live-page', 'Live Page', 'live-page', 'Live-room graphics and overlays.', '●', 6),
  ('tip-menu', 'Tip Menu', 'tip-menu', 'Tip-card, refill, and modal artwork.', '◉', 7),
  ('gallery', 'Gallery', 'gallery', 'Reusable gallery images.', '▦', 8),
  ('merchandise', 'Merchandise', 'merchandise', 'Eligible merchandise imagery.', '◆', 9),
  ('promotional', 'Promotional', 'promotional', 'Campaign and promotional artwork.', '✧', 10),
  ('admin-only', 'Admin Only', 'admin-only', 'Private administrator-only visual assets.', '◆', 11),
  ('other', 'Other', 'other', 'Unclassified image assets.', '○', 12)
on conflict (id) do update set name = excluded.name, description = excluded.description, icon = excluded.icon;

insert into public.media_folders (name, slug, path)
select seed.name, seed.slug, seed.slug
from (values
  ('Backgrounds', 'backgrounds'), ('Game Thumbnails', 'game-thumbnails'), ('Game Assets', 'game-assets'),
  ('Branding', 'branding'), ('Logos', 'logos'), ('Banners', 'banners'), ('Live', 'live'),
  ('Tip Menu', 'tip-menu'), ('Gallery', 'gallery'), ('Promotions', 'promotions'), ('Mobile', 'mobile'), ('Archived', 'archived')
) as seed(name, slug)
where not exists (select 1 from public.media_folders folder where folder.path = seed.slug);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'])
on conflict (id) do update set public = false, file_size_limit = 15728640, allowed_mime_types = excluded.allowed_mime_types;

alter table public.media_categories enable row level security;
alter table public.media_folders enable row level security;
alter table public.media_assets enable row level security;
alter table public.media_variants enable row level security;
alter table public.media_usage enable row level security;
alter table public.media_action_logs enable row level security;
alter table public.site_background_settings enable row level security;
alter table public.site_branding_settings enable row level security;

alter table public.profiles enable row level security;
alter table public.auth_trusted_devices enable row level security;
alter table public.auth_totp_factors enable row level security;
alter table public.auth_recovery_codes enable row level security;
alter table public.auth_password_reset_events enable row level security;
alter table public.auth_policy_settings enable row level security;
alter table public.tip_events enable row level security;
alter table public.live_access_sessions enable row level security;
alter table public.live_access_contributions enable row level security;
alter table public.live_access_redirects enable row level security;
alter table public.access_control_settings enable row level security;
alter table public.access_control_audit_events enable row level security;
alter table public.cost_providers enable row level security;
alter table public.cost_snapshots enable row level security;
alter table public.cost_budgets enable row level security;
alter table public.cost_alerts enable row level security;
alter table public.login_events enable row level security;
alter table public.live_email_subscribers enable row level security;
alter table public.live_notification_templates enable row level security;
alter table public.live_notification_campaigns enable row level security;
alter table public.live_notification_deliveries enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_agent_settings enable row level security;
alter table public.background_music_playlists enable row level security;
alter table public.background_music_tracks enable row level security;
alter table public.background_music_logs enable row level security;
alter table public.missing_translation_events enable row level security;
alter table public.stream_settings enable row level security;
alter table public.redirect_logs enable row level security;
alter table public.redirect_manager_settings enable row level security;
alter table public.redirect_manager_logs enable row level security;
alter table public.campaigns enable row level security;
alter table public.referral_events enable row level security;
alter table public.referral_source_rollups enable row level security;
alter table public.geo_visitor_sessions enable row level security;
alter table public.geo_country_rollups enable row level security;
alter table public.geo_reports enable row level security;
alter table public.geo_security_reviews enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.coin_packages enable row level security;
alter table public.payment_methods enable row level security;
alter table public.payment_intents enable row level security;
alter table public.payment_webhook_events enable row level security;
alter table public.global_payment_settings enable row level security;
alter table public.payment_country_rules enable row level security;
alter table public.payment_currency_rules enable row level security;
alter table public.exchange_rate_cache enable row level security;
alter table public.international_payment_analytics enable row level security;
alter table public.coin_policy_settings enable row level security;
alter table public.coin_policy_acknowledgements enable row level security;
alter table public.coin_policy_audit_events enable row level security;
alter table public.security_events enable row level security;
alter table public.security_rules enable row level security;
alter table public.security_settings enable row level security;
alter table public.security_alerts enable row level security;
alter table public.moderation_events enable row level security;
alter table public.moderation_rules enable row level security;
alter table public.moderation_bans enable row level security;
alter table public.creator_deposit_schedules enable row level security;
alter table public.platform_lockdown enable row level security;
alter table public.game_scores enable row level security;
alter table public.game_catalog enable row level security;
alter table public.game_sessions enable row level security;
alter table public.game_runtime_settings enable row level security;
alter table public.game_issue_reports enable row level security;
alter table public.ai_engagement_messages enable row level security;
alter table public.intelligence_activity_logs enable row level security;
alter table public.admin_audit_events enable row level security;
alter table public.admin_users enable row level security;
alter table public.admin_sessions enable row level security;
alter table public.admin_password_reset_events enable row level security;
alter table public.admin_feature_switches enable row level security;
alter table public.performance_power_settings enable row level security;
alter table public.performance_power_logs enable row level security;
alter table public.token_wallets enable row level security;
alter table public.tip_options enable row level security;
alter table public.tip_menu_settings enable row level security;
alter table public.live_tip_transactions enable row level security;
alter table public.live_tip_totals enable row level security;

create policy "Users can read own profile"
on public.profiles for select
using (auth.uid() = id);

create policy "Users can upsert own profile"
on public.profiles for insert
with check (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Users can manage own trusted devices"
on public.auth_trusted_devices for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can manage own TOTP factors"
on public.auth_totp_factors for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can manage own recovery codes"
on public.auth_recovery_codes for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can create password reset events"
on public.auth_password_reset_events for insert
with check (true);

create policy "Authenticated users can read auth policy settings"
on public.auth_policy_settings for select
to authenticated
using (true);

create policy "Users can create own tip events"
on public.tip_events for insert
with check (auth.uid() = user_id);

create policy "Authenticated users can read recent tips"
on public.tip_events for select
to authenticated
using (created_at > now() - interval '24 hours');

create policy "Users can read own live access sessions"
on public.live_access_sessions for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can create own live access sessions"
on public.live_access_sessions for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own live access sessions"
on public.live_access_sessions for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can read own access contributions"
on public.live_access_contributions for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can create own access contributions"
on public.live_access_contributions for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can create access redirect logs"
on public.live_access_redirects for insert
to authenticated
with check (true);

create policy "Authenticated admins can read cost providers"
on public.cost_providers for select
to authenticated
using (true);

create policy "Authenticated admins can read cost snapshots"
on public.cost_snapshots for select
to authenticated
using (true);

create policy "Authenticated admins can read cost budgets"
on public.cost_budgets for select
to authenticated
using (true);

create policy "Authenticated admins can read cost alerts"
on public.cost_alerts for select
to authenticated
using (true);

create policy "Users can write own login events"
on public.login_events for insert
with check (auth.uid() = user_id);

create policy "Anyone can subscribe for live emails"
on public.live_email_subscribers for insert
with check (true);

create policy "Subscribers can update own live email preference"
on public.live_email_subscribers for update
using (true)
with check (true);

create policy "Anyone can read enabled coin packages"
on public.coin_packages for select
using (enabled = true);

create policy "Users can read own wallet transactions"
on public.wallet_transactions for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can read own token wallet"
on public.token_wallets for select
to authenticated
using (auth.uid() = user_id);

create policy "Anyone can read available tip options"
on public.tip_options for select
using (enabled = true and temporary_available = true);

create policy "Anyone can read tip menu settings"
on public.tip_menu_settings for select
using (true);

create policy "Users can read own live tip transactions"
on public.live_tip_transactions for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can read own payment methods"
on public.payment_methods for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can create own tokenized payment methods"
on public.payment_methods for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can deactivate own payment methods"
on public.payment_methods for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can read own payment intents"
on public.payment_intents for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can create own payment intents"
on public.payment_intents for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Authenticated admins can read global payment settings"
on public.global_payment_settings for select
to authenticated
using (true);

create policy "Authenticated admins can manage global payment settings"
on public.global_payment_settings for update
to authenticated
using (true)
with check (true);

create policy "Authenticated admins can read payment country rules"
on public.payment_country_rules for select
to authenticated
using (true);

create policy "Authenticated admins can manage payment country rules"
on public.payment_country_rules for all
to authenticated
using (true)
with check (true);

create policy "Authenticated admins can read payment currency rules"
on public.payment_currency_rules for select
to authenticated
using (true);

create policy "Authenticated admins can manage payment currency rules"
on public.payment_currency_rules for all
to authenticated
using (true)
with check (true);

create policy "Authenticated users can read exchange rate cache"
on public.exchange_rate_cache for select
to authenticated
using (true);

create policy "Authenticated admins can manage exchange rate cache"
on public.exchange_rate_cache for all
to authenticated
using (true)
with check (true);

create policy "Authenticated admins can read international payment analytics"
on public.international_payment_analytics for select
to authenticated
using (true);

create policy "Authenticated users can read coin policy settings"
on public.coin_policy_settings for select
to authenticated
using (true);

create policy "Authenticated admins can manage coin policy settings"
on public.coin_policy_settings for update
to authenticated
using (true)
with check (true);

create policy "Users can create own coin policy acknowledgements"
on public.coin_policy_acknowledgements for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can read own coin policy acknowledgements"
on public.coin_policy_acknowledgements for select
to authenticated
using (auth.uid() = user_id);

create policy "Authenticated admins can read coin policy audit events"
on public.coin_policy_audit_events for select
to authenticated
using (true);

create policy "Authenticated admins can create coin policy audit events"
on public.coin_policy_audit_events for insert
to authenticated
with check (true);

create policy "Anyone can create support messages"
on public.support_messages for insert
with check (true);

create policy "Authenticated users can read support agent settings"
on public.support_agent_settings for select
to authenticated
using (enabled = true);

create policy "Authenticated users can manage support agent settings"
on public.support_agent_settings for all
to authenticated
using (true)
with check (true);

create policy "Authenticated admins can read background music playlists"
on public.background_music_playlists for select
to authenticated
using (true);

create policy "Authenticated admins can manage background music playlists"
on public.background_music_playlists for all
to authenticated
using (true)
with check (true);

create policy "Authenticated admins can read background music tracks"
on public.background_music_tracks for select
to authenticated
using (true);

create policy "Authenticated admins can manage background music tracks"
on public.background_music_tracks for all
to authenticated
using (true)
with check (true);

create policy "Authenticated admins can read background music logs"
on public.background_music_logs for select
to authenticated
using (true);

create policy "Authenticated admins can create background music logs"
on public.background_music_logs for insert
to authenticated
with check (true);

create policy "Anyone can report missing translations"
on public.missing_translation_events for insert
with check (true);

create policy "Authenticated users can read stream settings"
on public.stream_settings for select
to authenticated
using (true);

create policy "Authenticated users can read redirect manager settings"
on public.redirect_manager_settings for select
to authenticated
using (true);

create policy "Authenticated users can read redirect manager logs"
on public.redirect_manager_logs for select
to authenticated
using (true);

create policy "Redirect route can create redirect manager logs"
on public.redirect_manager_logs for insert
with check (true);

create policy "Anyone can create referral events"
on public.referral_events for insert
with check (true);

create policy "Authenticated users can read referral events"
on public.referral_events for select
to authenticated
using (true);

create policy "Authenticated users can read referral rollups"
on public.referral_source_rollups for select
to authenticated
using (true);

create policy "Security middleware can create events"
on public.security_events for insert
with check (true);

create policy "Authenticated users can read security events"
on public.security_events for select
to authenticated
using (true);

create policy "Authenticated users can read security rules"
on public.security_rules for select
to authenticated
using (true);

create policy "Authenticated users can manage security rules"
on public.security_rules for all
to authenticated
using (true)
with check (true);

create policy "Authenticated users can read security settings"
on public.security_settings for select
to authenticated
using (true);

create policy "Authenticated users can read security alerts"
on public.security_alerts for select
to authenticated
using (true);

create policy "Authenticated users can create moderation events"
on public.moderation_events for insert
to authenticated
with check (true);

create policy "Authenticated users can read moderation rules"
on public.moderation_rules for select
to authenticated
using (enabled = true);

create policy "Authenticated users can manage moderation rules"
on public.moderation_rules for all
to authenticated
using (true)
with check (true);

create policy "Authenticated users can read moderation bans"
on public.moderation_bans for select
to authenticated
using (true);

create policy "Authenticated users can manage moderation bans"
on public.moderation_bans for all
to authenticated
using (true)
with check (true);

create policy "Authenticated users can manage creator deposit schedules"
on public.creator_deposit_schedules for all
to authenticated
using (true)
with check (true);

create policy "Authenticated users can read game catalog"
on public.game_catalog for select
to authenticated
using (enabled = true and hidden = false);

create table if not exists public.game_assets (
  id uuid primary key default gen_random_uuid(),
  game_slug text not null,
  pack_id text not null,
  slot_id text not null,
  category text not null,
  asset_kind text not null check (asset_kind in ('image', 'audio')),
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  storage_path text not null unique,
  public_url text not null,
  enabled boolean not null default true,
  updated_by uuid references public.admin_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (game_slug, slot_id)
);

create index if not exists game_assets_game_slug_idx on public.game_assets(game_slug, enabled);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('game-assets', 'game-assets', true, 15728640, array['image/png','image/jpeg','image/webp','image/avif','image/gif','audio/mpeg','audio/mp4','audio/aac','audio/wav','audio/ogg'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read published game assets" on storage.objects;
create policy "Public can read published game assets" on storage.objects for select using (bucket_id = 'game-assets');

create policy "Authenticated users can read game leaderboard"
on public.game_scores for select
to authenticated
using (true);

create policy "Anyone can read game runtime settings"
on public.game_runtime_settings for select
using (true);

create policy "Users can create own game scores"
on public.game_scores for insert
with check (auth.uid() = user_id or user_id is null);

create policy "Users can create own game sessions"
on public.game_sessions for insert
with check (auth.uid() = user_id or user_id is null);

create policy "Authenticated users can create intelligence activity"
on public.intelligence_activity_logs for insert
to authenticated
with check (true);

create policy "Authenticated users can read intelligence activity"
on public.intelligence_activity_logs for select
to authenticated
using (true);

create policy "Authenticated users can read admin audit events"
on public.admin_audit_events for select
to authenticated
using (true);

create policy "Authenticated users can read admin users"
on public.admin_users for select
to authenticated
using (true);

create policy "Authenticated users can read admin sessions"
on public.admin_sessions for select
to authenticated
using (true);

create policy "Authenticated users can read admin password reset events"
on public.admin_password_reset_events for select
to authenticated
using (true);
