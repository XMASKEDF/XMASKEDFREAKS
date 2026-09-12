# 10 Feature Matrix

Status values: COMPLETE, PARTIAL, PLACEHOLDER, BLOCKED, MISSING, UNVERIFIED.

| Feature | Status | Files |
| --- | --- | --- |
| Next.js app shell | PARTIAL | `app/layout.tsx`, `app/page.tsx`, `next.config.mjs` |
| Public live room | PARTIAL | `components/LiveRoom.tsx`, `app/page.tsx`, `app/globals.css` |
| Sandbox mode | PARTIAL | `app/sandbox/page.tsx`, `components/LiveRoom.tsx` (ADMIN session protected) |
| Age gate | PARTIAL | `components/LiveRoom.tsx` |
| Legal footer/copy | PARTIAL | `components/LiveRoom.tsx`, `public/locales/*` |
| Theater mode | PARTIAL | `components/LiveRoom.tsx`, `app/globals.css` |
| Audio enhancement | PARTIAL | `components/LiveRoom.tsx` |
| Global reward notifications | PARTIAL | `components/GlobalRewardNotifications.tsx` |
| Wallet UI | PARTIAL | `components/LiveRoom.tsx`, `supabase/schema.sql` |
| Coin packages | PARTIAL | `lib/config.ts`, `components/LiveRoom.tsx`, `supabase/schema.sql` |
| Coin disclosure | PARTIAL | Implemented in code; production migration and end-to-end provider flow remain unverified |
| Provider-neutral hosted checkout architecture | PARTIAL | Shared checkout, normalized event boundary, inactive Segpay/CCBill placeholders, idempotent confirmation, ADMIN evidence, and automated contract tests exist; production provider integration remains unverified |
| Production payment provider | BLOCKED | Segpay/CCBill decision, approval, official docs, and credentials required |
| Server-authoritative coin package pricing | COMPLETE | `lib/config.ts`, `/api/payments/hosted` |
| 25-minute paid access | PLACEHOLDER | `app/api/access-control/route.ts`, `components/LiveRoom.tsx`, `lib/config.ts` |
| Stream provider selection | PARTIAL | `lib/config.ts`, `app/api/stream-settings/route.ts`, schema |
| OBS live detection | PARTIAL | `app/go/route.ts`, env vars |
| Redirect manager | PARTIAL | `app/go/route.ts`, `lib/redirect-manager.ts`, schema |
| Referral analytics | PARTIAL | `app/api/referrals/route.ts`, `lib/geo.ts`, schema |
| Geo dashboard | PLACEHOLDER | `app/api/geo/route.ts`, `lib/geo.ts`, schema |
| Localization | PARTIAL | `lib/i18n.ts`, `public/locales/*` |
| Time zones | PARTIAL | `lib/timezone.ts` |
| ADMIN dashboard | PARTIAL | `app/admin/page.tsx`, `app/api/admin/feature-switches/route.ts` |
| Admin setup | PARTIAL | `app/admin/setup/page.tsx`, `app/api/admin/setup/route.ts`, `lib/admin-auth.ts` |
| Admin login | COMPLETE IN CODE · PRODUCTION UNVERIFIED | `app/admin/login/page.tsx`, `app/api/admin/login/route.ts`, `lib/admin-auth.ts` |
| Admin email 2FA | COMPLETE IN CODE · PROVIDER UNVERIFIED | `app/admin/verify/page.tsx`, `app/api/admin/verify/route.ts`, `lib/admin-auth.ts` |
| Admin first-login setup | COMPLETE IN CODE · PRODUCTION UNVERIFIED | `app/admin/welcome/page.tsx`, `components/admin/FirstAdminSetup.tsx` |
| Admin password reset | COMPLETE IN CODE · PROVIDER UNVERIFIED | `app/admin/reset-password/page.tsx`, `app/api/admin/password-reset/route.ts` |
| Admin Security panel | COMPLETE IN CODE · PRODUCTION UNVERIFIED | `app/admin/security/page.tsx`, `components/admin/AdminSecurityPanel.tsx` |
| Middleware security | PARTIAL | `middleware.ts`, `lib/security.ts` |
| Moderation | PARTIAL | `components/LiveRoom.tsx`, schema |
| Customer support | PARTIAL | `components/SupportWidget.tsx`, `app/api/support/route.ts` |
| Claude control | PARTIAL | `app/admin/intelligence/page.tsx`, `app/api/claude/control/route.ts` |
| Games | PARTIAL | `components/LiveRoom.tsx`, schema |
| Leaderboards | PARTIAL | `components/LiveRoom.tsx`, schema |
| Background music | PLACEHOLDER | `components/LiveRoom.tsx`, schema |
| Cost dashboard | PLACEHOLDER | `app/api/cost-dashboard/route.ts`, `lib/config.ts` |
| Cloudflare infrastructure | MISSING | No config |
| X API integration | MISSING | Referral classification only in `lib/geo.ts` |
| Build/test pipeline | BLOCKED | `package.json`, Phase 2 log |
| CI/CD | MISSING | No workflow/config |
| Backup/restore | MISSING | No config |
| Reliability Center | COMPLETE IN CODE · PRODUCTION UNVERIFIED | `app/admin/reliability/page.tsx`, `components/admin/ReliabilityCenter.tsx`, `app/api/admin/reliability/route.ts` |
| Incident collection and grouping | COMPLETE IN CODE · DATABASE UNVERIFIED | `lib/reliability/*`, `app/api/reliability/client/route.ts`, reliability migration |
| Wallet integrity holds | COMPLETE IN CODE · DATABASE UNVERIFIED | reliability migration, `lib/reliability/health.ts` |
| Route error isolation | COMPLETE IN CODE | `components/reliability/SectionError.tsx`, route `error.tsx` files |
| Provider circuit breakers | PARTIAL | Email and Printify workers are protected; distributed persistent state is not connected |
| Backup/restore evidence | PLACEHOLDER · LAUNCH BLOCKER | Reliability schema and panel exist; provider and restore test are UNVERIFIED |
