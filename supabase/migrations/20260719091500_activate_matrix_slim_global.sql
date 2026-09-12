insert into public.site_background_settings (
  id,
  enabled,
  background_type,
  scope,
  opacity,
  overlay,
  matrix_slim_settings
)
values (
  'default',
  true,
  'canvas',
  'global',
  0.2,
  'rgba(0,0,0,0.78)',
  '{"enabled":true,"quickPreset":"calm"}'::jsonb
)
on conflict (id) do update set
  enabled = true,
  background_type = 'canvas',
  scope = 'global',
  opacity = 0.2,
  overlay = 'rgba(0,0,0,0.78)',
  matrix_slim_settings = coalesce(public.site_background_settings.matrix_slim_settings, '{}'::jsonb)
    || '{"enabled":true,"quickPreset":"calm"}'::jsonb,
  updated_at = now();
