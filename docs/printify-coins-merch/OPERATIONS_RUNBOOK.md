# Coins-Only Printify Operations Runbook

## Safe Modes

- `disabled`: public quote and background submission are blocked.
- `test`: only use with controlled ADMIN-created test data and manual Printify approval.
- `live`: permitted only after the full implementation report launch gates pass.

## Deployment Order

1. Back up Supabase.
2. Apply `20260729_printify_coins_merch_languages.sql` in staging.
3. Keep Printify mode disabled.
4. Configure server-only secrets in staging.
5. Publish desired merchandise languages.
6. Map products and variants in `ADMIN > MERCH`.
7. Verify costs and margins.
8. Configure and verify the tax adapter.
9. Register `/api/webhooks/printify` with the exact signing secret.
10. Schedule authenticated POST calls to `/api/jobs/printify`.
11. Run controlled staging orders and concurrency checks.
12. Repeat the migration and configuration review before production activation.

## Failure Behavior

- Missing mapping: checkout is blocked before wallet mutation.
- Missing tax provider: checkout is blocked before wallet mutation.
- Shipping unavailable: checkout is blocked before wallet mutation.
- Quote expired or reused: transaction rejects.
- Insufficient wallet: transaction rejects.
- Printify unavailable after purchase: local paid order remains queued/retryable; no second deduction occurs.
- Incomplete fulfillment data: job enters `manual_approval`.
- Repeated provider webhook: idempotent customer notifications and email jobs prevent duplicate communication.

## Monitoring Queries

Review:

- `printify_fulfillment_jobs` for `retry`, `failed`, or `manual_approval`.
- `commerce_fulfillment_events` for operational history.
- `commerce_orders` for negative estimated margin.
- `commerce_checkout_quotes` for high expiration or abandonment.
- `analytics_events` for quote, completion, submission, shipping, and delivery funnels.

Never place provider tokens, billing details, customer addresses, session credentials, or tax credentials in logs or analytics metadata.
