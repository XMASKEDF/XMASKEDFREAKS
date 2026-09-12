alter table public.site_background_settings add column if not exists background_type text not null default 'static';
alter table public.site_background_settings add column if not exists matrix_slim_settings jsonb not null default '{}'::jsonb;
alter table public.site_background_settings add column if not exists video_url text not null default '';
alter table public.site_background_settings add column if not exists focal_point_x numeric(5,4) not null default 0.5 check (focal_point_x between 0 and 1);
alter table public.site_background_settings add column if not exists focal_point_y numeric(5,4) not null default 0.5 check (focal_point_y between 0 and 1);
alter table public.site_background_settings add column if not exists responsive_scaling boolean not null default true;
alter table public.site_background_settings add column if not exists maximum_pixel_ratio numeric(4,2) not null default 2 check (maximum_pixel_ratio between 1 and 3);
alter table public.site_background_settings add column if not exists resize_debounce_ms integer not null default 75 check (resize_debounce_ms between 50 and 250);
alter table public.site_background_settings add column if not exists particle_density_scaling boolean not null default true;
alter table public.site_background_settings add column if not exists maintain_aspect_ratio boolean not null default true;
alter table public.site_background_settings add column if not exists dynamic_resolution boolean not null default true;
alter table public.site_background_settings add column if not exists mobile_performance_mode boolean not null default true;
alter table public.site_background_settings add column if not exists automatic_gpu_optimization boolean not null default true;

alter table public.site_background_settings drop constraint if exists site_background_settings_background_type_check;
alter table public.site_background_settings add constraint site_background_settings_background_type_check check (background_type in ('static', 'video', 'canvas', 'webgl'));
alter table public.site_background_settings drop constraint if exists site_background_settings_scope_check;
alter table public.site_background_settings add constraint site_background_settings_scope_check check (scope in ('global', 'live', 'games', 'admin', 'landing'));
