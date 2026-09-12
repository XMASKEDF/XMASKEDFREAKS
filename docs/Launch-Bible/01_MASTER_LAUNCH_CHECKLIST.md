# 01 Master Launch Checklist

Launch status: **NOT APPROVED**

Every item below is based on repository inspection. Code is trusted over README claims.

| Status | Description | Owner | Verification Method | Blocking Level | Notes |
| --- | --- | --- | --- | --- | --- |
| BLOCKED | Dependencies installed and lockfile committed | Atlas | `npm install` or approved package-manager install creates lockfile and `node_modules` | Critical | No lockfile and no `node_modules` present. Phase 2 install failed because npm registry access is blocked. |
| BLOCKED | Lint passes | Pixel | `npm run lint` | Critical | Could not execute because dependencies are missing. |
| BLOCKED | TypeScript passes | Atlas | `npm run typecheck` | Critical | Could not execute because dependencies are missing. |
| BLOCKED | Production build passes | Atlas | `npm run build` | Critical | Could not execute because dependencies are missing. |
| PARTIAL | Next.js app structure exists | Atlas | File inspection of `app/`, `components/`, `lib/` | High | App router project exists. Runtime is unverified. |
| PARTIAL | Public live room exists | Echo | Inspect `app/page.tsx`, `components/LiveRoom.tsx` | High | UI exists; real stream provider not verified. |
| PARTIAL | Sandbox visual route exists | Pixel | Inspect `app/sandbox/page.tsx` | Medium | Route renders `LiveRoom` in sandbox mode. |
| PARTIAL | ADMIN dashboard exists | Atlas | Inspect `app/admin/page.tsx` and middleware | Critical | Admin route checks session, but production auth/RLS/2FA are unverified. |
| PARTIAL | First admin setup exists | Atlas | Inspect `app/admin/setup/page.tsx`, `app/api/admin/setup/route.ts`, `lib/admin-auth.ts` | Critical | Requires `ADMIN_SETUP_SECRET`; not tested against live Supabase. |
| PARTIAL | Admin login exists | Atlas | Inspect `app/admin/login/page.tsx`, `app/api/admin/login/route.ts` | Critical | Password hash check exists; 2FA checks only code shape, not a real TOTP secret. |
| PARTIAL | Middleware security gate exists | Sage | Inspect `middleware.ts`, `lib/security.ts` | Critical | Cookie-count throttling and pattern scoring exist; durable rate limit/CDN enforcement missing. |
| BLOCKED | Stripe payments are connected | Ledger | Package/routes/env inspection | Critical | No `stripe` package, no Stripe env vars, no webhook route. |
| PARTIAL | Provider-neutral hosted checkout and inactive Segpay/CCBill adapter boundary exist | Ledger | Inspect `/api/payments/hosted`, `lib/payments/{provider,segpay,ccbill}.ts`, shared callback handler, migration, ADMIN, and reconciliation | Critical | Production provider remains disabled until Segpay/CCBill documentation, approval, signed callback rules, and credentials are supplied. |
| PARTIAL | Wallet and coin schema exists | Ledger | Inspect `supabase/schema.sql` | Critical | Tables exist; no verified server ledger or webhook processing. |
| PARTIAL | Coin usage disclosure exists | Riley | Inspect `components/LiveRoom.tsx`, `app/api/payments/route.ts`, schema | High | UI/API acknowledgement exists; receipts/emails unverified. |
| PARTIAL | 25-minute access API exists | Echo | Inspect `app/api/access-control/route.ts`, `lib/config.ts` | Critical | Uses JSON responses and request body state; not fully server-authoritative. |
| PARTIAL | Redirect manager exists | Route | Inspect `app/go/route.ts`, `lib/redirect-manager.ts` | High | OBS priority and deterministic split exist; production OBS endpoint unverified. |
| PARTIAL | Referral analytics exists | Route | Inspect `app/api/referrals/route.ts`, `lib/geo.ts`, schema | Medium | Event logging path exists; dashboards are partly static/demo. |
| PARTIAL | Geo intelligence exists | Route | Inspect `app/api/geo/route.ts`, schema | High | Hashes IP signal; no real IP geolocation provider. |
| PARTIAL | Localization exists | Maya | Inspect `lib/i18n.ts`, `public/locales/*` | Medium | Locale files exist for en/es/fr/de/pt; hardcoded strings remain. |
| PARTIAL | Time-zone helpers exist | Maya | Inspect `lib/timezone.ts` | Medium | Browser time-zone persistence exists; site-wide coverage unverified. |
| PLACEHOLDER | Live email notification API exists | Maya | Inspect `app/api/live-notifications/route.ts` | High | Uses fixed audience estimates; no provider delivery. |
| PARTIAL | AI support route exists | Maya | Inspect `components/SupportWidget.tsx`, `app/api/support/route.ts` | Medium | OpenAI call path exists; falls back to canned replies without key. |
| PARTIAL | Claude control route exists | Atlas | Inspect `app/admin/intelligence/page.tsx`, `app/api/claude/control/route.ts` | High | Admin check exists; Anthropic key and action safety unverified. |
| PARTIAL | Stream settings API exists | Echo | Inspect `app/api/stream-settings/route.ts`, `lib/config.ts` | High | Supabase-backed provider config exists; provider credentials/playback unverified. |
| PLACEHOLDER | Background music/lobby exists | Echo | Inspect `components/LiveRoom.tsx`, schema | Medium | UI/data model exists; uploads/storage/protected URLs missing. |
| PARTIAL | Global reward notification component exists | Echo | Inspect `components/GlobalRewardNotifications.tsx` | Medium | BroadcastChannel/localStorage event fanout exists; server realtime unverified. |
| PARTIAL | Games exist | Todd | Inspect `components/LiveRoom.tsx`, schema game tables | Low | Embedded games exist; persistence/leaderboard anti-abuse unverified. |
| PARTIAL | Cost dashboard API exists | Katy | Inspect `app/api/cost-dashboard/route.ts`, `lib/config.ts` | Medium | Returns config/defaults; no provider API ingestion. |
| BLOCKED | Supabase production project ready | Atlas | Apply `supabase/schema.sql` and smoke test routes | Critical | Schema file exists only. No live project verification. |
| BLOCKED | RLS reviewed and hardened | Sage | Review every policy and run access tests | Critical | Several policies allow broad `authenticated` access to admin/security/moderation/support settings. |
| MISSING | Cloudflare DNS/WAF/Turnstile/R2 configured | Sage | Cloudflare dashboard and repo config | Critical | Only Cloudflare Stream config fields exist; no Cloudflare infrastructure config. |
| MISSING | X API integration configured | Route | Developer portal app, OAuth callback, media upload route | Low | Repo only classifies X referrers; no X API code. |
| MISSING | Monitoring and alerting connected | Katy | Uptime, logs, error monitoring, alert drills | Critical | No production monitoring provider configured. |
| MISSING | Backup and restore tested | Atlas | Supabase backup restore drill and artifact restore | Critical | No backup config or restore test evidence. |
| MISSING | Rollback path tested | Atlas | Deployment rollback drill | Critical | No deployment provider config. |
