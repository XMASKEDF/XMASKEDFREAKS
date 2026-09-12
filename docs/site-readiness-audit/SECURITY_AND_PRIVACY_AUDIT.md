# Security And Privacy Audit

Status: **PARTIAL, NEEDS HARDENING**

## Good Security Direction Already Present

- Server-only admin setup secret.
- Admin password hashing with bcryptjs.
- Admin session token hashing before storage.
- Admin login lockout after repeated failed attempts.
- Middleware request scoring before app logic.
- Service-role key usage is server-side in static scan.
- Payment route explicitly forbids raw card/CVV storage.
- Geo route hashes IP signals instead of showing raw IP by default.
- ADMIN pages check for admin session cookie and server-side session lookup.
- Audit tables exist for admin, security, access, coin policy, and intelligence events.

## High-Risk Gaps

1. No real TOTP verification exists yet; admin login only validates code shape.
2. No production payment processor integration or webhook signature verification exists.
3. Access-control unlock is not yet fully server-authoritative/persistent.
4. Middleware rate limiting uses request cookies; production abuse protection needs durable store/CDN edge enforcement.
5. No CDN/WAF provider is configured in repo.
6. RLS policies were not verified against client-side writes.
7. Hardcoded fallback email and demo payment references remain in source.
8. No CI secret scanning or dependency audit can run without lockfile.
9. No privacy/legal review has been completed for adult content, geo analytics, wallet/coins, and marketing email.

## Privacy Notes

- Do not expose raw IP addresses in normal admin screens.
- Use IP only as supporting security/anti-abuse signal.
- Document age gate consent, adult content disclosure, refund policy, coin policy, marketing email consent, and data retention.
- Add data deletion/export process before public launch if required by applicable law.

## Required Hardening Before Launch

1. Add real TOTP setup/verification for admins.
2. Enforce admin route/API checks on every privileged API.
3. Add provider-backed WAF/rate limiting.
4. Verify Supabase RLS on all public tables.
5. Add real payment processor hosted fields and signed webhooks.
6. Add idempotency tables and tests for money flows.
7. Add security headers, CSP, and production cookie/domain settings.
8. Run dependency audit after lockfile generation.

