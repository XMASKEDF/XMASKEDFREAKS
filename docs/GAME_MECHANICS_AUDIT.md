# Game Mechanics Audit

## Scope

Verified the production code paths for Pac-Mask Chase, Space Invader Sweep, and Slither. The existing artwork, game catalog, dedicated play shell, ADMIN asset controls, and leaderboard surfaces were preserved.

## Failures Found And Corrected

| Game / system | Original failure | Correction | Verification |
| --- | --- | --- | --- |
| Shared runtime | Frame-delta updates and page-wide keyboard listeners produced device-dependent input and stale held keys. | Added a 60 Hz accumulator loop and focus-aware shared input manager with blur/unmount cleanup. | Automated fixed-step test; desktop and mobile browser runs. |
| Shared score submission | Runs had no idempotency key and could be credited more than once. | Added per-run UUIDs, server validation, sanitized metadata, a Supabase unique session index, and conflict-ignore writes. | Typecheck, API/schema inspection, score-ledger test. |
| Pac-Mask | Countdown reset repeatedly because callback identities changed after parent renders. | Stabilized shell callbacks and focus activation. | Browser reached `running`; Pause enabled. |
| Pac-Mask | Center tolerance snapped the player back every frame, making movement appear frozen. | Reduced center capture to a sub-step window while preserving buffered intersection turns. | Browser moved from cell `(1,1)` to `(3,1)`. |
| Pac-Mask | Input only sampled held keys and quick taps could be missed. | Added immediate direction buffering plus held Arrow/WASD sampling. | Browser input and engine tests. |
| Pac-Mask | Pellet, power-pellet, ghost-chain, life, and level behavior was mixed into rendering. | Moved authoritative state and scoring into `lib/games/pacmask-engine.ts`. | Unique pellet, collision, frightened-capture, and frame-rate tests. |
| Space Invader | Point-sampled shots could pass through enemies; shields and formations were loosely coupled to frame rate. | Added swept projectile checks, fixed-step formation movement, one active player shot, destructible shield cells, lives, waves, and accuracy metadata. | Projectile, shield, held movement, pause/resume, and mobile checks. |
| Slither | Spawn protection compared elapsed simulation time with wall-clock time and could remain active indefinitely. | Spawn protection now uses one simulation clock. | Code inspection and live collision/game-over run. |
| Slither | Arena clamping made boundary death impossible. | Removed head clamping and added authoritative arena collision. | Live run reached a single `game-over` state. |
| Slither | Starting mass granted 80 free points and growth could be counted twice. | Score now comes only from collected food and kill bonuses. | Automated zero-start test; browser observed score `0` at start and `24` after collection. |
| Slither | Global keyboard listeners and per-frame React publishing created avoidable work. | Reused shared focused input and limited UI snapshots to 10 Hz while the canvas remains 60 Hz. | Browser interaction and console inspection. |

## Current Architecture

- Game logic is separate from canvas rendering.
- Simulation updates run at a fixed 60 Hz with capped catch-up work.
- Keyboard controls are scoped to the focused game and cleared on blur/unmount.
- Pointer and touch controls release on pointer-up and pointer-cancel.
- Pause, countdown, running, level-complete, game-over, and error states are explicit.
- Development mode exposes collision overlays with `?debugCollisions=1` and read-only canvas state markers for browser verification.
- Run scores are submitted once per generated session ID with compact result metadata.

## Validation Results

- `pnpm run test:games`: 9 passed, 0 failed.
- `pnpm run typecheck`: passed.
- `pnpm run lint`: passed with zero warnings.
- `NEXT_DIST_DIR=.next-production pnpm run build`: passed; 31 routes generated.
- Browser console: no errors or warnings across all three game routes.
- Mobile viewport: 390x844, no horizontal overflow; Space Invader canvas measured 362x204 and touch controls were visible.

## Production Note

Applying `supabase/schema.sql` to the real Supabase project remains a deployment operation. Until that is performed and the service credentials are configured, browser scores continue to save locally and the API reports that Supabase persistence is unavailable.
