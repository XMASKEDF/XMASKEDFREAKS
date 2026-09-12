# 17 Build Recovery

Status: **COMPLETE**

Recovery date: 2026-07-12  
App root: `/Users/calebyoung/Documents/Codex/2026-07-08/i/outputs/xmaskedfreaks-next`

## Commands Executed

```bash
pnpm run lint
pnpm run typecheck
pnpm run lint
pnpm run build
```

## React Hook Warnings Found

Total warnings found: 9.

| File | Hook | Warning | Root Cause | Correction |
| --- | --- | --- | --- | --- |
| `components/GlobalRewardNotifications.tsx` | `useEffect` | Missing `receiveRewardEvent` dependency | Event listener effect referenced an inline handler that changed every render. | Wrapped `playSound` and `receiveRewardEvent` in `useCallback`; added the handler dependency while preserving channel and listener cleanup. |
| `components/LiveRoom.tsx` | `useMemo` | Unnecessary `liveSeconds` dependency | `liveSeconds` forced recomputation but was not read inside the memo body. | Replaced the memo with direct render-time world clock calculation so the existing one-second rerender refreshes clocks without a fake dependency. |
| `components/LiveRoom.tsx` | `useEffect` | Missing `logCoinPolicyEvent` dependency | Coin policy audit effect referenced an unstable helper. | Converted the helper to a stable `useCallback` and read the current actor through `coinPolicyActorRef`. |
| `components/LiveRoom.tsx` | `useEffect` | Missing `lockAccess` dependency | Access timer effect called a function declared outside the effect. | Converted access lock logic to `useCallback` with only checkout timer and payment minimum dependencies. |
| `components/LiveRoom.tsx` | `useEffect` | Missing `weightedAccessRedirect` dependency | Checkout timeout effect referenced redirect logic without listing it. | Converted redirect selection to `useCallback` and listed it in the timeout effect. |
| `components/LiveRoom.tsx` | `useEffect` | Missing `syncProfile` dependency | Supabase auth listener used a profile sync helper without dependency tracking. | Converted profile sync to `useCallback` with Supabase, language, and time zone dependencies; retained auth listener cleanup. |
| `components/LiveRoom.tsx` | `useEffect` | Missing `recordGameScore` dependency | The round timer recorded scores from a non-stable closure. | Converted score recording to a stable callback backed by `gameSnapshotRef` so timers use current score state without recreating on every score tick. |
| `components/LiveRoom.tsx` | `useEffect` | Missing `recordGameScore` and `spaceEnemyOffset.y` dependencies | Shooter interval needed current enemy offset and score recording state. | Used `gameSnapshotRef.current.spaceEnemyOffset.y` inside the interval and added stable `recordGameScore` as a dependency. |
| `components/LiveRoom.tsx` | `useEffect` | Missing `fireSpaceShot` and `scoreGame` dependencies | Keyboard listener referenced gameplay helpers that were not dependency-safe. | Converted scoring, level advancement, and shooting to callbacks; changed scoring to a functional state update to avoid stale score closures. |

## Files Changed

- `components/GlobalRewardNotifications.tsx`
- `components/LiveRoom.tsx`
- `docs/Launch-Bible/11_BUILD_BIBLE.md`
- `docs/Launch-Bible/15_TECHNICAL_DEBT.md`
- `docs/Launch-Bible/17_BUILD_RECOVERY.md`
- `docs/Launch-Bible/README.md`

## Behavioral Verification

- Reward notification listeners still register once per mounted component and clean up `BroadcastChannel`, `window` event, and storage listeners on unmount.
- Access-control timers still clear both the one-second timer and minute revalidation timer on cleanup.
- Checkout timeout still clears its timer on cleanup.
- Supabase auth listener still unsubscribes on cleanup.
- Game round timer and shooter interval still clear intervals on cleanup.
- Keyboard listener still removes the `keydown` handler on cleanup.
- `/api/stream-settings` remains loaded by a mount-only effect and is not part of the hook dependency changes.

## Validation Results

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm run typecheck` | PASS | `tsc --noEmit` completed successfully. |
| `pnpm run lint` | PASS | Zero ESLint warnings or errors. Zero `react-hooks/exhaustive-deps` warnings. |
| `pnpm run build` | PASS | Next.js 14.2.35 production build completed successfully. |

## Remaining Warnings

None.

## Intentionally Unresolved Items

None. No lint rule was disabled and no `eslint-disable` comments were added.

