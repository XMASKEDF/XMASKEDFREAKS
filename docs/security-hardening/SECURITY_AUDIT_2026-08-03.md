# Security Audit — 2026-08-03

## Verified strengths

- Admin passwords use bcrypt and sessions are random, hashed, expiring, inactivity-aware, and revocable.
- Password reset tokens are hashed, expiring, single-use, and revoke active Admin sessions.
- Wallet and hosted-payment fulfillment use database RPCs, row locking, immutable ledger evidence, unique references, and idempotency.
- Card data is not collected by application forms. Hosted processing remains disabled until an approved provider is configured.
- Upload validation checks authorization, size, MIME, signature, dimensions, and safe generated storage paths.
- Paid audio downloads verify the authenticated customer and entitlement before issuing access.
- Printify secrets and service-role credentials are referenced only in server code.

## Critical findings corrected

1. Maintenance changes previously accepted any `ADMIN` with a static 2FA flag and had no recent reauthentication or typed confirmation. Activation and restoration now require Super Admin, permission, recent password verification, reason, exact confirmation, server RPC, and critical audit evidence.
2. Maintenance previously had only all-or-nothing routing. Full, checkout, live, commerce, and selected-system scopes are now evaluated in middleware.
3. Public maintenance status previously returned the full settings object. It now returns an explicit safe projection without private reason, actor, or disabled-system details.
4. CSRF/origin checking was limited to Admin APIs. State-changing browser API requests now receive same-origin validation, with narrow exceptions for provider webhooks and authenticated background jobs.
5. Production browser headers were absent. Nonced CSP, frame denial, no-sniff, referrer, permissions, cross-origin, and production HSTS headers are now applied centrally.
6. Sensitive security changes, wallet adjustment, restriction restoration, and audit export lacked recent reauthentication. Server checks now enforce it.
7. Admin login redirected internal error detail to the browser. The login response is now generic.

## Open findings

| Risk | Status | Required production action |
|---|---|---|
| Distributed rate limits | PARTIAL | Configure Cloudflare rate limits/WAF. In-process endpoint limits are not a multi-region authority. |
| DDoS and origin shielding | UNVERIFIED | Proxy production traffic through Cloudflare and restrict direct origin access. |
| Supabase migration/RLS execution | UNVERIFIED | Apply migrations to staging, run cross-account RLS tests, then production. |
| Malware scanning | MISSING | Connect an approved scanner or quarantine pipeline before accepting untrusted document/audio/video uploads. |
| Image metadata stripping/re-encoding | PARTIAL | `sharp` validates images; enforce re-encoding for every public user upload path if those are enabled. |
| Backup and restore | UNVERIFIED | Obtain provider backup evidence and complete a timed staging restore. |
| Multi-instance maintenance acknowledgement | UNVERIFIED | Connect deployment/edge telemetry. Current middleware rechecks the authoritative row within two seconds. |
| CSP style policy | PARTIAL | `style-src 'unsafe-inline'` remains because the current Next.js/CSS architecture uses inline style attributes. Script policy does not allow unsafe-inline in production. |
| Dependency vulnerability feed | UNVERIFIED | Registry access was unavailable locally; enable GitHub Dependabot and CI audit review. |
| Cloud provider logs and alerts | UNVERIFIED | Configure production alerts, retention, and restricted access in hosting/Cloudflare/Supabase. |

This audit does not claim complete security. Production assurance requires provider configuration, deployment evidence, penetration testing, legal/privacy review, and repeatable restore exercises.

## Local validation status

- Type checking, linting, localization validation, and all focused security, authentication, payment, media, commerce, account, reliability, and Printify tests pass locally.
- The Next.js production compiler completes successfully under the bundled Node 24 runtime, but the build process stalls during Next.js's combined lint/type-validation worker phase and does not emit `BUILD_ID`. The standalone lint and type-check commands pass, so this remains an exact local runtime/build-worker blocker rather than a claimed successful production build.
- The existing process bound to port 3000 is outside this sandbox's process ownership and served stale build chunks after `.next` changed. A second development server also stalled during startup under local file-watcher limits. Current-source browser verification is therefore UNVERIFIED until the owning process is restarted in a clean terminal/runtime.
- The dependency registry audit is UNVERIFIED locally. Dependabot and the security CI workflow were added so registry-backed review can run in GitHub.
