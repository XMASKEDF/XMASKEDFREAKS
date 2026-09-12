-- Separates normal game anti-cheat from interactive bot challenges and gives
-- administrators a bounded global bot-sensitivity setting.

alter table public.security_settings
  add column if not exists bot_protection_sensitivity text not null default 'balanced'
  check (bot_protection_sensitivity in ('low', 'balanced', 'high'));

update public.security_settings
set bot_protection_sensitivity = 'balanced'
where id = 1 and bot_protection_sensitivity is null;

comment on column public.security_settings.bot_protection_sensitivity is 'Global challenge sensitivity. Gameplay bot challenges remain disabled; game anti-cheat remains server-side and active.';
