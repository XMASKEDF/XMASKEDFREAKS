-- Additive large-media processing and product assignment metadata.
-- This migration never removes or rewrites an existing media, product, or order.
alter table public.media_upload_sessions
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.media_assets
  add column if not exists media_class text not null default 'IMAGE',
  add column if not exists processing_status text not null default 'READY',
  add column if not exists processing_metadata jsonb not null default '{}'::jsonb,
  add column if not exists duration_seconds numeric,
  add column if not exists container text,
  add column if not exists video_codec text,
  add column if not exists audio_codec text,
  add column if not exists bitrate bigint,
  add column if not exists source_storage_bucket text,
  add column if not exists source_storage_path text,
  add column if not exists ready_storage_bucket text,
  add column if not exists ready_storage_path text,
  add column if not exists processing_error text;

alter table public.media_assets drop constraint if exists media_assets_media_class_check;
alter table public.media_assets add constraint media_assets_media_class_check check (media_class in ('IMAGE', 'AUDIO', 'VIDEO'));
alter table public.media_assets drop constraint if exists media_assets_processing_status_check;
alter table public.media_assets add constraint media_assets_processing_status_check check (processing_status in ('UPLOADING', 'UPLOADED', 'VALIDATING', 'SECURITY_SCAN_PENDING', 'QUARANTINED', 'PROCESSING', 'READY', 'FAILED'));

alter table public.audio_products
  add column if not exists media_asset_id uuid references public.media_assets(id) on delete set null,
  add column if not exists pending_media_asset_id uuid references public.media_assets(id) on delete set null,
  add column if not exists preview_media_asset_id uuid references public.media_assets(id) on delete set null,
  add column if not exists pending_preview_media_asset_id uuid references public.media_assets(id) on delete set null,
  add column if not exists thumbnail_media_asset_id uuid references public.media_assets(id) on delete set null,
  add column if not exists pending_thumbnail_media_asset_id uuid references public.media_assets(id) on delete set null;

alter table public.feet_request_presets
  add column if not exists download_media_asset_id uuid references public.media_assets(id) on delete set null,
  add column if not exists pending_download_media_asset_id uuid references public.media_assets(id) on delete set null,
  add column if not exists download_file_path text,
  add column if not exists download_mime_type text,
  add column if not exists download_extension text,
  add column if not exists download_file_size bigint,
  add column if not exists thumbnail_media_asset_id uuid references public.media_assets(id) on delete set null,
  add column if not exists pending_thumbnail_media_asset_id uuid references public.media_assets(id) on delete set null;

create index if not exists media_assets_processing_status_idx on public.media_assets(processing_status, created_at desc);
create index if not exists audio_products_media_asset_idx on public.audio_products(media_asset_id);
create index if not exists feet_request_presets_download_asset_idx on public.feet_request_presets(download_media_asset_id);

create or replace function public.claim_media_processing_jobs(p_limit integer default 5)
returns setof public.media_processing_jobs
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select id
    from public.media_processing_jobs
    where status in ('QUEUED', 'RETRYING')
      and next_attempt_at <= now()
    order by next_attempt_at asc, created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 5), 25))
  )
  update public.media_processing_jobs job
  set status = 'RUNNING',
      attempt_count = job.attempt_count + 1,
      started_at = now(),
      updated_at = now()
  from candidates
  where job.id = candidates.id
  returning job.*;
$$;

revoke all on function public.claim_media_processing_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_media_processing_jobs(integer) to service_role;
