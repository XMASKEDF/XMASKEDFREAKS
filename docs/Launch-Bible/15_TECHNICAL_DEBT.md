# 15 Technical Debt

## Reliability and Operations

| Priority | Item | Reason / required decision |
| --- | --- | --- |
| P0 | Add wallet ledger records to painting buy-now and auction settlement | Current coin deductions create genuine ledger mismatches and will trigger a spending hold. Must be fixed and reconciled before wallet launch. |
| P0 | Connect and restore-test backups | Schema and UI cannot prove that a recoverable backup exists. |
| P0 | Apply and verify the reliability migration | Local code cannot establish production database state. |
| P0 | Select and connect approved Segpay or CCBill hosted checkout | Neutral adapter, normalized event boundary, dedicated callback entry point, idempotent credit, ADMIN evidence, and reconciliation exist; official provider contract, signed callback rules, merchant approval, and credentials remain required. |
| P1 | Persist circuit-breaker state through distributed storage | Current breakers protect each server process independently. |
| P1 | Connect alert delivery and scheduled daily summaries | Admin alert queue exists; external provider delivery remains unverified. |
| P1 | Record deployment history from CI/CD | Schema and UI exist, but no deployment pipeline is connected. |
| P1 | Add an approved retention purge job | Retention periods exist; destructive cleanup is intentionally disabled pending approval. |
| P2 | Add provider-specific synthetic probes | Configured providers are not treated as functional until a safe active probe exists. |
| P0 | Apply and verify the Printify enterprise migration | The code, Admin center, and tests pass locally, but production tables and functions do not exist until the migration is applied. |
| P0 | Verify Printify with a test-mode order | Real product/provider/shipping responses, webhook signatures, provider order acceptance, and reconciliation require valid production-owned credentials. |
| P1 | Add durable distributed job locking/queue hosting | Database row claims are durable, but the scheduler and worker hosting are not connected in this repository. |
| P2 | Connect provider customer-satisfaction evidence | Printify’s inspected API does not expose this metric; the Admin panel reports it as UNVERIFIED rather than inventing a score. |

| Debt | Why Postponed | Priority | Owner | Evidence |
| --- | --- | --- | --- | --- |
| Production hosted provider missing | Segpay/CCBill not selected and official contract unavailable | Critical | Ledger | Provider placeholders deliberately fail closed |
| Real wallet ledger missing | UI/schema scaffold first | Critical | Ledger | `app/api/payments/route.ts`, schema |
| Real admin 2FA missing | Placeholder shape check implemented first | Critical | Atlas | `lib/admin-auth.ts` |
| RLS broad policies | Schema scaffolded before role function | Critical | Sage | `supabase/schema.sql` |
| Durable rate limiting missing | Middleware prototype only | High | Sage | `middleware.ts` |
| Cloudflare config missing | Provider not connected | Critical | Sage | No config files |
| Upload/storage missing | UI/data model before storage | High | Echo | No buckets/routes |
| Live payment processor missing | Neutral hosted checkout exists, but Segpay/CCBill contract is not connected | Critical | Ledger | `lib/payments/provider.ts` |
| Email provider missing | Notification API scaffold only | High | Maya | `app/api/live-notifications/route.ts` |
| OBS status endpoint unverified | Env hook exists only | High | Echo | `app/go/route.ts` |
| Monitoring missing | No provider selected | Critical | Katy | Repo inspection |
| Tests missing | No test script | Critical | Atlas | `package.json` |
| CI/CD missing | No workflow/config | Critical | Atlas | Repo inspection |
| Backup/restore missing | No config/drill | Critical | Atlas | Repo inspection |
| Localization hardcoded strings | Large UI built before extraction | Medium | Maya | `components/LiveRoom.tsx`, admin pages |
| Games anti-abuse missing | Prototype gameplay first | Low | Todd | `components/LiveRoom.tsx` |

## Resolved During Build Recovery

| Item | Resolution | Evidence |
| --- | --- | --- |
| Dependency install/build blocked | `node_modules` and `pnpm-lock.yaml` are present; `pnpm run typecheck`, `pnpm run lint`, and `pnpm run build` pass. | `docs/site-readiness-audit/DEPENDENCY_FIX_LOG.md`, `docs/Launch-Bible/17_BUILD_RECOVERY.md` |
| React Hook dependency warnings | 9 `react-hooks/exhaustive-deps` warnings were fixed without disabling lint rules. | `components/GlobalRewardNotifications.tsx`, `components/LiveRoom.tsx` |
