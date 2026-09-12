# Feature Completeness Matrix

| Feature | Code Location | Status | Launch Gap |
| --- | --- | --- | --- |
| Video-first homepage | `app/page.tsx`, `components/LiveRoom.tsx` | Built prototype | Needs production stream and device QA. |
| Theater mode | `components/LiveRoom.tsx`, `app/globals.css` | Built prototype | Needs browser/mobile visual QA. |
| 18+ compliance gate | `components/LiveRoom.tsx` | Built | Legal review recommended. |
| Footer legal links | `components/LiveRoom.tsx` | Built | Legal review recommended. |
| Localization | `lib/i18n.ts`, `public/locales/*` | Partial | Hardcoded admin/support strings remain. |
| Time-zone localization | `lib/timezone.ts` | Partial | Verify all public schedule text uses it. |
| Geo dashboard | `app/api/geo/route.ts`, `components/LiveRoom.tsx` | Prototype | Needs IP geolocation provider and privacy review. |
| Redirect manager | `app/go/route.ts`, `lib/redirect-manager.ts` | Partial | Needs OBS endpoint and Supabase log verification. |
| Referral analytics | `app/api/referrals/route.ts`, `lib/geo.ts` | Prototype | Needs production analytics persistence/rollups. |
| DDoS/security middleware | `middleware.ts`, `lib/security.ts` | Partial | Needs CDN/WAF and real rate-limit persistence. |
| Admin setup/login | `app/admin/*`, `lib/admin-auth.ts` | Partial | Needs schema/env test and true TOTP verification. |
| Unified ADMIN | `app/admin/page.tsx` | Built scaffold | Needs every switch connected to backend behavior. |
| Claude control | `app/admin/intelligence/page.tsx`, `app/api/claude/control/route.ts` | Scaffolded | Needs Claude provider key and action authorization tests. |
| Support agents | `components/SupportWidget.tsx`, `app/api/support/route.ts` | Scaffolded | Needs escalation email provider and production support queue. |
| Payments | `lib/payments/*`, hosted payment routes and migration | Partial | Neutral hosted checkout, verified-callback boundary, atomic coin credit, ADMIN, and reconciliation exist; production provider remains unselected/unconfigured. |
| Wallet/coin packages | `components/LiveRoom.tsx`, `supabase/schema.sql` | Prototype | Needs server-side ledger and payment confirmation. |
| Coin usage disclosure | `components/LiveRoom.tsx`, schema | Built prototype | Needs receipt/email integration. |
| 25-minute access rule | `app/api/access-control/route.ts`, UI | Scaffolded | Needs server-authoritative session persistence. |
| Live notifications | `app/api/live-notifications/route.ts` | Scaffolded | No email delivery; uses fixed demo estimates. |
| Background music/lobby | `components/LiveRoom.tsx` | Prototype | Needs upload/storage and protected file delivery. |
| Games/leaderboards | `components/LiveRoom.tsx`, schema | Built prototype | Needs leaderboard persistence and anti-cheat boundaries. |
| Cost dashboard | `app/api/cost-dashboard/route.ts` | Prototype | Needs provider APIs/manual entry persistence. |
| Performance engine | `components/LiveRoom.tsx` | Prototype | Needs real telemetry QA. |

## Bottom Line

The platform is strong as a clickable investor/development prototype and GitHub handoff. It is not yet a payment-ready production site.
