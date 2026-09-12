# 09 Security Bible

## Reliability Security Controls

- `/admin/reliability` and `/api/admin/reliability` require a valid server-side administrator session and `admin.operations.manage`.
- Unauthorized API requests return 404 to avoid advertising protected controls.
- Public browser reports accept only approved feature names and local routes, are rate-limited by a salted IP hash, and do not accept user, order, payment, or wallet identifiers.
- Passwords, authorization values, bearer credentials, API keys, card-like numbers, cookies, tokens, and local filesystem paths are redacted before storage.
- Public health output does not expose provider configuration, database connectivity, internal routes, or credentials.
- Financial mismatch recovery is fail-closed: spending is held and records are preserved. No automatic balance mutation exists.
- High-risk recovery operations are deliberately absent from the admin API.
- Runtime circuit reset requires explicit confirmation and produces an admin audit event.

Production status: code verified locally; migration, external alert delivery, WAF behavior, and production penetration testing are **UNVERIFIED**.

Status: **NOT PRODUCTION APPROVED**

## Security Controls Present

| Control | Evidence | Status |
| --- | --- | --- |
| Middleware pre-app gate | `middleware.ts`, `lib/security.ts` | PARTIAL |
| Bot/user-agent scoring | `lib/security.ts` | PARTIAL |
| Suspicious path patterns | `lib/security.ts` | PARTIAL |
| Admin setup secret | `lib/admin-auth.ts` | PARTIAL |
| bcrypt password hashing | `lib/admin-auth.ts` | PARTIAL |
| Hashed admin sessions | `lib/admin-auth.ts` | PARTIAL |
| Development admin authentication | `lib/admin-dev-bypass.ts`, ignored `.env.local` | VERIFIED LOCALLY |
| Revocable sessions and inactivity expiry | `lib/admin-auth.ts`, `20260729_secure_admin_control_center.sql` | VERIFIED IN CODE |
| Email 2FA challenges | `lib/admin-auth.ts`, `app/api/admin/verify/route.ts` | IMPLEMENTED · PROVIDER UNVERIFIED |
| First-login security setup and recovery codes | `app/admin/welcome/page.tsx`, `app/api/admin/first-setup/route.ts` | VERIFIED LOCALLY |
| Password-reset token hashing and session revocation | `app/api/admin/password-reset/route.ts`, `lib/admin-auth.ts` | IMPLEMENTED · PROVIDER UNVERIFIED |
| Admin route redirect | `middleware.ts`, `app/admin/page.tsx` | PARTIAL |
| Feature switch admin API checks | `app/api/admin/feature-switches/route.ts` | PARTIAL |
| Payment raw-card warning | `app/api/payments/route.ts` | PLACEHOLDER |

## Vulnerabilities Discovered

| Vulnerability | Evidence | Severity | Required Fix |
| --- | --- | --- | --- |
| Dependencies not installed; build unverified | Phase 2 log | Critical | Install dependencies and pass lint/typecheck/build. |
| No Stripe/webhook verification | No Stripe package/routes/env | Critical | Implement signed webhooks before money launch. |
| Email 2FA provider and production migration are not connected | `lib/admin-auth.ts`, `20260729_secure_admin_control_center.sql` | High | Apply migration and verify email delivery in staging before enabling the toggle. |
| Broad RLS policies expose sensitive admin/security data to authenticated users | `supabase/schema.sql` admin/security policies | Critical | Replace with ADMIN role checks. |
| Access control is not server-authoritative | `app/api/access-control/route.ts` uses request body state and returns JSON | Critical | Persist sessions and verify payment server-side. |
| Middleware rate limits are cookie-based | `middleware.ts` request count cookie | High | Add durable edge/store rate limits. |
| Payment endpoint does not call processor | `app/api/payments/route.ts` | Critical | Add hosted checkout/PaymentIntent integration. |
| Live payment processor missing | `lib/payments/provider.ts` | Critical | Implement the selected provider’s official hosted checkout and signed callback contract before launch. |

## Hosted Payment Boundary

- The legacy `/api/payments` route is permanently disabled with HTTP 410.
- `LiveRoom` contains no card-entry or simulated saved-card controls.
- Card details belong exclusively to a future processor-hosted page.
- A customer return page cannot grant coins.
- Only an authenticated provider callback may invoke the service-role atomic confirmation RPC.
- Callback events are unique by provider/event ID and immutable.
- Payment-to-ledger linkage is unique, preventing a second wallet credit.
- Mismatched amount, currency, environment, provider, or purpose fails into reconciliation review.
- Segpay and CCBill remain disabled until their official verification rules are implemented.
| Admin password reset delivery is unverified | `app/api/admin/password-reset/route.ts`, `lib/email/provider.ts` | High | Configure and test the approved email provider in staging. |
| Support escalation endpoint optional | `app/api/support/route.ts` | Medium | Configure provider. |
| LocalStorage stores age/access/device/moderation markers | `components/LiveRoom.tsx` | Medium | Treat as convenience only; enforce server-side. |
| Hardcoded owner code and emails | `lib/config.ts`, support route fallback | High | Move sensitive/admin settings server-side. |
| No CSP/security headers config | `next.config.mjs` only strict mode | High | Add headers and CSP. |
| No upload validation pipeline | No upload routes/storage buckets | High | Add storage validation before uploads. |
| No backup/restore evidence | Repo inspection | Critical | Configure and drill backups. |

## Injection/XSS/CSRF Notes

- SQL injection risk is partly reduced by Supabase client/REST usage, but REST path query construction in `lib/admin-auth.ts` must be reviewed for encoded identifiers.
- XSS protection is UNVERIFIED because CSP is missing.
- CSRF protection is UNVERIFIED for form POST admin routes. SameSite cookies help but are not a full policy.
- Webhook validation is MISSING.

## Security Launch Gate

Launch cannot proceed until Critical vulnerabilities are fixed and re-tested.

## 2026-07-29 Admin Gateway Repair

- Removed the development-wide authorization bypass. `ADMIN_DEV_BYPASS=true` now fails closed.
- Added a development-only bcrypt credential and HMAC-signed session path. The actual hash and secrets live only in ignored `.env.local`.
- Added absolute session expiry, inactivity expiry, device hashing, server revocation, failed-login lockout, login history, and audit events.
- Added a staged email-code flow with cryptographically generated six-digit codes, bcrypt hashes, ten-minute expiry, five-attempt limit, and single-use consumption.
- Added a first-login profile/recovery setup and ten one-time recovery codes stored only as bcrypt hashes.
- Added a Super Admin permission foundation for future independent roles.
- Protected `/sandbox` with the same administrator session check.
- Added `noindex` metadata to the complete ADMIN tree and removed the locked setup page after an admin exists.
- Production activation remains **UNVERIFIED** until the migration is applied and the email provider is tested.
# 2026-08-03 Hardening Addendum

The current security dependency map, verified controls, corrected findings, and unresolved production risks are maintained in `docs/security-hardening/`. Emergency maintenance is now Super-Admin-only, recent-reauthenticated, scoped, server-stored, health-gated on restoration, and append-only audited. Production Cloudflare enforcement, deployed RLS verification, malware scanning, backup restore evidence, and multi-instance propagation telemetry remain **UNVERIFIED**.
