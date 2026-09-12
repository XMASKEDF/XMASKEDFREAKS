# XMASKEDFREAKS Motion and Performance Layer

## Purpose

The site targets a smooth 60 FPS experience on hardware that can sustain it. The 60 FPS target is a rendering goal, not a business or timing dependency. Wallets, payments, tips, security, access rules, notifications, and game rules remain driven by authoritative state and real time.

## Architecture

- `components/motion/MotionProvider.tsx` is the site-wide client coordinator. It detects reduced motion, page visibility, route focus, and broad device constraints, exposes `AUTO`, `FULL`, `BALANCED`, and `REDUCED` modes, and publishes a small diagnostic snapshot.
- `hooks/useRafLoop.ts` is the reusable cancellable RAF primitive. It uses a callback ref so changing application state does not create duplicate loops.
- `lib/motion/performance.ts` contains pure mode selection, frame-delta clamping, and performance constants.
- `lib/motion/tokens.ts` is the shared duration and easing vocabulary: instant 100ms, fast 160ms, normal 220ms, slow 360ms.
- `components/admin/MotionPerformancePanel.tsx` exposes the diagnostics only from the protected Admin shell.
- `components/background/MatrixSlimCanvas.tsx` consumes the motion mode and route focus through refs. Route changes do not restart the Matrix loop. Game focus reduces Matrix work before any foreground interaction is affected.

The provider is mounted once in the root layout around the existing background, providers, persistent controls, and route shell. The existing Matrix, account, wallet, translation, privacy, contribution, notification, and analytics providers remain in their original order.

## Frame Rules

Visual loops use `requestAnimationFrame` and elapsed time. Stalled deltas are clamped to 100ms for diagnostics and reusable client motion. Existing game engines continue to use their own fixed-step or delta-time schedulers; the site motion layer does not redraw video or own game physics.

The frame budget is approximately 16.67ms. Frames above 50ms are counted as long frames and aggregated once per second. The browser `PerformanceObserver` is used where supported for long tasks and layout-shift entries. Per-frame data is not sent to the server.

## Adaptive Modes

- `AUTO` is the default. It begins from broad browser signals such as `deviceMemory`, hardware concurrency, and Save-Data, then adapts when sustained frame measurements show pressure.
- `FULL` preserves decorative work on capable devices.
- `BALANCED` reduces background effect intensity and Matrix stream work.
- `REDUCED` limits decorative background work and disables decorative CSS animation while preserving content and interactions.

`prefers-reduced-motion` always applies the conservative visual mode. Hidden tabs stop the shared diagnostic RAF and the existing Matrix/game visibility handling pauses or reduces expensive loops. Route focus is `live`, `game`, `admin`, or `default`; game focus lowers Matrix work without changing gameplay.

## Interaction Language

Existing surfaces now share motion variables for transform, opacity, borders, shadows, panels, dialogs, cards, and buttons. Press feedback is transform-first and immediate. Reduced-motion users receive no decorative transitions. Critical errors, navigation, security, payment, and shutdown actions are not delayed by visual animation.

## Performance Boundaries

- Live video remains in the browser media pipeline; the motion layer never manually redraws video.
- Business timers remain wall-clock or server-authoritative timers, never frame counters.
- Admin and visitor bundles remain route-owned; game modules continue to load dynamically through the existing recovery boundary.
- Existing image dimensions, lazy loading, catalog containment, background cleanup, and game visibility rules remain active.
- The diagnostic surface records only aggregate runtime values: FPS estimate, average frame time, long-frame rate, observer counts, reduced-motion state, visibility, route focus, and background effect level.

## Verification

Focused coverage is in `tests/motion-layer.test.mjs`. It verifies the cancellable RAF primitive, delta clamping, adaptive mode vocabulary, PerformanceObserver integration, Matrix focus/mode consumption, reduced-motion hooks, token presence, and Admin-only diagnostics wiring.

`corepack pnpm exec tsc --noEmit --incremental false`, `corepack pnpm lint`, `node --test tests/motion-layer.test.mjs`, and `corepack pnpm test:styles` are the reliable local checks for this layer. Browser-specific FPS, device throttling, 120Hz, mobile battery, and long-session measurements require a connected browser/device and are not represented as fake pass results here.

## Known Limits

Browser APIs do not expose reliable thermal state on all devices, and device memory, battery, network quality, and refresh rate are intentionally treated as optional signals. The layer does not claim hardware telemetry it cannot observe. Production telemetry remains unverified until an approved analytics destination is connected.

