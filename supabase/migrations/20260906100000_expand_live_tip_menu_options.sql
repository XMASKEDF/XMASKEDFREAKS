-- Expand the configurable Live tip ladder without changing existing options.
-- Existing Admin edits win at runtime; these rows only add missing catalog entries.
insert into public.tip_options (id, emoji, phrase, token_cost, display_order, featured, alert_style, sound_style)
values
  ('im-watching', '👀', 'I’m Watching', 4, 10, false, 'glow', 'ching'),
  ('that-was-hot', '🔥', 'That Was Hot', 6, 11, false, 'glow', 'ching'),
  ('keep-going', '😏', 'Keep Going', 12, 12, false, 'glow', 'ching'),
  ('dont-stop', '🫦', 'Don’t Stop', 16, 13, false, 'glow', 'ching'),
  ('okayyy-i-see-yall', '🥵', 'Okayyy I See Y’all', 24, 14, false, 'glow', 'ching'),
  ('show-some-love', '❤️', 'Show Some Love', 40, 15, false, 'glow', 'ching'),
  ('turn-it-up', '😈', 'Turn It Up', 60, 16, false, 'pulse', 'bell'),
  ('keep-the-show-going', '💚', 'Keep The Show Going', 80, 17, false, 'glow', 'ching'),
  ('vip-energy', '👑', 'VIP Energy', 150, 18, false, 'pulse', 'bell'),
  ('yall-wild', '🚨', 'Y’ALL WILD', 300, 19, false, 'spark', 'arcade')
on conflict (id) do nothing;
