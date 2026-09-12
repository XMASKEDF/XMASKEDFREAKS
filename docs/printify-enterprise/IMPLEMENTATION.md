# Printify Enterprise Management

## Status

Implemented in the application and validated locally. Production API behavior remains **UNVERIFIED** until the migration is applied and valid Printify credentials are connected.

## Architecture

- `PodProvider` is the provider-neutral contract for products, providers, shipping, health, orders, and submission.
- Printify is the first adapter. Future print-on-demand providers can implement the same contract without changing checkout or Admin page architecture.
- Customer checkout remains coins-only and server-authoritative.
- Checkout creates one local fulfillment job. The browser never sends an order to Printify.
- The existing worker claims jobs through a database function and processes them sequentially.
- Local and provider order identifiers are unique. Retry actions are refused when a provider identifier is already recorded.

## Management Features

- Product lifecycle synchronization: new, changed, unpublished, missing, and removed products.
- Variant availability synchronization used by checkout eligibility.
- Provider catalog synchronization with preferred-provider configuration.
- Cached V2 shipping rates and delivery handling windows.
- Queue review, safe manual retry, and cancellation of unsent pending jobs.
- Configurable automatic retry count with exponential backoff and circuit breaking.
- Authenticated health probe, sanitized API diagnostics, rate-limit evidence, and latency.
- Read-only reconciliation of local orders, provider orders, statuses, and tracking.
- Daily provider metrics for orders, revenue, fulfillment, failures, production time, and shipping time where evidence exists.
- CSV operational report export.
- Reliability Center escalation and audit logging.

## Admin Access

Route: `/admin/printify`

Required:

- authenticated Admin session;
- completed Admin setup;
- `admin.commerce.manage` permission;
- existing mandatory Admin 2FA policy.

Every write action is rate-limited and audit logged. Retry and cancellation actions require explicit confirmation.

## Scheduled Jobs

- `/api/jobs/printify` processes fulfillment submissions.
- `/api/jobs/printify-management` performs due health, product, provider, shipping, and reconciliation work.
- Both require `Authorization: Bearer $CRON_SECRET`.
- Management work honors Admin switches and stored refresh intervals.

## Required Production Setup

1. Apply `supabase/migrations/20260729_printify_enterprise_management.sql`.
2. Configure `PRINTIFY_INTEGRATION_MODE`, `PRINTIFY_API_TOKEN`, `PRINTIFY_SHOP_ID`, and `PRINTIFY_WEBHOOK_SECRET`.
3. Configure a trusted scheduler for both job routes.
4. Register the verified Printify webhook endpoint.
5. Run health, product, provider, shipping, and reconciliation actions in test mode.
6. Compare at least one test order end to end before enabling live fulfillment.

## Safety Boundaries

- API tokens are server-only and never returned to Admin.
- API logs store endpoint groups, status, duration, rate-limit evidence, and error codes only.
- Reconciliation flags discrepancies and never creates replacement orders.
- Customer addresses stay in existing protected order storage and are not copied into operational logs.
- Provider customer-satisfaction data remains **UNVERIFIED** because Printify does not supply it through the inspected integration.
- Production-time and shipping-time metrics are populated only when timestamps are available.

## Dependencies

No package was added. The implementation uses native `fetch`, Node `crypto`, existing Next.js APIs, and the existing Supabase REST architecture.
