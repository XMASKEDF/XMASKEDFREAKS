# Supabase Verification

1. Confirm URL and keys are present without printing values.
2. Confirm the service role can reach the project health endpoint.
3. Apply migrations in staging using the approved Supabase workflow.
4. Verify Admin authentication, ADMIN role enforcement, RLS, database reads/writes, and storage buckets.
5. Verify audit events, wallet/accounting idempotency, entitlements, support cases, risk events, and realtime subscriptions where used.
6. Record migration history and a staging restore test.

Do not report production readiness until these checks return authoritative results.
