-- Central, customer-first bot classification policy.
-- This is additive: existing security, auth, payment, wallet, game anti-cheat,
-- and replay controls remain independent and active.

alter table public.security_settings
  add column if not exists bot_detection_enabled boolean not null default true,
  add column if not exists bot_detection_level text not null default 'easy',
  add column if not exists bot_detection_supervisor_agent_id text not null default 'Sage';

alter table public.security_settings
  drop constraint if exists security_settings_bot_detection_level_check;

alter table public.security_settings
  add constraint security_settings_bot_detection_level_check
  check (bot_detection_level in ('simple', 'easy', 'medium', 'hard'));

update public.security_settings
set bot_detection_enabled = coalesce(bot_detection_enabled, true),
    bot_detection_level = case
      when bot_detection_level in ('simple', 'easy', 'medium', 'hard') then bot_detection_level
      else 'easy'
    end,
    bot_detection_supervisor_agent_id = 'Sage'
where id = 1;

comment on column public.security_settings.bot_detection_enabled is 'Bot classification, bot challenge, and bot enforcement switch. Fundamental authentication, authorization, payment, wallet, upload, anti-cheat, replay, and webhook controls remain active when false.';
comment on column public.security_settings.bot_detection_level is 'Customer-first bot interpretation strictness. SIMPLE, EASY, MEDIUM, and HARD do not change challenge puzzle difficulty.';
comment on column public.security_settings.bot_detection_supervisor_agent_id is 'Existing AI agent assigned to observe and report bot detection. Restricted to Sage by application policy.';
