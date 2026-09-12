# 11 Build Bible

## Reliability Validation

Run:

```bash
npm run test:reliability
npm run test:prelaunch
npm run typecheck
npm run lint
npm run build
```

The reliability suite verifies redaction, incident grouping, circuit behavior, ADMIN protection, public health privacy, wallet holds, immutable evidence, retention, browser cleanup, and provider job reporting. Browser validation must also open `/admin/reliability` through a valid administrator session and confirm the 16 panels at desktop and mobile widths.

Status: **BUILD PASSING / LAUNCH NOT APPROVED**

## Exact Commands

From app root:

```bash
cd /Users/calebyoung/Documents/Codex/2026-07-08/i/outputs/xmaskedfreaks-next
pnpm install
pnpm run lint
pnpm run typecheck
pnpm run build
pnpm run start
```

Package manager evidence:

- `pnpm-lock.yaml` exists and is the active lockfile.
- `node_modules` exists after Phase 2 dependency recovery.
- `package.json` scripts use `next lint`, `tsc --noEmit`, and `next build`.

## Current Build Evidence

- `node_modules`: PRESENT
- lockfile: PRESENT (`pnpm-lock.yaml`)
- lint: PASS on 2026-07-29 with zero warnings or errors
- typecheck: PASS on 2026-07-29
- production build: PASS on 2026-07-29 with Next.js 14.2.35
- style artifact check: PASS
- full repository tests: 135 PASS, 0 FAIL
- reliability tests: 11 PASS, 0 FAIL
- localhost `/api/health`: HTTP 200 with minimal public output
- unauthenticated `/admin/reliability`: HTTP 307 to `/admin/login`
- authenticated visual browser pass: UNVERIFIED because the in-app browser refused localhost control under its URL policy

See `docs/site-readiness-audit/DEPENDENCY_FIX_LOG.md`.
See `docs/Launch-Bible/17_BUILD_RECOVERY.md` for the React Hook dependency warning recovery.

## Printify Enterprise Management Validation

Status: **CODE COMPLETE / PRODUCTION UNVERIFIED**

- Added provider-neutral POD contracts and a Printify adapter.
- Added product, inventory-availability, provider, shipping-rate, health, order, and reconciliation synchronization.
- Added a sequential backend queue with configurable retry limits and preserved duplicate-order guards.
- Added `/admin/printify`, `/api/admin/printify`, and `/api/jobs/printify-management`.
- Added Reliability Center findings, sanitized API logs, daily provider metrics, CSV reporting, and audit evidence.
- No package dependency was added.

Validation:

- Typecheck: PASS
- Lint: PASS with zero warnings
- Full repository tests: 151 PASS, 0 FAIL
- Printify enterprise tests: 7 PASS, 0 FAIL
- Production build: PASS, 91 routes
- Unauthenticated `/admin/printify`: redirects to `/admin/login` with no console error
- Authenticated production provider synchronization: **UNVERIFIED**

Production prerequisites:

1. Apply `supabase/migrations/20260729_printify_enterprise_management.sql`.
2. Connect server-only Printify credentials and webhook secret.
3. Schedule both Printify worker routes using `CRON_SECRET`.
4. Run a test-mode fulfillment and reconciliation pass before live enablement.

## React Hook Dependency Recovery

Status: **COMPLETE**

Warnings found during this recovery: 9.

- `components/GlobalRewardNotifications.tsx`: missing `receiveRewardEvent` dependency in `useEffect`.
- `components/LiveRoom.tsx`: unnecessary `liveSeconds` dependency in `useMemo`.
- `components/LiveRoom.tsx`: missing `logCoinPolicyEvent` dependency in `useEffect`.
- `components/LiveRoom.tsx`: missing `lockAccess` dependency in `useEffect`.
- `components/LiveRoom.tsx`: missing `weightedAccessRedirect` dependency in `useEffect`.
- `components/LiveRoom.tsx`: missing `syncProfile` dependency in `useEffect`.
- `components/LiveRoom.tsx`: missing `recordGameScore` dependency in the round timer `useEffect`.
- `components/LiveRoom.tsx`: missing `recordGameScore` and `spaceEnemyOffset.y` dependencies in the shooter loop `useEffect`.
- `components/LiveRoom.tsx`: missing `fireSpaceShot` and `scoreGame` dependencies in the keyboard listener `useEffect`.

Correction summary:

- Stabilized reward notification event handling with `useCallback`.
- Replaced the world clock memo with direct render-time calculation so clock refreshes follow the normal `liveSeconds` rerender without a fake memo dependency.
- Stabilized access-control, redirect, coin-policy, profile-sync, game-score, game-level, and game-shot handlers.
- Used `gameSnapshotRef` for score recording and moving enemy offset checks where interval callbacks need the latest mutable state without recreating timers unnecessarily.
- Kept every event listener, timer, and interval cleanup intact.

Validation result:

- `pnpm run typecheck`: PASS
- `pnpm run lint`: PASS with zero React Hook dependency warnings
- `pnpm run build`: PASS

## Tests Required Before Launch

1. Redirect manager live/offline split.
2. OBS endpoint active/inactive behavior.
3. Payment quote validation.
4. Stripe webhook idempotency once implemented.
5. Wallet credit/debit atomicity once implemented.
6. Access lock/unlock server persistence.
7. Admin setup lockout.
8. Admin login and real 2FA.
9. Middleware block/throttle/allow.
10. RLS access tests.
11. Localization fallback tests.
12. Mobile/theater visual tests.

## Deployment

Status: **MISSING**

No deployment provider config exists. Add provider config and CI before launch.

## Rollback

Status: **MISSING**

Required rollback elements:

- Previous deployment version.
- Database migration rollback plan.
- Feature flag disable plan.
- DNS rollback plan.
- Stripe webhook rollback/disable plan.

## Health Checks

Implemented in code:

- Minimal public `/api/health`.
- Protected reachability, function, and latency checks for database, auth, storage, wallet, orders, fulfillment, email configuration, notifications, live status, jobs, and backup evidence.
- Provider configuration is shown as UNVERIFIED until a provider-specific active probe succeeds.
- Backup, payment, deployment, and production provider checks remain launch-blocking where no real integration exists.
