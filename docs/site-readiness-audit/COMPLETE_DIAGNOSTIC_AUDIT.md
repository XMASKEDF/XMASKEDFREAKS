# XMASKEDFREAKS Complete Diagnostic Audit

Audit date: 2026-07-19  
Repository inspected: `/Users/calebyoung/Documents/Codex/2026-07-08/i/outputs/xmaskedfreaks-next`  
Audit mode: read-only diagnostic; no application, database, pricing, or production-data changes were made.

## A. Executive Summary

The application compiles, has a coherent black/white/green visual system, and has meaningful automated coverage for games, recovery, FAQ, tips, media, background resizing, the audio store, purchase flow, and i18n. Type checking and linting pass. A repeat clean production build generated all 49 routes successfully. Cached browser sessions showed no console errors on the public and audio-store pages, and the public layout did not overflow at seven representative widths.

The application is **development only** and is **not safe to deploy publicly**. Production-critical controls are either missing, mock implementations, client-authoritative, or incorrectly authorized. The most serious defects are broad Supabase RLS policies that grant ordinary authenticated users access to admin/security/payment records, fake administrator 2FA verification, a bypassable paid-access timer, an unauthenticated stream-settings mutation endpoint, and migrations that cannot reliably bootstrap an empty database. Real payment processing, live notification delivery, provider-backed geo intelligence, production rate limiting, monitoring, backups, and deployment configuration are not connected.

Status summary:

| Area | Status | Evidence |
| --- | --- | --- |
| TypeScript | PASS | `pnpm run typecheck` |
| ESLint | PASS | `pnpm run lint`, zero warnings |
| Automated tests | PASS | 67/67 tests across nine suites |
| Production build | UNSTABLE | First clean build failed; repeat clean build passed 49 routes |
| Public visual shell | PARTIAL PASS | Cached browser session, no console errors; responsive root at 320-1440px |
| Payments | PLACEHOLDER | Draft response only; no processor confirmation/webhook |
| Database bootstrap | BLOCKED | Migration dependency order is invalid |
| Admin security | BLOCKED | RLS exposure and non-verifying 2FA |
| Paid access | BLOCKED | Client-controlled expiry/payment assertion |
| Deployment operations | MISSING | No provider config, health endpoint, monitoring, or verified rollback |

## B. Current Application Status

### Repository and toolchain

- Git branch: **UNVERIFIED**. No `.git` metadata exists in the application or inspected parent directories.
- Git commit: **UNVERIFIED** for the same reason.
- Uncommitted files: **UNVERIFIED**; there is no Git worktree to compare.
- Package manager: pnpm, indicated by `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and package scripts.
- Node: `v26.5.0`.
- npm: `12.0.1`.
- pnpm: `11.12.0`.
- Next.js resolved version: `14.2.35`.
- React / React DOM: `18.3.1` / `18.3.1`.
- Database and storage provider: Supabase is implemented in code, but no local credentials are configured and remote state is **UNVERIFIED**.
- Deployment provider: **UNVERIFIED / not configured in the repository**. No Vercel, Cloudflare Workers/Pages, Netlify, Fly, Docker, or equivalent deployment file was found.
- Dependency audit: **UNVERIFIED**. Registry access was unavailable; `pnpm audit` could not reach the registry.
- `npm ls next react react-dom`: failed with npm peer-layout errors against the pnpm installation. The resolved application dependency tree and build use one React 18.3.1 version; duplicate React was not confirmed.
- `pnpm list`: failed because pnpm could not open its local SQLite metadata database. This did not prevent scripts or builds.

### Environment status

No local `.env` file was present. All environment-backed integrations are therefore unconfigured in this audit environment. Referenced variables include:

`ADMIN_SETUP_SECRET`, `ADMIN_SUPPORT_EMAIL`, `ANTHROPIC_API_KEY`, `CLAUDE_API_KEY`, `CLAUDE_CONTROL_MODEL`, `CLIPS4SALE_URL`, `DEPOSIT_ALERT_EMAIL`, `FANSLY_URL`, `GAME_ERROR_LOG_SALT`, `GEO_IP_HASH_SALT`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NOTIFICATION_SANDBOX_STREAM_ACTIVE`, `OBS_LIVE`, `OBS_STATUS_ENDPOINT`, `OBS_STREAM_ACTIVE`, `OPENAI_API_KEY`, `OPENAI_SUPPORT_MODEL`, `PAYMENT_RISK_THRESHOLD`, `PAYMENT_STEP_UP_AMOUNT`, `REDIRECT_CLIPS_PERCENT`, `REDIRECT_MANUAL_DESTINATION`, `REDIRECT_OFFLINE_BLOCKS`, `SECURITY_BLACKLIST_COUNTRIES`, `SECURITY_BLACKLIST_IPS`, `SECURITY_BLACKLIST_USER_AGENTS`, `SECURITY_WHITELIST_IPS`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPPORT_ESCALATION_ENDPOINT`.

`GAME_ERROR_LOG_SALT` is referenced but absent from `.env.example`. `NEXT_PUBLIC_SITE_URL` and `REDIRECT_OVERRIDE_URL` are documented but no current code reference was found.

## C. Critical Problems

### XMF-001

ISSUE ID: XMF-001  
SEVERITY: Critical  
TITLE: Supabase RLS grants normal authenticated users admin and security access  
AFFECTED AREA: Database, Admin, Payments, Security, Moderation  
FILE: `supabase/schema.sql`  
LINE: 1704-1762, 1788-1819, 1858-1929, 1980-2008  
ERROR: Policies named for administrators use `to authenticated` with `using (true)` / `with check (true)`.  
REPRODUCTION: Apply the schema, sign in as any standard Supabase user, then query `admin_users`, `admin_sessions`, `admin_audit_events`, `security_rules`, `moderation_bans`, or update payment settings through Supabase REST. The policy permits it.  
ROOT CAUSE: The schema equates Supabase's `authenticated` role with the application's `ADMIN` role.  
USER IMPACT: A normal account can read sensitive operational data and change security, moderation, payment, music, and deposit settings.  
FINANCIAL/SECURITY IMPACT: Password hashes, session metadata, audit data, payment settings, bans, and security rules are exposed or mutable.  
RECOMMENDED FIX: Add a server-verifiable admin claim or `security definer` `is_admin()` predicate, remove all broad authenticated policies, deny direct client access to admin tables, and add policy tests for anonymous/user/admin roles. Rotate credentials and sessions if this schema has ever been deployed.  
BLOCKS PRODUCTION: Yes  
CONFIDENCE: High

### XMF-002

ISSUE ID: XMF-002  
SEVERITY: Critical  
TITLE: Administrator 2FA accepts any six-to-eight digit string  
AFFECTED AREA: Admin authentication  
FILE: `lib/admin-auth.ts`  
LINE: 147-187, especially 176-179  
ERROR: The login verifies only `/^\d{6,8}$/`; no TOTP secret or authenticator algorithm is checked.  
REPRODUCTION: Submit a correct admin password and any six digits. The 2FA branch accepts the value.  
ROOT CAUSE: The UI requirement was implemented as format validation rather than cryptographic verification.  
USER IMPACT: The mandatory administrator second factor provides no security.  
FINANCIAL/SECURITY IMPACT: Compromised passwords can expose all admin, payment, user, and moderation controls.  
RECOMMENDED FIX: Enroll TOTP secrets securely, verify codes server-side with drift/replay protection, persist MFA assurance on each admin session, and add recovery-code and lockout tests.  
BLOCKS PRODUCTION: Yes  
CONFIDENCE: High

### XMF-003

ISSUE ID: XMF-003  
SEVERITY: Critical  
TITLE: The 25-minute paid-access rule is client-authoritative and bypassable  
AFFECTED AREA: Live access control, payments  
FILE: `app/api/access-control/route.ts`; `components/LiveRoom.tsx`  
LINE: API 17-90; client timer/unlock logic around 755-762 and 1092-1109  
ERROR: The API accepts client-provided `expiresAt`, amount, session ID, user ID, and transaction reference, and returns an unlock without processor verification or persistent server state.  
REPRODUCTION: POST `action=unlock` with `amount=2`, or POST `action=status` with a future `expiresAt`; no valid payment or authenticated session is required.  
ROOT CAUSE: The endpoint is a response simulator rather than a server-authoritative entitlement service.  
USER IMPACT: Visitors can continue protected viewing without payment and can reset state by manipulating browser/API data.  
FINANCIAL/SECURITY IMPACT: Direct revenue loss and unverifiable access records.  
RECOMMENDED FIX: Store access grants server-side, bind them to authenticated user/session records, extend only from verified idempotent payment webhooks or an atomic wallet debit, and authorize the stream manifest/segment path rather than only blurring the DOM.  
BLOCKS PRODUCTION: Yes  
CONFIDENCE: High

### XMF-004

ISSUE ID: XMF-004  
SEVERITY: Critical  
TITLE: Stream provider settings can be changed without administrator authentication  
AFFECTED AREA: Live stream, Admin API  
FILE: `app/api/stream-settings/route.ts`  
LINE: 52-67  
ERROR: `POST` uses the Supabase service role to upsert configuration but performs no admin session or role check.  
REPRODUCTION: Send a public POST to `/api/stream-settings` with replacement provider IDs or a fallback URL.  
ROOT CAUSE: A privileged service client is exposed behind an unauthenticated route.  
USER IMPACT: An attacker can redirect, disable, or replace the live stream.  
FINANCIAL/SECURITY IMPACT: Content substitution, outage, phishing, and lost tips.  
RECOMMENDED FIX: Require a verified ADMIN session with MFA assurance, validate provider-specific fields and origins, apply CSRF protection/rate limits, and audit every change.  
BLOCKS PRODUCTION: Yes  
CONFIDENCE: High

### XMF-005

ISSUE ID: XMF-005  
SEVERITY: Critical  
TITLE: Migration order cannot bootstrap a new database  
AFFECTED AREA: Supabase database and deployment  
FILE: `supabase/migrations/20260719_*.sql`  
LINE: Multiple files; first statements in `activate_matrix_slim_global`, `admin_media_library`, `audio_clips_store`, and `games_recovery_logs`  
ERROR: Same-date filenames sort alphabetically. Early files update/alter/reference `site_background_settings`, `admin_users`, `tip_options`, `token_wallets`, and `game_issue_reports` before migrations create them.  
REPRODUCTION: Apply the migration directory in lexical order to an empty Supabase project. The first migration updates a table that does not exist.  
ROOT CAUSE: Migrations were added as feature patches without a valid ordered baseline. `supabase/schema.sql` is not itself a migration.  
USER IMPACT: Staging or production provisioning fails and schema drift becomes likely.  
FINANCIAL/SECURITY IMPACT: Deployment outage and risk of applying partial financial schemas.  
RECOMMENDED FIX: Create an ordered, immutable baseline migration followed by dependency-safe incremental migrations; validate with a fresh local Supabase reset and schema-diff check before touching production.  
BLOCKS PRODUCTION: Yes  
CONFIDENCE: High

### XMF-006

ISSUE ID: XMF-006  
SEVERITY: Critical  
TITLE: Production payments are not connected to a payment processor  
AFFECTED AREA: Payments, wallet deposits, coin purchases, paid access  
FILE: `app/api/payments/route.ts`  
LINE: 20-126  
ERROR: The route builds and returns a payment draft with `requires_processor_confirmation`; it creates no processor intent, hosted fields, webhook, vault customer, or live credit.  
REPRODUCTION: Call the production route with a valid package. It returns a draft; only non-production `testMode` can credit a wallet.  
ROOT CAUSE: The API is an integration contract/scaffold, not an implemented processor workflow.  
USER IMPACT: Visitors cannot complete real deposits or coin purchases.  
FINANCIAL/SECURITY IMPACT: No real revenue path; client-provided risk score and token identifiers must not be trusted if a processor is later attached.  
RECOMMENDED FIX: Select the approved processor, implement hosted/tokenized checkout, signed webhooks, server-derived risk inputs, idempotent ledger credits, reconciliation, refunds/chargebacks, and end-to-end test/live certification.  
BLOCKS PRODUCTION: Yes  
CONFIDENCE: High

## D. High-Priority Problems

### XMF-007

ISSUE ID: XMF-007  
SEVERITY: High  
TITLE: Moderation enforcement is bypassable and partly browser-only  
AFFECTED AREA: Live chat, account safety  
FILE: `components/LiveRoom.tsx`; `supabase/schema.sql`  
LINE: 1941-2031; schema 1898-1923  
ERROR: Detection and ban state live in React/localStorage; direct Supabase policies let any authenticated user manage moderation records.  
REPRODUCTION: Clear `xmf-moderation-ban` or bypass the UI; alternatively mutate moderation rows as a regular authenticated user under the current policy.  
ROOT CAUSE: Enforcement is not performed before message broadcast or session authorization on a trusted server.  
USER IMPACT: Banned users can return; legitimate bans and rules can be altered.  
FINANCIAL/SECURITY IMPACT: Abuse, harassment, and account-safety exposure.  
RECOMMENDED FIX: Moderate server-side before publish, keep authoritative bans in protected storage, revoke sessions, use privacy-conscious device/IP signals only as supporting evidence, and fix RLS.  
BLOCKS PRODUCTION: Yes  
CONFIDENCE: High

### XMF-008

ISSUE ID: XMF-008  
SEVERITY: High  
TITLE: Admin logout does not revoke the server session  
AFFECTED AREA: Admin authentication  
FILE: `app/api/admin/logout/route.ts`  
LINE: 5-19  
ERROR: Logout clears the browser cookie but never marks the matching `admin_sessions` row revoked.  
REPRODUCTION: Copy a valid token, log out, then reuse the copied token before its 12-hour expiry.  
ROOT CAUSE: The route does not hash the presented token and update `revoked_at`.  
USER IMPACT: A stolen or copied session remains active after logout.  
FINANCIAL/SECURITY IMPACT: Persistent unauthorized admin access.  
RECOMMENDED FIX: Revoke the exact session transactionally before clearing the cookie and support revoke-all-sessions on credential/MFA changes.  
BLOCKS PRODUCTION: Yes  
CONFIDENCE: High

### XMF-009

ISSUE ID: XMF-009  
SEVERITY: High  
TITLE: Application rate limiting is controlled by a client cookie  
AFFECTED AREA: Middleware, authentication, APIs, DDoS/abuse protection  
FILE: `middleware.ts`  
LINE: Request scoring and `xmf_req_count` handling in the middleware request path  
ERROR: The request count is supplied and reset by the client; the throttle response is informational and does not provide shared edge enforcement.  
REPRODUCTION: Clear or edit the count cookie between requests. Requests start from a fresh allowance.  
ROOT CAUSE: Rate state is not held in a trusted shared store/CDN rule.  
USER IMPACT: Login, AI, analytics, and API routes remain susceptible to automated abuse.  
FINANCIAL/SECURITY IMPACT: Availability risk and avoidable AI/database/provider costs.  
RECOMMENDED FIX: Enforce limits at Cloudflare/CDN and in a shared server-side store keyed by privacy-safe signals; add endpoint-specific quotas and real 429 blocking.  
BLOCKS PRODUCTION: Yes  
CONFIDENCE: High

### XMF-010

ISSUE ID: XMF-010  
SEVERITY: High  
TITLE: AI support endpoint is unauthenticated and unbounded  
AFFECTED AREA: Maya/customer support API  
FILE: `app/api/support/route.ts`  
LINE: 215-271  
ERROR: Any caller can send unrestricted message/history payloads that invoke the configured AI provider; there is no route-specific quota or request-size limit.  
REPRODUCTION: Repeatedly POST large histories to `/api/support` without authentication.  
ROOT CAUSE: Visitor convenience was implemented without trusted usage controls.  
USER IMPACT: Support can become slow or unavailable.  
FINANCIAL/SECURITY IMPACT: AI cost amplification and storage spam.  
RECOMMENDED FIX: Add body/schema limits, per-session/IP quotas, history truncation, abuse detection, budget circuit breakers, and authenticated escalation metadata.  
BLOCKS PRODUCTION: Yes  
CONFIDENCE: High

### XMF-011

ISSUE ID: XMF-011  
SEVERITY: High  
TITLE: Referral and conversion analytics accept untrusted financial data  
AFFECTED AREA: Referral analytics  
FILE: `app/api/referrals/route.ts`  
LINE: 21-49  
ERROR: The client supplies source, clicks, conversion, revenue, duration, bounce state, and metadata; the service role stores them without authentication or trusted event verification.  
REPRODUCTION: POST arbitrary revenue/conversion values to `/api/referrals`.  
ROOT CAUSE: Browser analytics data is treated as authoritative business data.  
USER IMPACT: Admin reports cannot be trusted.  
FINANCIAL/SECURITY IMPACT: Campaign and revenue decisions can be manipulated.  
RECOMMENDED FIX: Separate untrusted visit telemetry from verified conversions, derive revenue only from server payment/order events, validate campaign IDs, and rate limit ingestion.  
BLOCKS PRODUCTION: Yes for analytics-driven financial decisions  
CONFIDENCE: High

### XMF-012

ISSUE ID: XMF-012  
SEVERITY: High  
TITLE: Large media upload path buffers entire files in server memory  
AFFECTED AREA: Admin audio/video upload and storage  
FILE: `lib/audio-store/validation.ts`; `app/api/admin/audio-clips/route.ts`  
LINE: validation 31-40; admin route 75-90  
ERROR: Up to 250 MB is accepted, then `file.arrayBuffer()` loads the entire object before uploading through the Next server.  
REPRODUCTION: Upload a long 250 MB MP4 through the admin form on a memory/time-limited serverless host.  
ROOT CAUSE: No direct-to-storage, chunked, resumable upload architecture exists.  
USER IMPACT: Large uploads can timeout, exhaust memory, or fail after long waits.  
FINANCIAL/SECURITY IMPACT: Availability and storage-operational risk; oversized-request abuse surface.  
RECOMMENDED FIX: Use authenticated signed direct uploads or multipart storage uploads, stream signature validation, resumability, progress/retry, processing jobs, and abandoned-upload cleanup. Set limits from verified hosting/storage constraints.  
BLOCKS PRODUCTION: Yes for promised large-media support  
CONFIDENCE: High

### XMF-013

ISSUE ID: XMF-013  
SEVERITY: High  
TITLE: Public live notifications endpoint is unauthenticated and simulated  
AFFECTED AREA: Email/live notifications  
FILE: `app/api/live-notifications/route.ts`  
LINE: 17-52  
ERROR: Any caller can request a campaign when the environment flag is true, while the response returns hard-coded audience figures and `savedToHistory: false`; no email is sent.  
REPRODUCTION: Set the sandbox/live flag and POST without an admin session.  
ROOT CAUSE: A UI prototype was exposed as an API contract without authorization or delivery integration.  
USER IMPACT: Live alerts do not reach users; future connection could become an email-abuse endpoint.  
FINANCIAL/SECURITY IMPACT: Reputation, consent, and provider-cost risk.  
RECOMMENDED FIX: Protect with admin MFA authorization, implement verified OBS session identity/cooldown, consent filtering, provider delivery, unsubscribe, idempotency, and immutable campaign logs.  
BLOCKS PRODUCTION: Yes for live-alert claims  
CONFIDENCE: High

### XMF-014

ISSUE ID: XMF-014  
SEVERITY: High  
TITLE: Geo and cost dashboards return mock/static data rather than measured systems  
AFFECTED AREA: Geo intelligence, cost dashboard  
FILE: `app/api/geo/route.ts`; `app/api/cost-dashboard/route.ts`  
LINE: geo 31-60; cost 4-26  
ERROR: Geo returns `stored:false` and accepts client location hints; cost uses static `defaultCostProviders` and is publicly readable.  
REPRODUCTION: Call both routes without credentials or provider APIs. Responses are generated without measured infrastructure data.  
ROOT CAUSE: Dashboard UI was built before provider ingestion, persistence, and finance authorization.  
USER IMPACT: Administrators can mistake estimates for operational truth.  
FINANCIAL/SECURITY IMPACT: Incorrect budgeting; public exposure of internal cost assumptions.  
RECOMMENDED FIX: Label estimates explicitly, protect finance data, connect provider APIs through server-only adapters, persist timestamped measurements, and retain privacy-safe geo aggregation.  
BLOCKS PRODUCTION: No for the public site; yes for claiming operational intelligence  
CONFIDENCE: High

### XMF-015

ISSUE ID: XMF-015  
SEVERITY: High  
TITLE: Fixed-screen game scores are forgeable  
AFFECTED AREA: Games and public leaderboards  
FILE: `app/api/games/scores/route.ts`  
LINE: 10-47  
ERROR: The endpoint accepts unauthenticated client score/session values and writes them with the Supabase service role. In-memory dedupe and limits reset per process.  
REPRODUCTION: POST an arbitrary score up to 10,000,000 with a new session ID.  
ROOT CAUSE: No signed game session, authenticated identity, replay-proof server validation, or durable rate store exists.  
USER IMPACT: Public high scores lose credibility.  
FINANCIAL/SECURITY IMPACT: Low direct financial impact; integrity and abuse risk.  
RECOMMENDED FIX: Issue signed short-lived game sessions, bind authenticated users, validate score envelopes/events, use durable idempotency and quotas, and flag anomalous results.  
BLOCKS PRODUCTION: Yes for public competitive leaderboards  
CONFIDENCE: High

### XMF-016

ISSUE ID: XMF-016  
SEVERITY: High  
TITLE: No production security headers were found  
AFFECTED AREA: Entire application  
FILE: Repository configuration / `middleware.ts`  
LINE: N/A  
ERROR: No Content-Security-Policy, frame-ancestors/X-Frame-Options, HSTS, Referrer-Policy, Permissions-Policy, or related production header configuration was found.  
REPRODUCTION: Inspect repository headers configuration; none exists. Live response verification was unavailable after the server could not bind in the managed environment.  
ROOT CAUSE: Security middleware focuses on scoring rather than browser security policy.  
USER IMPACT: Reduced protection from framing, injection impact, referrer leakage, and unsafe browser capabilities.  
FINANCIAL/SECURITY IMPACT: Elevated account and payment-page attack impact.  
RECOMMENDED FIX: Add tested headers in Next config/CDN, begin CSP in report-only mode, enumerate media/payment/stream origins, and verify all routes.  
BLOCKS PRODUCTION: Yes for payment/admin launch  
CONFIDENCE: Medium-high

### XMF-017

ISSUE ID: XMF-017  
SEVERITY: High  
TITLE: No deployment, health, monitoring, backup, or rollback implementation is present  
AFFECTED AREA: Production operations  
FILE: Repository root and deployment configuration  
LINE: N/A  
ERROR: No provider deployment file, health endpoint, error-monitoring instrumentation, uptime configuration, verified backup job, or executable rollback path was found.  
REPRODUCTION: Inventory repository deployment/health/monitoring files; none are present. Existing Launch Bible text is documentation, not executable infrastructure.  
ROOT CAUSE: Product UI development is ahead of production operations.  
USER IMPACT: Failures may go undetected and recovery time is unknown.  
FINANCIAL/SECURITY IMPACT: Outage, data-loss, and incident-response risk.  
RECOMMENDED FIX: Select a deployment target, define staging/production environments, add health/readiness endpoints, monitoring/alerts, database/storage backups, restore drill, migrations gate, and tested rollback.  
BLOCKS PRODUCTION: Yes  
CONFIDENCE: High

## E. Medium-Priority Problems

### XMF-018

ISSUE ID: XMF-018  
SEVERITY: Medium  
TITLE: Localization coverage check permits 908 hard-coded legacy strings  
AFFECTED AREA: Public, Admin, storefront, errors  
FILE: `docs/i18n/hardcoded-baseline.json` and multiple components, notably `components/LiveRoom.tsx`  
LINE: Multiple; examples 2212-2218 and 2288-2296  
ERROR: `check:i18n` passes by accepting a baseline of 908 candidates. Cached Arabic UI still displayed English stream, form, package, game, and FAQ text.  
REPRODUCTION: Select Arabic and inspect the cached public route; multiple visible strings remain English.  
ROOT CAUSE: The checker prevents regression above a large baseline but does not establish complete translation coverage.  
USER IMPACT: Mixed-language experience and incomplete RTL localization.  
FINANCIAL/SECURITY IMPACT: Purchase/support misunderstandings; compliance copy may not be understood.  
RECOMMENDED FIX: Migrate visible copy by route into translation files, prioritize payment/policy/errors, and reduce the baseline to zero with locale snapshot tests.  
BLOCKS PRODUCTION: Yes for multilingual launch claims  
CONFIDENCE: High

### XMF-019

ISSUE ID: XMF-019  
SEVERITY: Medium  
TITLE: ADMIN is visibly linked from the public header  
AFFECTED AREA: Public navigation  
FILE: `components/LiveRoom.tsx`  
LINE: 2146-2155  
ERROR: `<a href="/admin">Admin</a>` is rendered for ordinary visitors.  
REPRODUCTION: Open the public page and inspect the header.  
ROOT CAUSE: Admin navigation is not conditioned on a verified server role.  
USER IMPACT: Clutter and discoverability of a sensitive surface; protected pages still redirect when no session exists.  
FINANCIAL/SECURITY IMPACT: Increases targeted probing but is not authorization by itself.  
RECOMMENDED FIX: Render admin navigation only from server-verified admin session state; retain server protection regardless of visibility.  
BLOCKS PRODUCTION: No if all admin authorization is repaired, but conflicts with requirements  
CONFIDENCE: High

### XMF-020

ISSUE ID: XMF-020  
SEVERITY: Medium  
TITLE: Age verification is stored only in localStorage  
AFFECTED AREA: Adult gate/compliance  
FILE: `components/LiveRoom.tsx`  
LINE: 1645-1649  
ERROR: Acceptance writes only `xmf-age-ok=true` in browser storage.  
REPRODUCTION: Set the key manually or bypass the component; no server gate protects the response.  
ROOT CAUSE: The gate is a client presentation control rather than a server-recognized consent record.  
USER IMPACT: The gate can be bypassed and consent cannot be audited.  
FINANCIAL/SECURITY IMPACT: Compliance risk; legal adequacy requires counsel and jurisdiction-specific review.  
RECOMMENDED FIX: Use a signed, expiring, secure cookie and, where required, consent version/timestamp records; keep legal review separate from engineering validation.  
BLOCKS PRODUCTION: Potentially, pending legal review  
CONFIDENCE: High for technical behavior

### XMF-021

ISSUE ID: XMF-021  
SEVERITY: Medium  
TITLE: First-admin creation has a race and treats database errors as zero admins  
AFFECTED AREA: Admin setup  
FILE: `lib/admin-auth.ts`  
LINE: 45-49 and 97-119  
ERROR: A non-OK admin count returns `0`; count-then-insert is not transactional or protected by a singleton constraint.  
REPRODUCTION: Simulate a failed count response or concurrent valid setup requests before the first insert commits.  
ROOT CAUSE: Setup lock state is inferred with a non-atomic read.  
USER IMPACT: Setup can appear available during database failure or potentially create more than one initial admin.  
FINANCIAL/SECURITY IMPACT: Unauthorized/ambiguous ownership risk.  
RECOMMENDED FIX: Fail closed on count errors and create the first admin through a transaction/advisory lock or single-row bootstrap function with a database invariant.  
BLOCKS PRODUCTION: Yes before first deployment  
CONFIDENCE: High

### XMF-022

ISSUE ID: XMF-022  
SEVERITY: Medium  
TITLE: Native video element is given HLS manifests without a cross-browser HLS engine  
AFFECTED AREA: Live playback  
FILE: `lib/config.ts`; `components/LiveRoom.tsx`  
LINE: config 279-292; player 2222-2248  
ERROR: Mux/Bunny/Cloudflare sources resolve to `.m3u8` and are assigned directly to `<video src>`; no hls.js/provider player dependency is present.  
REPRODUCTION: Configure a provider and test a desktop browser without native HLS support. Live verification was unavailable without credentials/server startup.  
ROOT CAUSE: Provider URL selection exists, but playback compatibility was delegated to native media support.  
USER IMPACT: Some visitors may receive a playback error or blank player.  
FINANCIAL/SECURITY IMPACT: Lost viewing time and tips.  
RECOMMENDED FIX: Use the selected provider's supported player or a maintained HLS engine with native-HLS fallback, error recovery, telemetry, and cross-browser tests.  
BLOCKS PRODUCTION: Yes until target-browser playback is verified  
CONFIDENCE: Medium-high

### XMF-023

ISSUE ID: XMF-023  
SEVERITY: Medium  
TITLE: Audio storefront overflows horizontally at 320px  
AFFECTED AREA: XMASKEDFREAKS AC, cart/checkout mobile shell  
FILE: `app/globals.css`  
LINE: storefront styles around 5685-5700 and mobile rules 5948-5975  
ERROR: At 320px, the cached audio route had `scrollWidth=367` while the viewport was 320px.  
REPRODUCTION: Open `/audio-clips?purchaseDemo=1`, select Arabic/RTL, resize to 320x844, and inspect the document width. Header/navigation/intro elements extend beyond the viewport.  
ROOT CAUSE: Compact header/nav/intro minimum content widths do not fully collapse at the narrowest viewport.  
USER IMPACT: Sideways scrolling and clipped storefront content on small phones.  
FINANCIAL/SECURITY IMPACT: Checkout abandonment risk.  
RECOMMENDED FIX: Add `min-width:0` to flex/grid children, constrain brand/nav controls, wrap long localized content, and add 320px LTR/RTL visual regression tests.  
BLOCKS PRODUCTION: No, but should be fixed before mobile launch  
CONFIDENCE: High

### XMF-024

ISSUE ID: XMF-024  
SEVERITY: Medium  
TITLE: Public assets contain large and duplicated PNGs  
AFFECTED AREA: Performance, branding, games  
FILE: `public/branding/*`; `public/games/*`  
LINE: N/A  
ERROR: Coin/logo files are about 1.4-1.5 MB each, with three near-duplicate logo copies; game library/atlas images are about 1.6 MB and 1.8 MB.  
REPRODUCTION: Inspect file sizes under `public`; public assets total about 11 MB.  
ROOT CAUSE: Source-resolution PNGs are retained as serving assets without a verified responsive conversion pipeline.  
USER IMPACT: Slower first load on mobile and unnecessary bandwidth.  
FINANCIAL/SECURITY IMPACT: CDN/egress cost and conversion impact.  
RECOMMENDED FIX: Preserve originals outside the direct serving path, generate AVIF/WebP responsive variants, ensure `next/image` dimensions/sizes are correct, and measure LCP after conversion.  
BLOCKS PRODUCTION: No  
CONFIDENCE: High

### XMF-025

ISSUE ID: XMF-025  
SEVERITY: Medium  
TITLE: Public indexing is disabled globally  
AFFECTED AREA: SEO and launch configuration  
FILE: `app/layout.tsx`  
LINE: Metadata `robots` declaration near the top of the file  
ERROR: Global metadata sets `index:false` and `follow:false`.  
REPRODUCTION: Inspect generated metadata or `app/layout.tsx`.  
ROOT CAUSE: A development-safe setting remains in the root production metadata.  
USER IMPACT: Search engines are instructed not to index the site.  
FINANCIAL/SECURITY IMPACT: Discoverability and traffic loss.  
RECOMMENDED FIX: Make robots policy environment-specific and retain noindex only for preview/staging/admin routes.  
BLOCKS PRODUCTION: No for direct traffic; yes for search launch  
CONFIDENCE: High

### XMF-026

ISSUE ID: XMF-026  
SEVERITY: Medium  
TITLE: Clean build produced one intermittent route-collection failure  
AFFECTED AREA: Build and deployment  
FILE: `app/admin/intelligence/page.tsx` / Next build output  
LINE: N/A  
ERROR: First clean build: `PageNotFoundError: Cannot find module for page: /admin/intelligence`; immediate build and a second clean build passed.  
REPRODUCTION: Move/remove `.next` and run `pnpm run build`. Failure occurred once and did not reproduce on the next clean run.  
ROOT CAUSE: UNVERIFIED. Evidence is consistent with intermittent build output/race/toolchain behavior, but the exact cause was not established. Node 26 is newer than the repository's documented Next-era toolchain and should be validated, not assumed causal.  
USER IMPACT: CI/deployment may fail nondeterministically.  
FINANCIAL/SECURITY IMPACT: Release delay/outage risk.  
RECOMMENDED FIX: Reproduce in clean CI on the chosen supported Node LTS, run repeated clean builds, preserve full traces, and inspect generated app-path manifests if it recurs.  
BLOCKS PRODUCTION: Yes until CI demonstrates repeatability  
CONFIDENCE: High that the failure occurred; low on root cause

## F. Low-Priority Problems

### XMF-027

ISSUE ID: XMF-027  
SEVERITY: Low  
TITLE: Download accounting is non-atomic and client download buffers the full file  
AFFECTED AREA: Purchased downloads  
FILE: `app/api/audio-clips/[productId]/download/route.ts`; `components/audio-store/AudioStorefront.tsx`  
LINE: download 21-24; storefront 26-34  
ERROR: Download count is read then written; client fetches the signed object into a Blob before saving.  
REPRODUCTION: Start concurrent downloads or download a large purchased file on a memory-limited mobile device.  
ROOT CAUSE: Convenience implementation lacks atomic increment and direct navigation/streaming.  
USER IMPACT: Under-counted downloads and high browser memory use.  
FINANCIAL/SECURITY IMPACT: Minor analytics integrity and device-stability risk.  
RECOMMENDED FIX: Use an atomic RPC increment and return/redirect to a short-lived signed URL with correct content disposition and range support.  
BLOCKS PRODUCTION: No  
CONFIDENCE: High

### XMF-028

ISSUE ID: XMF-028  
SEVERITY: Low  
TITLE: Core public component and global stylesheet are oversized  
AFFECTED AREA: Maintainability and regression risk  
FILE: `components/LiveRoom.tsx`; `app/globals.css`  
LINE: Entire files (about 3,588 and 6,042 lines)  
ERROR: Streaming, auth, wallet, moderation, admin, games, payments, backgrounds, and support concerns share one client component and one global stylesheet.  
REPRODUCTION: Inspect file responsibilities and change surface.  
ROOT CAUSE: Features accumulated in a central prototype shell.  
USER IMPACT: Slower fixes and higher chance of visual/state regressions.  
FINANCIAL/SECURITY IMPACT: Indirect maintenance and incident risk.  
RECOMMENDED FIX: After production blockers, split by domain behind tested interfaces without changing behavior.  
BLOCKS PRODUCTION: No  
CONFIDENCE: High

## G. Warnings and Technical Debt

- The root route first-load JavaScript is 227 kB; `/audio-clips` is 187 kB; `/games` is 120 kB; middleware is 27.9 kB. These are build figures, not lab/user performance metrics.
- Matrix code has one observed canvas and one `requestAnimationFrame` loop with visibility pause and cleanup. Actual foreground FPS, CPU, memory growth, and route-transition restart behavior remain **UNVERIFIED** because the live server could not be restarted in the managed sandbox.
- The cached public and audio-store pages emitted no browser console errors. They are not proof of behavior from the newly built output.
- The games mechanics/recovery tests pass, and all game routes built. The historically reported game server error did not reproduce; exact runtime root cause remains **UNVERIFIED**.
- `admin/password-reset` is a delivery/logging scaffold until an email provider is connected.
- Several admin control panels describe future provider integrations or persist only local/client state. UI presence must not be interpreted as operational backend support.
- The root page contains wallet, login, add-coins, tip menu, account-like state, and support as sections/modals rather than independent `/wallet`, `/login`, `/register`, `/account`, `/cart`, `/checkout`, `/downloads`, or `/my-purchases` routes.
- The cost dashboard is a static estimate, not an honest usage ledger.
- No `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, or `dangerouslySetInnerHTML` occurrence was found in the inspected app/component/lib TypeScript sources.
- No source TODO/FIXME/HACK markers were found in the inspected app/component/lib TypeScript sources, but many explicit production placeholders remain.

## H. Route-by-Route Results

HTTP status below is either browser-observed from the pre-existing cached session or build-verified only. Fresh runtime status is marked **UNVERIFIED** because the sandbox denied binding localhost after the prior server was stopped.

| Route/system | Result | Runtime/console/auth notes |
| --- | --- | --- |
| `/` and anchors `#live`, `#clips`, `#fansly`, `#faq` | Cached browser PASS; build PASS | No cached console errors; public header exposes Admin link; mixed Arabic/English copy |
| `/audio-clips` | Cached browser PARTIAL; build PASS | Checkout demo rendered; no cached console errors; 320px overflow; production data needs Supabase |
| `/games` | Build/tests PASS; fresh runtime UNVERIFIED | Historical server error did not reproduce in build; recovery tests pass |
| `/games/[slug]/play` | Build/tests PASS; fresh runtime UNVERIFIED | Game mechanics and recovery suites pass |
| `/games/slither` | Build PASS | Thin route; runtime gameplay not re-opened after fresh build |
| `/admin` | Build PASS; runtime UNVERIFIED | Server session protection exists, but RLS/2FA are unsafe |
| `/admin/login` | Build PASS | Any formatted digits satisfy 2FA after correct password |
| `/admin/setup` | Build PASS | Requires env secret, but count error/race defects exist |
| `/admin/audio-clips` | Build PASS | Upload architecture not viable for promised large files |
| `/admin/games`, `/admin/games/[gameId]` | Build PASS | Settings persistence needs configured Supabase; leaderboard integrity defect |
| `/admin/media`, `/admin/media/[section]` | Build PASS | Server auth is present; storage integration unverified |
| `/admin/intelligence`, `/admin/error-logs` | Repeat build PASS | One earlier clean build failed collecting intelligence route |
| `/admin/tips`, `/admin/translations` | Build PASS | Remote persistence unverified; RLS and translation coverage defects apply |
| `/go` | Build PASS | Runtime OBS detection/destination logging unverified without environment/services |
| `/sandbox` | Build PASS | Development route; production exposure policy not established |
| API routes (35 generated) | Build PASS only | Critical auth/mock findings documented above; remote behavior unverified |
| Dedicated wallet/login/register/account/cart/checkout/download pages | MISSING as routes | Functionality is embedded in root/storefront components instead |

## I. Build and Test Results

### Passed

- `pnpm run typecheck`
- `pnpm run lint` with zero warnings
- `pnpm run test:games` (16)
- `pnpm run test:games-recovery` (6)
- `pnpm run test:faq` (4)
- `pnpm run test:tips` (7)
- `pnpm run test:media` (7)
- `pnpm run test:background` (9)
- `pnpm run test:audio-store` (5)
- `pnpm run test:purchase-flow` (7)
- `pnpm run test:i18n` (6)
- Total automated tests: 67 passed, 0 failed
- `pnpm run check:i18n` (passes with 908-candidate baseline)
- Repeat clean `pnpm run build`: 49 routes generated successfully

### Failed or constrained

- First clean `pnpm run build`: intermittent `PageNotFoundError` for `/admin/intelligence` during page-data collection.
- `pnpm run dev`: failed to bind both `0.0.0.0:3000` and `127.0.0.1:3000` with `EPERM` in the managed sandbox. This is an audit-environment restriction, not confirmed application failure.
- `pnpm audit`: could not reach package registry; vulnerability state **UNVERIFIED**.
- `pnpm list`: local pnpm SQLite metadata error; dependency scripts/build still operated.
- `npm ls next react react-dom`: npm reported peer-layout issues against pnpm's install; no duplicate React runtime was confirmed.
- No root `test` script exists; all named suites were run individually.

## J. Security Findings

Production-blocking security issues are XMF-001 through XMF-004, XMF-007 through XMF-013, XMF-016, XMF-017, XMF-020, and XMF-021. No hard-coded live secret value was found. Service-role use is server-side, but multiple public routes expose privileged writes. Raw IP is not returned by the geo route, but privacy, retention, consent, and deletion behavior are not implemented or verified. Cookie flags for admin sessions are secure/HTTP-only/same-site strict; logout revocation is incomplete. Direct user/admin/expired-session role tests could not be executed without Supabase credentials.

## K. Performance Findings

- Build bundles: root 227 kB, audio store 187 kB, games 120 kB first-load JS; shared 87.4 kB.
- Public assets total about 11 MB, including six files over 1 MB.
- `node_modules` is about 322 MB and `.next` about 157 MB; these are development/build sizes, not shipped page weights.
- Matrix implementation has one canvas in the cached DOM and static cleanup/visibility handling. Foreground FPS/LCP/CLS/INP/main-thread/memory measurements are **UNVERIFIED**.
- The public root showed no horizontal overflow at 320, 375, 430, 768, 1024, 1280, or 1440 pixels in the cached session.
- Large upload and download paths create full in-memory buffers.
- No database/API response timing was measurable without configured services.

## L. Database Findings

The monolithic schema contains substantial tables, constraints, indexes, wallet RPCs, storage policies, and RLS, but its admin RLS model is unsafe (XMF-001). The incremental migration directory is not a valid fresh-install sequence (XMF-005). Remote migration history, drift, indexes, policies, seed data, triggers, functions, backups, and point-in-time recovery are **UNVERIFIED** because no project credentials/CLI environment were available. The audio checkout RPC appears designed as one transaction with wallet row locking, expected-total validation, idempotency, order/items/entitlements, ledger debit, and cart clearing, but it was not executed against a database.

## M. Storage and Upload Findings

Code intends private original-media storage and short-lived signed downloads. Public product responses do not expose original storage paths. Upload handlers validate file signatures and block arbitrary document/SVG uploads, which is positive. However, originals/previews are buffered through Next, no direct/multipart/resumable flow exists, and processing/metadata/waveform/preview jobs, orphan cleanup, version retention, replacement guarantees, range behavior, quota monitoring, and provider limits are absent or **UNVERIFIED**. A realistic production maximum cannot be stated until a host and direct-storage architecture are selected; the current 250 MB UI limit is not evidence that 250 MB uploads will succeed.

## N. Cart, Checkout, Wallet, and Download Findings

The storefront uses a shared purchase context and the automated purchase-flow tests pass. Cart and checkout responsibilities are separated in components. The database RPC is architected for atomic purchase settlement, current server prices, wallet locking, idempotency, order creation, entitlements, deduction, and cart clearing. These strengths are code-level only because the migration cannot bootstrap and no Supabase environment was available. Real coin funding is impossible without a payment processor. Paid live access is independently bypassable. Guest/auth refresh, two-tab races, forced server failure, price-change concurrency, unauthorized entitlement, signed URL expiry, and file replacement preservation were not executed end-to-end.

## O. Responsive and Accessibility Findings

Responsive public-shell checks passed at seven widths; the audio storefront overflowed by 47 px at 320px in the cached Arabic/RTL session (XMF-023). The checkout modal remained vertically scrollable and its primary button was approximately 50 px high. Full admin/game/mobile-landscape/safe-area testing could not be repeated after the server bind restriction. Static code includes labels, ARIA live regions, media labels, reduced-motion styles, and semantic buttons, but a complete keyboard focus trap, screen-reader, contrast, heading-order, and automated accessibility audit remains **UNVERIFIED**. Mixed-language content is an accessibility and comprehension issue.

## P. Production Readiness Assessment

Classification: **Development only**.

The site is not safe to deploy. It cannot be considered staging-ready until admin RLS, admin MFA/session lifecycle, migration bootstrap, privileged API authorization, access-control authority, and endpoint abuse controls are repaired. It cannot be considered a production candidate until real payments, verified wallet reconciliation, live playback compatibility, uploads, monitoring, health checks, backups/restores, deployment/rollback, headers, and complete environment configuration are validated in staging. Legal/compliance approval for adult content, coin disclosures, refunds, privacy, consent, email, and geographic availability is outside this code audit and remains required.

## Q. Recommended Repair Order

1. Freeze public deployment and rotate admin/session/service credentials if the unsafe schema has been deployed.
2. Replace broad RLS with tested anonymous/user/admin policies; protect admin hashes, sessions, financial, security, and moderation tables.
3. Implement real TOTP MFA assurance and server-side logout/session revocation.
4. Produce a fresh, ordered migration baseline and prove it with a disposable Supabase reset.
5. Protect all privileged APIs, beginning with stream settings, notifications, finance/cost, moderation, media, and intelligence.
6. Rebuild paid access as a server entitlement tied only to verified processor webhook or atomic wallet debit.
7. Integrate the approved payment processor with tokenized checkout, webhooks, idempotency, reconciliation, and test/live certification.
8. Replace cookie-only throttling with CDN/shared enforcement; bound AI, analytics, score, auth, and upload endpoints.
9. Select deployment infrastructure and add security headers, health checks, monitoring, alerts, backups, restore test, migration gate, and rollback.
10. Add a cross-browser HLS player and run real OBS/provider playback tests.
11. Replace server-buffered media uploads with signed direct/resumable storage uploads and background processing.
12. Complete payment/policy/error localization, fix the 320px storefront overflow, optimize large images, and execute accessibility/performance labs.
13. Run a full staging matrix with anonymous, user, admin, expired session, concurrent purchase, entitlement, mobile, and failure-injection scenarios.

## Confirmed Problem Index

1. XMF-001: Broad authenticated RLS exposes admin/security/payment data and controls.
2. XMF-002: Admin 2FA accepts any formatted digits.
3. XMF-003: Paid-access enforcement is client-authoritative.
4. XMF-004: Stream settings can be changed without admin authentication.
5. XMF-005: Migration order cannot bootstrap a database.
6. XMF-006: Production payments are not connected.
7. XMF-007: Moderation is browser-bypassable and RLS is unsafe.
8. XMF-008: Logout does not revoke admin sessions.
9. XMF-009: Rate limiting trusts a client cookie.
10. XMF-010: AI support usage is unauthenticated and unbounded.
11. XMF-011: Referral/conversion analytics can be forged.
12. XMF-012: Large uploads buffer whole files through Next.
13. XMF-013: Live notifications are unauthenticated and simulated.
14. XMF-014: Geo/cost dashboards are mock/static.
15. XMF-015: Game leaderboard scores are forgeable.
16. XMF-016: Production security headers are missing.
17. XMF-017: Deployment health/monitoring/backup/rollback implementation is missing.
18. XMF-018: 908 hard-coded localization candidates remain.
19. XMF-019: Admin navigation is exposed publicly.
20. XMF-020: Age-gate consent is localStorage-only.
21. XMF-021: First-admin setup has error/race behavior.
22. XMF-022: HLS playback lacks a cross-browser engine.
23. XMF-023: Audio storefront overflows at 320px.
24. XMF-024: Large duplicated public PNG assets increase load cost.
25. XMF-025: Search indexing is globally disabled.
26. XMF-026: One clean build failed intermittently.
27. XMF-027: Download counting and client memory behavior need correction.
28. XMF-028: Oversized core files raise regression risk.

## Required Infrastructure and Credentials

- Supabase project URL, anonymous key, service-role key, verified migration history, storage buckets, backup policy, and staging project.
- Long random admin setup secret and a real TOTP enrollment/verification design.
- Approved payment processor account, API keys, hosted/tokenized checkout, webhook secret, supported-country/currency rules, and settlement account.
- OBS/live-status source and stream-provider credentials/IDs for Mux, Bunny, or Cloudflare Stream.
- CDN/WAF/DDoS provider configuration and shared rate-limit store.
- Email provider/domain authentication, consent source, unsubscribe handling, webhook/event credentials.
- AI provider keys and explicit usage budgets/quotas.
- Geo provider and privacy/retention configuration.
- Deployment provider, domain/DNS/TLS, monitoring/error tracking, uptime checks, logs, backups, restore target, and rollback mechanism.

## Exact Next Repair Task

Create and test a single non-destructive Supabase security migration that removes every `to authenticated using (true)` admin policy, introduces a server-verifiable ADMIN predicate, denies ordinary users access to `admin_users`, `admin_sessions`, audit, payment, security, moderation, and deposit-control tables, and proves anonymous/user/admin behavior in automated policy tests against a disposable database. Do not connect production payments or deploy publicly before this passes.
