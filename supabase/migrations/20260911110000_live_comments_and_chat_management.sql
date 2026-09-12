-- Lightweight Live conversation storage. The service API owns validation and
-- public shaping; account email addresses never enter the public feed.
create table if not exists public.live_comments (
  id uuid primary key default gen_random_uuid(),
  live_session_id text not null default 'daily-live',
  environment text not null default 'production' check (environment in ('production', 'sandbox')),
  subject_ref text not null,
  user_id uuid references auth.users(id) on delete set null,
  identity_type text not null check (identity_type in ('user', 'guest')),
  display_name text not null check (char_length(display_name) between 1 and 32),
  body text not null check (char_length(body) between 1 and 280),
  client_message_id text not null check (char_length(client_message_id) between 16 and 160),
  status text not null default 'visible' check (status in ('visible', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (environment, live_session_id, subject_ref, client_message_id)
);

create index if not exists live_comments_feed_idx
  on public.live_comments(environment, live_session_id, status, created_at desc);

create table if not exists public.live_chat_participants (
  live_session_id text not null default 'daily-live',
  environment text not null default 'production' check (environment in ('production', 'sandbox')),
  subject_ref text not null,
  user_id uuid references auth.users(id) on delete set null,
  identity_type text not null check (identity_type in ('user', 'guest')),
  display_name text not null check (char_length(display_name) between 1 and 32),
  status text not null default 'present' check (status in ('present', 'away', 'left')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (environment, live_session_id, subject_ref)
);

create index if not exists live_chat_participants_presence_idx
  on public.live_chat_participants(environment, live_session_id, last_seen_at desc);

create table if not exists public.live_chat_blocks (
  id uuid primary key default gen_random_uuid(),
  live_session_id text not null default 'daily-live',
  environment text not null default 'production' check (environment in ('production', 'sandbox')),
  subject_ref text not null,
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 32),
  reason text not null default '' check (char_length(reason) <= 1000),
  active boolean not null default true,
  blocked_until timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (environment, live_session_id, subject_ref)
);

create index if not exists live_chat_blocks_active_idx
  on public.live_chat_blocks(environment, live_session_id, active, blocked_until);

alter table public.live_comments enable row level security;
alter table public.live_chat_participants enable row level security;
alter table public.live_chat_blocks enable row level security;
revoke all on public.live_comments, public.live_chat_participants, public.live_chat_blocks from anon, authenticated;

comment on table public.live_comments is 'Validated text-only Live comments. Public display is shaped by the server and excludes private identity data.';
comment on table public.live_chat_participants is 'Current Live chat participation markers for manual Admin review.';
comment on table public.live_chat_blocks is 'Manual Admin chat blocks. Language alone never creates a block.';
