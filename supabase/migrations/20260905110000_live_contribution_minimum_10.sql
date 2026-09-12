-- Move the protected Live contribution minimum to 10 coins / $5.
-- Existing historical transactions and completed watch periods are unchanged.

alter table if exists public.contribution_rule_settings
  alter column required_coins set default 10;

alter table if exists public.contribution_watch_periods
  alter column required_coins set default 10;

-- Bring current configuration and open periods into the new rule before
-- PostgreSQL validates the stricter constraints. Completed periods retain the
-- values that were authoritative when they were completed.
update public.contribution_rule_settings
set rule_name='Live Entry and Refillable Viewing Credit',
    required_coins=10,
    updated_at=now()
where id=1;

update public.contribution_watch_periods
set required_coins=10, updated_at=now(),
    requirement_satisfied=(tip_coins+purchase_coins)>=10
where completed_at is null;

update public.access_control_settings
set minimum_payment=5,
    coin_equivalent=10,
    notification_text='A $5 or 10-coin entry contribution unlocks Live access, followed by a 3-minute grace period and refillable viewing credit at 32 coins per hour.',
    updated_at=now()
where id=1;

alter table public.contribution_rule_settings
  drop constraint if exists contribution_rule_settings_required_coins_check;
alter table public.contribution_rule_settings
  add constraint contribution_rule_settings_required_coins_check check (required_coins >= 10);

alter table public.contribution_watch_periods
  drop constraint if exists contribution_watch_periods_required_coins_check;
alter table public.contribution_watch_periods
  add constraint contribution_watch_periods_required_coins_check
  check (required_coins >= 10 or completed_at is not null);

alter table public.access_control_settings
  drop constraint if exists access_control_settings_minimum_payment_check;
alter table public.access_control_settings
  add constraint access_control_settings_minimum_payment_check check (minimum_payment >= 5);
alter table public.access_control_settings
  drop constraint if exists access_control_settings_coin_equivalent_check;
alter table public.access_control_settings
  add constraint access_control_settings_coin_equivalent_check check (coin_equivalent >= 10);
