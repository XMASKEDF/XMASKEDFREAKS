# Secure ADMIN Gateway

## Delivered

- One hidden `/admin/login` gateway with server-side password verification.
- Development Super Admin backed by a bcrypt hash and HMAC session secret in ignored `.env.local`.
- No automatic development authorization bypass.
- One-time owner setup with display name, recovery email, password reminder/change, and ten single-use recovery codes.
- Optional email 2FA controlled from `/admin/security`; disabled by default.
- Six-digit codes generated with `crypto.randomInt`, bcrypt-hashed, ten-minute expiry, five-attempt limit, and one-time consumption.
- Hashed database sessions with absolute expiry, inactivity expiry, remembered-device duration, server revocation, login history, and audit events.
- Logout revokes all active sessions for the administrator.
- Password reset uses a hashed, expiring, single-use token and revokes prior sessions.
- Future role and permission definitions for Super Admin, Administrator, Inventory Manager, Customer Support, Marketing, Content Manager, and Moderator.
- `/sandbox` and its creator controls now require an authenticated administrator session.
- ADMIN metadata is `noindex`, and `/admin/setup` returns 404 after an owner exists.

## Production Activation

1. Apply `supabase/migrations/20260729_secure_admin_control_center.sql`.
2. Create the production owner through `/admin/setup` with `ADMIN_SETUP_SECRET`.
3. Configure and verify `EMAIL_API_URL`, `EMAIL_API_KEY`, and `EMAIL_FROM`.
4. Complete a staging password login, email-code verification, replay rejection, expiry test, reset test, logout-all test, and inactivity test.
5. Enable email 2FA from ADMIN Security.
6. Confirm all `ADMIN_DEV_*` variables are absent or disabled in production.

## Verified

- Typecheck: passed.
- Lint: passed with zero warnings.
- Automated tests: 124 passed, 0 failed.
- Production build: passed; 83 pages generated and style integrity passed.
- Local HTTP/browser validation: blocked in this Codex run because the sandbox denied binding `127.0.0.1:3000` with `EPERM`.
