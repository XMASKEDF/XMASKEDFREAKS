update public.site_background_settings
set matrix_slim_settings = coalesce(matrix_slim_settings, '{}'::jsonb) || jsonb_build_object(
  'streamOpacity', 0.76,
  'brightness', 0.98,
  'globalOpacity', 0.8,
  'glowStrength', 0.09,
  'overlayOpacity', 0.12,
  'liveIntensity', 0.3
),
updated_at = now()
where id = 'default';
