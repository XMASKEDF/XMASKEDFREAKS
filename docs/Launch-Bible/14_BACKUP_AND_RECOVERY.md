# 14 Backup And Recovery

## Current Evidence

The Reliability Center can display backup status, encryption flag, retention, next schedule, size, failure code, and last restore-test time through `reliability_backups`.

Actual Supabase backups, file-storage backups, secret escrow, deployment artifacts, and a successful restoration test are **UNVERIFIED**. This remains a launch blocker. Do not mark backup health operational merely because a provider reports that a backup file exists.

## Required Restore Test

1. Create an isolated recovery environment.
2. Restore the database backup without touching production.
3. Restore private storage with access policies intact.
4. validate row counts, RLS, admin access, wallet ledgers, orders, entitlements, and media references.
5. Run typecheck, build, health checks, and purchase read-only checks.
6. Record completion and evidence in `reliability_backups.restore_tested_at`.
7. Destroy the isolated environment using the approved retention process.

Status: **MISSING / UNVERIFIED**

## What Must Be Backed Up

| Asset | Current Evidence | Required Recovery Method |
| --- | --- | --- |
| Source code | Local project folder | Git remote with protected main branch and tags. |
| Dependency lockfile | MISSING | Commit generated lockfile. |
| Supabase schema | `supabase/schema.sql` | Versioned migrations. |
| Supabase data | UNVERIFIED | Automated backups and restore drill. |
| Admin accounts | `admin_users` table | Restore from Supabase backup. |
| Wallet/payment ledgers | Schema tables | Immutable ledger backups and processor reconciliation. |
| Media uploads | MISSING storage config | Storage bucket backup and signed URL recovery. |
| Env/secrets | `.env.example` placeholders only | Secret manager export/recovery procedure. |
| Deployment config | MISSING | Provider config in repo or documented dashboard export. |
| DNS/CDN config | MISSING | Cloudflare config export/manual recovery. |

## Restore Priority

1. DNS/CDN points to known good deployment.
2. Application build artifact restored.
3. Supabase schema/data restored.
4. Admin access restored.
5. Payments/wallet reconciled.
6. Stream provider restored.
7. Support/email restored.
8. Analytics/cost dashboards restored.

## Required Backup Drills

- Restore Supabase to staging.
- Restore wallet/payment ledger and reconcile totals.
- Restore media bucket.
- Restore env from secret manager.
- Roll back deployment.
- Roll back DNS.
# 2026-08-03 Verification Note

Automated database backup retention, storage backup coverage, and a completed timed restore were not verifiable from this repository or local environment. Their launch status remains **UNVERIFIED**. Do not treat the presence of backup-status tables as proof that a provider backup or restore succeeded. Complete a staging restore exercise and attach provider evidence before changing this status.
