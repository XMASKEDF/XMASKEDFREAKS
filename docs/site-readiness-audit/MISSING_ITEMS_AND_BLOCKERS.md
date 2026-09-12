# Missing Items And Blockers

## Critical Blockers

Count: **8**

1. Missing lockfile.
2. Missing `node_modules`; dependencies are not installed.
3. Typecheck, lint, and production build are blocked.
4. Supabase schema has not been applied or verified in a live project.
5. Payment processor integration is not implemented beyond scaffold/demo validation.
6. Email/live notification delivery provider is not implemented.
7. Production OBS live-status endpoint is not configured.
8. Deployment, CI, CDN/WAF, and production env are not configured.

## High-Priority Issues

Count: **14**

1. Real admin TOTP verification is incomplete.
2. Access-control state is not fully persisted server-side.
3. Live notification API uses fixed demo audience numbers.
4. Live payment processing is not connected; current code validates canonical USD drafts only.
5. Wallet/coin purchases need server-authoritative ledger updates after processor confirmation.
6. Middleware rate limiting needs durable edge/server storage.
7. Public localization is incomplete because many UI/admin strings remain hardcoded.
8. RLS policies need review before any public browser writes.
9. Background music lacks secure upload/storage/protected URL handling.
10. Cost dashboard lacks provider API connections or manual persistence.
11. Geo dashboard needs a real geolocation provider and retention policy.
12. Referral analytics need production event ingestion and rollups.
13. Games need production leaderboard persistence and anti-abuse rules.
14. No automated test suite exists.

## External Services Still Needed

Count: **9**

1. Supabase project.
2. Payment processor.
3. Email delivery provider.
4. OBS/live status provider endpoint.
5. Video streaming provider.
6. CDN/WAF/DDoS protection.
7. AI providers for support and Claude control.
8. Exchange-rate provider.
9. Monitoring/error analytics provider.

## Top Ten Next Actions

1. Move `outputs/xmaskedfreaks-next` to the GitHub repository root.
2. Install dependencies with npm and commit `package-lock.json`.
3. Run `npm run typecheck`, `npm run lint`, and `npm run build`.
4. Convert `supabase/schema.sql` into versioned migrations or apply it to Supabase.
5. Fill production env values from `.env.example`.
6. Add real payment processor hosted checkout and signed webhooks.
7. Add real email provider with unsubscribe/suppression handling.
8. Configure OBS live-status endpoint and test `/go` live/offline behavior.
9. Put the site behind Cloudflare or another CDN/WAF.
10. Add automated tests for redirect, payment, access-control, admin auth, middleware, and notification flows.
