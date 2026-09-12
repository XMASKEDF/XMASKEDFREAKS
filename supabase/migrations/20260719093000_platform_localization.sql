create table if not exists public.translation_entries (
  id uuid primary key default gen_random_uuid(),
  translation_key text not null,
  locale text not null,
  value text not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  updated_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (translation_key, locale)
);
create index if not exists translation_entries_locale_status_idx on public.translation_entries(locale, status);

create table if not exists public.missing_translation_logs (
  id bigint generated always as identity primary key,
  translation_key text not null,
  locale text not null,
  route text not null default '/',
  created_at timestamptz not null default now()
);
create index if not exists missing_translation_logs_locale_created_idx on public.missing_translation_logs(locale, created_at desc);

create table if not exists public.content_translations (
  id uuid primary key default gen_random_uuid(),
  content_type text not null,
  content_id text not null,
  field_name text not null,
  locale text not null,
  value text not null,
  updated_by uuid references public.admin_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (content_type, content_id, field_name, locale)
);

alter table public.translation_entries enable row level security;
alter table public.missing_translation_logs enable row level security;
alter table public.content_translations enable row level security;
