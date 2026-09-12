# XMASKEDFREAKS Operations Backbone

This document is the provider-neutral operational contract for the existing XMASKEDFREAKS application. It is useful in local and Sandbox environments without implying that a production provider is connected.

## Operating surfaces

- Liveness: `GET /api/health` returns only a safe process status and timestamp.
- Readiness: `GET /api/readiness` returns `200` only when the current environment is ready to accept traffic; production requires a healthy Supabase health check while local/Sandbox remain usable without production credentials.
- Admin operations: `/admin/system/infrastructure` remains protected by the existing Admin session and `admin.operations.manage` permission.
- Reliability: the existing Reliability Center remains the incident, alert, job, and recovery evidence surface. Update Control remains change-management history; neither replaces the other.

## Logging and correlation

Server logs use `lib/infrastructure/observability.ts`. The logger emits uppercase `DEBUG`, `INFO`, `WARN`, `ERROR`, and `CRITICAL` levels while accepting the older lowercase call shape. It bounds strings/collections, redacts credential-like keys, removes bearer/JWT material and signed query values, and hashes session identifiers before they reach a log entry.

Middleware creates or validates one bounded `x-request-id`, forwards it to the request context, and returns it on responses. Provider and queue code can carry that identifier with `correlationHeaders`; database records remain the authoritative business evidence.

## Provider health and alerting

The Infrastructure snapshot remains the aggregation point for Supabase, storage/CDN, cache, queue/workers, security edge, streaming, media processing, email, backup/PITR, external monitoring, deployment, Printify, and feature flags. Disabled provider modes remain disabled even when stray endpoint variables are present. Printify health does not probe the provider when `PRINTIFY_INTEGRATION_MODE=disabled`.

The alert boundary is `lib/infrastructure/alerts.ts`. It is disabled by default, supports only an explicitly selected local adapter in development, and applies a cooldown/deduplication window. It does not pretend that an external paging provider is connected.

Server error reporting has the separate `ErrorReportingProvider` boundary in `lib/infrastructure/error-reporting.ts`. `ERROR_REPORTING_PROVIDER=NONE` is the default; `LOCAL` records safe, bounded structured events only. The browser Reliability reporter remains the source for client error evidence, and future Sentry/Datadog/hosting adapters can be added without changing route code.

## Backups and restore drills

No production backup or restore command is run by this workspace package. The guarded commands are:

```text
corepack pnpm backup:create schema
corepack pnpm backup:create data
corepack pnpm backup:verify -- --artifact=supabase/pre_migration_backup.sql
corepack pnpm backup:verify -- --artifact=supabase/pre_migration_data_backup.sql
corepack pnpm backup:verify -- --artifact=backups/database/<artifact>.sql --restore
```

Creation requires `BACKUP_DB_URL` and `BACKUP_TARGET=LOCAL|SANDBOX|ISOLATED`; production-like hostnames are rejected. Artifacts are unique, checksummed, and written beneath the ignored `backups/` directory. Restore requires Docker, an isolated restore target, and explicit confirmation. Existing pre-migration backup files are not changed.

## Release, deployment, and rollback

`corepack pnpm release:check` performs a non-mutating plan. `corepack pnpm production:verify -- --full` runs the application checks and runs the production build only when no project development server is active. The existing `prebuild` guard remains authoritative, so an active local server is never stopped by this package. There is no deployment provider, domain/DNS certificate automation, or automatic rollback claim in this repository until an approved provider is configured.

## Fulfillment, payments, and files

The unified commerce/cart/order layer remains the source of truth. Physical Merch and Paintings can enter provider-neutral fulfillment; Audio and Feet remain digital and use EntitlementService/private signed delivery. Printify remains queued, sequential, retry-limited, idempotent, reconciliation-first, and disabled until explicitly configured. Payment settlement remains disabled until an approved processor and callback verification are configured. Media uploads remain quarantined until validation/scanning/processing release succeeds; no public permanent storage URL is treated as an entitlement.

## Launch blocker matrix

| Area | Current state | Required evidence |
| --- | --- | --- |
| Application and Admin authorization | CONFIGURED for local/Sandbox | Production deployment rehearsal and role review |
| Database/migrations | PARTIAL | Apply any newer local migrations through the approved reviewed workflow; verify remote history |
| Payments and coin settlement | NOT CONFIGURED | Approved processor, hosted checkout, signed callbacks, reconciliation |
| Printify and shipping | DISABLED / PARTIAL | Credentials, provider selection, shipping probe, queue worker, webhook and reconciliation rehearsal |
| Cloudflare/OBS/Live | PARTIAL | Approved Live provider, ingest, manifest, HLS, playback, timer and tipping rehearsal |
| Storage/CDN/media scanning | LOCAL / PARTIAL | Production private storage, CDN, scanner, media worker, signed delivery and purge tests |
| Queue/cache/event bus | LOCAL | Durable multi-instance providers and failure drills |
| Email and notifications | DISABLED | Verified sender, delivery provider, unsubscribe and incident notification tests |
| Backups/PITR/restore | NOT CONFIGURED | Provider evidence and timed isolated restore |
| Monitoring/alerting | LOCAL boundary only | External uptime, error reporting, paging, retention and alert routing |
| Domain/DNS/HTTPS | NOT CONFIGURED in this repository | Registrar/DNS, canonical URL, TLS, trusted origin and callback allowlists |
| Tax/accounting/payout | PARTIAL | Tax rules/provider, reconciliation, payout approval and export review |
| Production Admin MFA | Email 2FA code-ready; TOTP not claimed | Approved production MFA enrollment and recovery drill |

These states are intentionally conservative. No provider credential, payment, remote migration, deployment, backup restore, or production settlement is simulated by this package.
