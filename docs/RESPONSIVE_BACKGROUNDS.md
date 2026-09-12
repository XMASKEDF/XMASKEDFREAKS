# Responsive Backgrounds

## Ownership

`BackgroundProvider` is mounted once by the root layout. It owns the fixed visual layer and one `BackgroundResizeManager`. Individual pages and background components do not attach their own window resize listeners.

The manager observes resize, orientation, fullscreen, visual viewport, browser zoom, and device-pixel-ratio changes. Normal resize updates use the ADMIN-configured 50–250 ms debounce. Orientation, fullscreen, and pixel-ratio changes publish immediately.

## Rendering contract

Every viewport update contains CSS dimensions, render dimensions, clamped pixel ratio, orientation, fullscreen state, reduced-motion state, and the calculated device performance tier. Future Three.js renderers should consume `useBackgroundViewport()` or the `xmf:background-viewport` event to update the existing renderer, camera projection, composer, render targets, shader resolution, and particle bounds. They must not create another resize listener or recreate the renderer.

Static images use proportional `cover` sizing and the saved focal point. Desktop, mobile, and fallback images switch without exposing empty edges. The fixed layer has `pointer-events: none`; all application UI remains in the foreground interaction layer.

Looping video uses one persistent muted `video` element with `playsInline`, `loop`, and `object-fit: cover`. Resizing does not change its source or playback position. Reduced-motion visitors receive the static poster/fallback instead.

## Performance

Pixel ratio defaults to a maximum of 2. Device memory, CPU concurrency, viewport, and pointer characteristics select low, medium, high, or ultra mode using browser-supported signals only. Dynamic resolution lowers the render ratio on weaker devices while retaining the original source asset.

## ADMIN settings

`ADMIN → Appearance → Background Manager → Advanced responsive settings` controls responsive scaling, maximum pixel ratio, debounce time, particle density scaling, aspect ratio, dynamic resolution, mobile performance mode, and automatic GPU optimization. The API clamps all numeric values server-side.

Apply `supabase/migrations/20260719_responsive_backgrounds.sql` before changing these options in staging or production.

## Current WebGL status

The viewport and lifecycle contract is ready for a persistent Three.js renderer. Three.js/R3F packages remain unavailable in the current offline workspace, so this change does not claim that WebGL rendering, post-processing buffers, bloom, or camera projection updates are active yet.
