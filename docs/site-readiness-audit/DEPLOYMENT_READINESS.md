# Deployment Readiness

Status: **BLOCKED**

## Current State

| Item | Status |
| --- | --- |
| GitHub-ready app directory | Present |
| Lockfile | Missing |
| Dependency install | Not complete |
| Build verification | Blocked |
| Environment example | Updated |
| Supabase schema | Present |
| Deployment config | Missing |
| CI workflow | Missing |
| Production secrets | Not configured |
| CDN/WAF | Not configured |
| Domain `XMASKEDFREAKS.COM` | Not configured in repo |

## Recommended Deployment Path

1. Commit the Next.js app root as the repository root.
2. Install dependencies and commit the lockfile.
3. Add CI that runs install, typecheck, lint, build, and tests.
4. Create Supabase project and apply schema.
5. Configure production `.env` values in the deployment provider.
6. Connect domain and CDN/WAF.
7. Configure OBS live-status endpoint.
8. Add payment processor in test mode.
9. Add email provider in test mode.
10. Run full paid-access, wallet, notification, redirect, and admin smoke tests.

## Suggested Production Smoke Tests

- First admin setup locks permanently after one admin exists.
- Admin login rejects wrong credentials and requires real 2FA.
- `/admin` and `/api/admin/*` reject standard users.
- `/go` sends 100% to live when OBS status is active.
- `/go` splits offline traffic deterministically at configured percentages.
- 25-minute access locks and unlocks only after confirmed payment.
- Payment webhooks cannot double-credit wallet or coins.
- Email campaigns suppress duplicates per broadcast.
- Tip notification appears globally and disappears after configured duration.
- Unsupported countries/currencies are blocked with clear checkout messaging.

