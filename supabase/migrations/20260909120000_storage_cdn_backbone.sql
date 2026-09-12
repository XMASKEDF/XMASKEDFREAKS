-- Storage/CDN foundation. Additive only; existing media, orders, and entitlements remain intact.
alter table public.media_assets add column if not exists storage_bucket text not null default 'media';
alter table public.media_variants add column if not exists storage_bucket text not null default 'media';
alter table public.media_assets drop constraint if exists media_assets_storage_bucket_check;
alter table public.media_assets add constraint media_assets_storage_bucket_check check (storage_bucket ~ '^[a-z0-9][a-z0-9_-]{0,62}$');
alter table public.media_variants drop constraint if exists media_variants_storage_bucket_check;
alter table public.media_variants add constraint media_variants_storage_bucket_check check (storage_bucket ~ '^[a-z0-9][a-z0-9_-]{0,62}$');

create table if not exists public.media_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  storage_bucket text not null check (storage_bucket ~ '^[a-z0-9][a-z0-9_-]{0,62}$'),
  storage_path text not null,
  media_class text not null check (media_class in ('IMAGE','AUDIO','VIDEO')),
  original_filename text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  category_id text references public.media_categories(id) on delete set null,
  folder_id uuid references public.media_folders(id) on delete set null,
  requested_by uuid not null references public.admin_users(id) on delete restrict,
  media_asset_id uuid references public.media_assets(id) on delete set null,
  status text not null default 'UPLOADING' check (status in ('UPLOADING','UPLOADED','PROCESSING','READY','FAILED','QUARANTINED','DELETED')),
  expires_at timestamptz not null,
  uploaded_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(storage_bucket, storage_path)
);

create table if not exists public.media_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  upload_session_id uuid not null unique references public.media_upload_sessions(id) on delete cascade,
  job_type text not null check (job_type in ('IMAGE_PROCESSING','AUDIO_PROCESSING','VIDEO_PROCESSING','THUMBNAIL_GENERATION','PREVIEW_GENERATION','METADATA_EXTRACTION')),
  status text not null default 'QUEUED' check (status in ('QUEUED','RUNNING','SUCCEEDED','FAILED','RETRYING','CANCELED','ACTION REQUIRED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.media_storage_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('UPLOAD_REQUESTED','UPLOAD_COMPLETED','UPLOAD_FAILED','PROCESSING_STARTED','PROCESSING_COMPLETED','SIGNED_DOWNLOAD_ISSUED','DOWNLOAD_DENIED','CLEANUP_RUN')),
  media_id uuid references public.media_assets(id) on delete set null,
  upload_session_id uuid references public.media_upload_sessions(id) on delete set null,
  storage_bucket text,
  storage_path text,
  actor_admin_id uuid references public.admin_users(id) on delete set null,
  user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists media_upload_sessions_status_idx on public.media_upload_sessions(status, expires_at);
create index if not exists media_upload_sessions_requester_idx on public.media_upload_sessions(requested_by, created_at desc);
create index if not exists media_processing_jobs_due_idx on public.media_processing_jobs(status, next_attempt_at);
create index if not exists media_storage_events_created_idx on public.media_storage_events(created_at desc);

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values
  ('public-media', 'public-media', true, 15728640, array['image/jpeg','image/png','image/webp','image/avif','image/gif']),
  ('private-digital', 'private-digital', false, 524288000, array['audio/mpeg','audio/mp4','audio/x-m4a','audio/wav','audio/x-wav','audio/aac','audio/ogg','video/mp4','video/webm']),
  ('media-processing', 'media-processing', false, 524288000, array['image/jpeg','image/png','image/webp','image/avif','image/gif','audio/mpeg','audio/mp4','audio/wav','audio/aac','video/mp4','video/webm'])
on conflict(id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read published public media" on storage.objects;
create policy "Public can read published public media" on storage.objects for select to anon, authenticated using (bucket_id = 'public-media');

alter table public.media_upload_sessions enable row level security;
alter table public.media_processing_jobs enable row level security;
alter table public.media_storage_events enable row level security;
revoke all on public.media_upload_sessions, public.media_processing_jobs, public.media_storage_events from anon, authenticated;
