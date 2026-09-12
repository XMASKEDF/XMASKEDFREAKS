# XMASKEDFREAKS Infrastructure Backbone

The application uses a provider-neutral infrastructure layer in `lib/infrastructure/`. Public and Admin features depend on interfaces rather than directly on Cloudflare, Redis, S3, a queue vendor, an email vendor, or a streaming vendor.

## Environment boundary

Set `XMF_ENVIRONMENT` explicitly to `LOCAL`, `SANDBOX`, `STAGING`, or `PRODUCTION`. If it is absent, the safe development default is `LOCAL`. Each environment must receive separate database, payment mode, email, storage, queue, cache, analytics, webhook, and Printify configuration. Local adapters are never production-ready: the Admin Infrastructure Center reports `ACTION REQUIRED` when production still uses them.

## Provider interfaces

- `ObjectStorageProvider`: upload, download, delete, exists, metadata, signed URLs, copy, and list. Local memory storage is available for development; S3-compatible support is intentionally an adapter boundary for an approved provider such as R2 or S3.
- `AssetDeliveryProvider` boundary is represented by storage visibility and `CDN_PUBLIC_BASE_URL`; public and private objects remain separate.
- `JobQueueProvider`: enqueue, schedule, retry, cancel, status, and queue metrics. Retry policies exclude financial movement from blind retries.
- `EventBus`: normalized events with `eventId`, environment, correlation ID, and duplicate prevention.
- `CacheProvider`: local memory or Redis-compatible `get`, `set`, `delete`, `increment`, `expire`, token-aware distributed locks, bounded health probes, and hit/miss/error metrics. Keys are environment-namespaced; request subjects are hashed before rate-limit storage. Sensitive wallet balances are not cached by this layer.
- `RateLimitProvider` behavior is centralized in `checkRateLimit` with endpoint-specific policies for authentication, checkout, tips, callbacks, uploads, search, scores, newsletter, feedback, and Admin APIs.
- `BotProtectionProvider` and `UploadSecurityProvider` are safe hooks. Uploads are rejected when extension/signature checks disagree, and remain quarantined when an approved malware scanner is unavailable. No Turnstile or malware scanner is claimed active without credentials and a real provider check.
- `FeatureFlagProvider` supports `OFF`, `SANDBOX`, `CONTROLLED`, and `ON` states. The current local adapter is process-local and the protected Admin API is the only control surface; production cannot enable `ON` until a durable provider is connected.
- `structuredLog`, correlation context helpers, and metric helpers normalize request/event/job IDs while redacting payment, credential, authentication, and personal fields. They are safe logging primitives, not a claim that an external monitoring vendor is active.
- Health, backup, deployment, rollback, external monitoring, and streaming status are modeled in the Infrastructure snapshot. Backup/PITR values are `NOT CONFIGURED` until a provider reports them; environment placeholders are never treated as a successful backup check. The public `/api/health` endpoint returns only a safe status and timestamp; provider details remain Admin-only.

## Storage paths and media processing

Use predictable prefixes: `products/`, `merch/`, `paintings/`, `audio/`, `audio/previews/`, `video/`, `live/`, `upcoming/`, `thumbnails/`, and `user-safe/`. Objects carry stable IDs, checksums, MIME metadata, visibility, owner/reference, and quarantine status. Image, audio, and video processing are job descriptions and must run outside the Next.js request path when a worker is connected.

Private media must use server-authorized or signed URLs. Permanent public URLs are reserved for explicitly public assets.

## Shared-state boundary

`CACHE_PROVIDER=LOCAL` is the safe default for local development and one-process Sandbox runs. Production multi-instance deployments require `CACHE_PROVIDER=REDIS_COMPATIBLE`, a server-only `REDIS_REST_URL` or HTTPS `REDIS_URL`, and a server-only `REDIS_TOKEN`. The Admin Infrastructure Center reports the provider, shared/local mode, bounded probe latency, reachability, and degraded fallback without exposing credentials. Redis is coordination/cache only; database uniqueness and RPCs remain authoritative for money, orders, payment callbacks, entitlements, and contribution history.

## Queue and event safety

Job records carry environment, idempotency key, order/user references, timestamps, retry count, status, and error. Printify jobs must verify the provider reference before retrying. Payment and payout jobs must verify processor state before any retry. Processed event IDs are persisted by the migration for high-risk production handlers.

## Health and Admin

`/api/health` exposes only safe liveness/readiness summaries. `/admin/system/infrastructure` is protected by the normal Admin role and operations permission and shows provider, last check, status, error state, queue metrics, cache metrics, backup/PITR readiness, feature flags, security-edge readiness, and release readiness. Deep provider details remain Admin-only.

## Reliability and Security boundaries

Infrastructure incidents should be recorded through the existing Reliability Center. Rate-limit, invalid upload, bot, callback, and suspicious API events belong in the existing Security Center. Optional services must fail independently: analytics, email, cache, thumbnails, and monitoring cannot stop Live, checkout, authentication, wallet integrity, or security enforcement.

## Failure isolation and observability

Optional services must use the existing reliability circuit-breaker boundary before repeated external calls. Cache, email, analytics, media processing, monitoring, and CDN failures must fall back or queue safely without changing payment, wallet, authentication, security, or live-stream integrity. Use correlation IDs when a request enters a queue, publishes an event, or reports a dependency failure; structured metadata must remain redacted.

## Production checklist

Before production: configure explicit environment isolation, approved object storage/CDN, durable queue workers, cache provider, email provider, streaming provider, backup/PITR verification, external uptime monitoring, WAF/DDoS/bot provider, deployment release metadata, a durable feature-flag provider, and migration review. Do not activate paid providers or claim health until a real check passes. The additive migrations are `20260816_infrastructure_backbone.sql`, `20260816_infrastructure_flags_observability.sql`, and `20260817_infrastructure_safety_layer.sql`; apply them through the existing migration workflow after a backup and staging test. The safety migration adds append-only audit evidence, handler-failure evidence, external monitor checks, staging/sandbox restore-test records, release history, new provider values, and the `SCANNING` media state without deleting or rewriting existing business data.
