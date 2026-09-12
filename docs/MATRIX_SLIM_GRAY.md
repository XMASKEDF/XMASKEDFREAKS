# MATRIX — SLIM GRAY INTERACTIVE

Internal key: `matrix-slim-gray-interactive`

The preset is an original, lightweight Canvas digital-rain implementation. It uses the root `BackgroundProvider`, the shared `BackgroundResizeManager`, one fullscreen Canvas, one animation frame loop, and one generated glyph atlas. It does not mount another renderer or block foreground pointer events.

## Visual system

The background is pure black with sparse, irregular streams. Glyphs use only approved grayscale values. Stream length, speed, opacity, depth, glyph timing, and start position vary independently. The implementation has no skybox, environment map, reflective floor, fog volume, camera movement, shadow maps, or bloom chain.

The source glyph atlas is generated once per preset activation from original numbers, Latin characters, brackets, slashes, and code-like marks. No Matrix film texture is included.

## Interaction

Passive delegated listeners provide pointer repel, safe-background click pulses, restrained scroll acceleration, optional hover clearing, and idle calm mode. The preset never prevents default browser behavior or stops event propagation. Clicks on links, buttons, inputs, video, game canvases, chat, wallet, Tip Menu, Maya, ADMIN controls, and dialogs are ignored.

The live player publishes `xmf:stream-playback`. Loading, connecting, buffering, starting, live, and paused states reduce rain speed, brightness, opacity, repel, and pulse strength to the ADMIN-configured live intensity.

## Responsive and performance behavior

`xmf:background-viewport` updates dimensions, DPR, orientation, fullscreen, and zoom. Existing streams are redistributed proportionally instead of being restarted. Density scales by usable viewport area and the mobile density multiplier. Mobile FPS is capped at 45. Hidden tabs pause, idle mode reduces work, and reduced-motion renders a static composition.

All listeners, animation frames, streams, pulses, atlas references, and Canvas buffers are released when the preset is disabled or replaced.

## Fallback assets

- `/backgrounds/matrix-slim-gray/matrix-slim-gray-reference.png` — 1536×864 desktop fallback
- `/backgrounds/matrix-slim-gray/matrix-slim-gray-thumbnail.png` — 640×360 ADMIN preview
- `/backgrounds/matrix-slim-gray/matrix-slim-gray-mobile.png` — 576×1024 mobile fallback

The approved game-background sheet was used only as structural direction. The generated images are original grayscale compositions and the source image was not overwritten. Automated PNG inspection verifies that the thumbnail has no measurable green cast.

## ADMIN

Open `ADMIN → Appearance → Background Manager → MATRIX — SLIM GRAY INTERACTIVE`. The preset defaults to inactive. Select `Interactive Canvas`, enable the global background and the Matrix preset, choose a quick preset or adjust individual rain, interaction, visual, and performance controls, then save.

Apply `supabase/migrations/20260719_responsive_backgrounds.sql` before saving Matrix settings in staging or production.

## WebGL boundary

The current repository still lacks Three.js/R3F packages. This Canvas renderer is the specification’s approved lightweight fallback and is fully functional. It is not represented as WebGL. When the dependencies become available, a future WebGL implementation can consume the same settings, live event, fallback assets, and resize contract without changing ADMIN or mounting a second renderer.
