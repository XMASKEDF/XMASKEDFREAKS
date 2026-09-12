# 13 Incident Response

## Standard Workflow

1. Confirm the correlation reference in `/admin/reliability`.
2. Move the incident from Detected to Investigating and assign an owner.
3. Verify customer, financial, security, and regional impact using sanitized evidence.
4. Contain only the affected feature. Keep unaffected sections available.
5. Use bounded retries or a circuit breaker only for temporary provider failures.
6. Require explicit approval for financial changes, database restore, deletion, permissions, or production deployment.
7. Monitor the repair and compare health checks.
8. Resolve with notes. Severity 4 and 5 incidents require a postmortem.

Never delete logs, invent orders, silently edit coins, credit before confirmed payment, or declare recovery from a reachable-only health check.

## Stripe Fails

Current status: Stripe is missing.

This heading is retained for historical compatibility. For the current provider-neutral system:

1. Keep `PAYMENT_PROVIDER=disabled` when callback authenticity or provider health is uncertain.
2. Do not treat customer return URLs as confirmation.
3. Preserve `hosted_payments`, immutable `hosted_payment_events`, reconciliation findings, and wallet ledger rows.
4. Run the protected reconciliation job.
5. Compare provider transaction evidence with expected amount/currency/environment before any correction.
6. Never manually credit from a screenshot, customer claim, return URL, or unverified callback.

Procedure once implemented:

1. Disable new checkout.
2. Keep existing access/wallet state read-only.
3. Stop webhook processor if duplicate credits appear.
4. Reconcile Stripe dashboard against `payment_intents`, `payment_webhook_events`, `wallet_transactions`.
5. Restore only after signed webhook and idempotency tests pass.

## Supabase Fails

1. Put site in degraded mode.
2. Disable wallet deposits, paid access unlocks, admin writes, support writes.
3. Keep static live page if safe.
4. Check Supabase status and connection env.
5. Restore from verified backup only if data corruption confirmed.

## Cloudflare Fails

Current status: Cloudflare infrastructure is missing.

Procedure once implemented:

1. Verify DNS and SSL.
2. Disable risky cache rules.
3. Enable stricter WAF/bot mode during attack.
4. Bypass only if origin can absorb traffic.

## DNS Fails

1. Check registrar nameservers.
2. Check Cloudflare DNS records.
3. Roll back to last known valid DNS record.
4. Confirm SSL and origin reachability.

## Wallet Or Coins Fail

1. Keep the automatic wallet integrity hold active for affected users.
2. Preserve wallet, ledger, order, payment, and webhook evidence.
3. Reconcile processor events against the signed wallet ledger in chronological order.
4. Identify missing or duplicated idempotency keys and verify every `balance_after`.
5. Restore only through an approved auditable correction record.
6. Release the hold only after documented verification.

Known pre-launch risk: painting purchases currently deduct coins without a `wallet_transactions` row. This must be repaired and reconciled before production wallet launch.

## Login Fails

1. Keep public content safe.
2. Disable admin changes if admin auth is unstable.
3. Verify Supabase and custom admin sessions.
4. Confirm cookie domain/secure flags.
5. Restore admin only after audit logging works.

## Uploads Fail

Current status: upload system is missing.

Once implemented:

1. Disable new uploads.
2. Keep existing approved media read-only.
3. Verify storage permissions and malware scanning.

## Payments Fail

Same as Stripe/wallet response. Disable checkout and reconcile before restoring.

## Production Crashes

1. Roll back deployment.
2. Check build artifact and env.
3. Check Supabase connectivity.
4. Check CDN cache and middleware.
5. Publish incident note internally.
