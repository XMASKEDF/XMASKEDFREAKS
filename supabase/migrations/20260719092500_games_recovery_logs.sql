alter table public.game_issue_reports add column if not exists route text;
alter table public.game_issue_reports add column if not exists error_type text;
alter table public.game_issue_reports add column if not exists component_name text;
alter table public.game_issue_reports add column if not exists component_stack text;
alter table public.game_issue_reports add column if not exists retry_count integer not null default 0;
alter table public.game_issue_reports add column if not exists browser text;
alter table public.game_issue_reports add column if not exists operating_system text;
alter table public.game_issue_reports add column if not exists device_type text;
alter table public.game_issue_reports add column if not exists diagnostics jsonb not null default '{}'::jsonb;
alter table public.game_issue_reports add column if not exists recovery_action text;
alter table public.game_issue_reports add column if not exists fingerprint text;

create index if not exists game_issue_reports_unresolved_idx on public.game_issue_reports(resolved, created_at desc);
create index if not exists game_issue_reports_fingerprint_idx on public.game_issue_reports(fingerprint, created_at desc);
