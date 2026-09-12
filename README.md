# XMASKEDFREAKS Next.js Handoff

This is the GitHub-ready Next.js version of the XMASKEDFREAKS live-room frontend. It includes the live page, sandbox testing route, Supabase auth/database hooks, creator dashboard scaffolding, AI support route, multilingual localization system, multi-provider video configuration, games, leaderboard hooks, and the 728x90 branded live banner system.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local`:

```bash
cp .env.example .env.local
```

3. Add Supabase keys to `.env.local`:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=
```

4. Run the database setup:

Open Supabase SQL Editor and run `supabase/schema.sql`.

5. Start the site:

```bash
npm run dev
```

6. Open:

```text
http://localhost:3000
```

For visual testing with the admin dashboard unlocked:

```text
http://localhost:3000/sandbox
```

## Built Into This Site

### Public Visitor Experience

- Stronger 18+ compliance gate requiring confirmation of age, legal permission, prerecorded adult entertainment notice, Terms agreement, Refund Policy agreement, and consent to enter.
- Original expandable Terms, Privacy, DMCA, and highly restricted Refund Policy language on the gate and subtle footer legal links.
- Multilingual age-gate selector with browser-language detection, region fallback, searchable language picker, and saved preference.
- Automatic visitor time-zone localization with all public live schedules, countdown references, and event labels shown in each visitor's local time.
- Public schedule copy now presents the live loop as running every day.
- Video-first homepage built around a live-style OBS/provider stream, with the player taking the majority of the first screen.
- Compact top status bar showing only daily goal progress and public viewer count on the public live page.
- Live chat sits beside the video on desktop and below the video on mobile, while tip action stays as one prominent button.
- Responsive Theater Mode expands the video, docks chat on desktop, stacks chat/tip controls on mobile, hides banners/navigation/secondary links, and keeps only viewer count, goal, tip, mute, fullscreen, and exit controls visible.
- Immersive live audio enhancement uses native browser Web Audio support for subtle compression, peak limiting, and gentle normalization, with safe fallback to regular video playback when unsupported.
- Background Music and Live Lobby system with ADMIN playlist controls, MP4-audio/MP3/AAC/M4A/WAV support, one-hour local cache metadata, offline lobby playback, pre-show behavior, live ducking, post-live behavior, and a compact Now Playing notice.
- Adaptive Power and Performance Optimization Engine uses browser-supported signals only, including visibility, network information, device memory hints, battery status where available, dropped-frame data where available, and responsiveness drift. It throttles nonessential work before ever recommending video quality changes.
- Platform-wide reward notifications trigger after legitimate tips with username, amount, configurable emoji/animation/color/sound, 10-second default display, cross-tab broadcast, and a production-ready path for Supabase Realtime, SSE, or websockets.
- Secure wallet system scaffold with global balance display, wallet-funded tips, transaction history, configurable purchase limits/currency, fraud/idempotency notes, and Supabase wallet ledger tables.
- Dynamic coin package and bonus pricing system with `$10` through `$1,000` default tiers, base coins, bonus coins, total coins, Most Popular/Best Value badges, admin package manager, testing mode, and a 15% hard bonus cap.
- Coin Usage Disclosure system that explains Platform Coins are only for live-stream tips and eligible future merchandise, not cash, stored value, bank funds, cryptocurrency, investments, or transferable financial instruments.
- Coin purchases require acknowledgement before checkout, with an admin option to require acknowledgement on every purchase, plus receipt/confirmation wording and acknowledgement logging.
- Clean payment flow with no visible currency converter, country selector, currency selector, exchange-rate preview, or conversion controls for visitors.
- Payment amounts are prepared as canonical USD values and `/api/payments` validates allowed purposes, min/max rules, receipt email, payment method type, and integer processor minor units before returning processor-ready intent data.
- Responsive mobile layout for the live room, chat, creator dashboard, games, and content tabs.
- Dark BDSM-inspired visual direction with black base, green accents, red live cues, and purple content outlines.
- Theater Mode toggle for the live video.
- Login form using email, password, and display name, with display names limited to 12 characters.
- Supabase email/password auth scaffold with optional standard-user 2FA, mandatory admin 2FA policy, trusted devices, TOTP readiness, recovery codes, and secure password reset hooks.
- One-time first admin setup at `/admin/setup`, protected by server-only `ADMIN_SETUP_SECRET`, then permanently locked after the first admin exists.
- Normal administrator login at `/admin/login` with bcrypt password verification, required admin 2FA code, secure admin session cookie, lockout after repeated failed attempts, and audit logging.
- Consolidated protected ADMIN command center at `/admin` for every administrator-only feature, setting, switch, log, tool, control, and configuration area.
- Public visitor pages no longer expose the admin navigation; the old embedded admin/creator prototype section only appears in `/sandbox` for visual testing.
- ADMIN feature switch actions post through `/api/admin/feature-switches`, require an ADMIN session, enforce server-side role checks, rate-limit attempts, audit-log every request, block protected core systems, and require confirmation before disabling important systems.
- Optional admin features preserve configuration and historical logs when disabled; core systems such as payment integrity, authentication, moderation, security, logs, and emergency controls cannot be disabled from the ADMIN panel.
- Wallet display and frontend coin/tip behavior with 1 coin equal to `$0.50` in the paid-access build.
- Server-authoritative Live contribution policy: the current 10-coin (`$5.00`) entry requirement, post-entry grace, refillable viewing credit, and reminder/cutoff behavior are maintained by the current Live access system. The former 25-minute contribution rule is retired.
- A localized, centered reminder appears once per period for 16 seconds; active browsing and legitimate checkout receive bounded protection without becoming an endless bypass.
- The access checkout uses hosted/tokenized payment assumptions only; raw card numbers and CVV are never inspected or stored by the site.
- Tokenized saved-payment scaffold with explicit save consent, masked payment methods, default method selection, removal controls, duplicate-tip protection, step-up verification thresholds, and no raw card/CVV storage.
- Payment records are prepared to preserve canonical amount, currency, processor reference, idempotency key, final status, and safe tokenized payment metadata.
- Tip menu prepared for up to 10 custom items.
- Recent tip display and on-screen contribution feel.
- Clips4Sale section with 6 featured clip cards linking to studio `444327`.
- Fansly section for `@1SexualTension`.
- FAQ section.
- Floating AI customer-support widget.
- Footer language and time-zone selectors so visitors can change preferences after entry.

### Live Video And Provider System

- Multi-provider stream configuration for Mux, Bunny Stream, and Cloudflare Stream.
- Fallback HLS/MP4 URL field.
- Admin stream-setting API route at `/api/stream-settings`.
- Supabase `stream_settings` table.
- Deterministic `/go` redirect manager for every ad and external campaign link.
- OBS live detection priority: when `OBS_STATUS_ENDPOINT`, `OBS_LIVE`, or `OBS_STREAM_ACTIVE` confirms live, `/go` sends every visitor directly to `/#live` and skips all offline overrides.
- Offline routing uses America/Chicago scheduling plus configurable deterministic split defaults of 60% Clips4Sale and 40% Fansly.
- Admin Redirect Manager controls for offline split, 100% platform overrides by block, manual offline override, env preview, and redirect log preview.
- Supabase redirect-manager settings and logs for timestamp, destination, reason, referrer, campaign, OBS state, and deterministic bucket.

### Creator/Admin Dashboard

- Creator-only dashboard section.
- Owner-code unlock scaffold.
- Connection panel for stream provider settings.
- Honest analytics panel that does not inflate admin numbers.
- Geo Dashboard with active visitor intelligence, country rollups, dynamic world clocks, clickable country map, active visitor table, filters, reports, and privacy-safe raw-IP handling notes.
- Referring Websites dashboard with automatic referral classification, Direct Traffic fallback, source totals, unique visitors, clicks, conversions, traffic percentage, trend charts, landing pages, average session duration, bounce rate, and conversion action drill-down.
- Security middleware layer that runs before application logic, with IP/user-agent/country controls, request validation, abuse scoring, throttling, temporary blocking, and Cloudflare/CDN handoff notes.
- Admin Security Dashboard with active visitors, blocked IPs, suspicious requests, attack attempts, request rates, geographic traffic distribution, server health, manual allow/block rules, and security alerts.
- Admin Authentication section for enforcing mandatory 2FA on administrator accounts while leaving 2FA optional for standard users.
- Protected `/admin` route scaffold with ADMIN role checks and session validation.
- Cost Dashboard with hosting, streaming bandwidth, database, storage, AI API, email, analytics, security, and payment-processing cost tracking.
- ADMIN payment readiness controls now focus on canonical pricing, hosted checkout readiness, processor health, idempotency, payment limits, and safe masked transaction references without exposing routine currency-conversion controls.
- Coin Policy ADMIN panel for editing disclosure wording, choosing where the notice appears, requiring first/every-purchase acknowledgement, managing future merchandise eligibility, previewing desktop/mobile notices, and reviewing acknowledgement or admin-change logs.
- Performance and Power ADMIN panel with Automatic, Maximum Quality, Balanced, Low Power, and Streaming Priority profiles, plus device/network/video health, active background tasks, optimization actions, recent warnings, and logs.
- Background Music ADMIN panel with Automatic, Lobby Only, Live Background, and Disabled modes; playlist name, upload references, ordering/editing, shuffle, repeat, crossfade, lobby volume, live ducking volume, pre-live timing, post-live behavior, cache status, and playback logs.
- Open-source-first policy card for dependency/service decisions, paid-service review, and provider-agnostic architecture.
- Redirect Manager card for deterministic `/go` campaign routing, OBS-live priority, offline destination blocks, and analytics review.
- Admin notification center.
- Live Notification Manager with default message `HURRY THEY'RE LIVE!!!!`, editable subject/body/CTA/destination/language/audience/schedule/cooldown, desktop/mobile preview, active-stream verification, campaign history, and email-first delivery scaffolding.
- Protected Bad Accounts and contribution-rule controls for watch periods, reminders, exemptions, restrictions, verified return attempts, A() reinstatements, V() violation attempts, and Clips4Sale redirect configuration.
- Cost Dashboard shows daily, weekly, monthly, projected month-end, budget usage, free-tier remaining, allowance percentages, fixed versus usage-based spend, cost alerts, trend bars, feature breakdown, and cost-per-user/viewer-hour/stream/tip/conversion estimates.
- `OPEN_SOURCE_POLICY.md` documents the platform rule to evaluate native Next.js/browser features and well-maintained permissive open-source options before adding libraries, APIs, hosted services, or paid integrations.
- `DEPENDENCY_REVIEW_TEMPLATE.md` provides the required report format for new packages, APIs, hosted services, and paid integrations.
- AI engagement message panel.
- Upgraded AI subagent operating model with distinct roles, sayings, controlled tool access, evidence-first reasoning, low-risk repair limits, confidence reporting, Claude escalation, and cross-agent collaboration rules.
- Claude Control Layer at `/admin/intelligence` and `/api/claude/control` now sends compact agent packets with problem observed, evidence collected, likely root cause, confidence score, safe actions attempted, result, remaining risk, and admin approval requirements.
- Three-layer support architecture: Maya, Riley, Nova, and Sage are the only visitor-facing agents; Atlas, Pixel, Ledger, Echo, Route, and Todd stay hidden in ADMIN/Claude logs; Claude coordinates evidence, assignments, repairs, approvals, and final answers through the same visible agent.
- Katy remains an internal performance/cost owner for admin-only power, smoothness, and expense panels, not a visitor support route.
- Game QA/admin monitor area for Todd, visible only in the creator dashboard.
- Moderation scaffold for prohibited-language enforcement.
- Editable video provider fields.
- Tip menu editor.
- Games admin manager for enabling, disabling, organizing, adding, removing, and reviewing game analytics.
- 728x90 Banner admin panel with:
  - 6 image/scene slots
  - upload/replace controls
  - enable/disable controls
  - reorder controls
  - remove controls
  - ticker speed
  - transition speed
  - image rotation timing
  - text outline color
  - background transparency
  - glow intensity
  - live-only, always, or off display mode

### 728x90 XMASKEDFREAKS Live Banner

- Large branded `XMASKEDFREAKS` live overlay inside the video area.
- Visual scenes clipped inside the text letters.
- Stronger outline and glow pass for better visibility over video.
- Responsive sizing for desktop and mobile.
- Non-interactive overlay so it does not block video controls, chat, tips, games, or Theater Mode.
- Built in both the static prototype and the Next.js app.

### Games

- Top navigation Games entry.
- Movable 300x250 floating game window.
- Close/reopen behavior without leaving the live stream page.
- Game audio muted/low by default.
- Personal high score and public leaderboard display.
- Admin game manager with analytics.
- Todd game QA/admin monitor reports game issues only inside the creator dashboard.
- Pac-Mask Chase:
  - original neon maze-chase style
  - keyboard, mousepad, touch, and swipe controls
  - pellets, power orbs, enemies, lives, level, score, timer, pause, restart, and game-over state
  - 80-second round timer that resets without refreshing the website
- Space Invader Sweep:
  - original neon fixed-screen shooter style
  - enemy waves, player firing, enemy shots, shields, bonus ship, lives, scoring, speed progression, pause, restart, and game-over state

### AI Customer Support

- Support widget component: `components/SupportWidget.tsx`.
- Support API route: `/api/support`.
- Maya is the main front-door support assistant.
- Riley handles visitor-facing billing explanations without editing financial records, Nova handles visitor-facing playback/device/page-loading issues, and Sage handles moderation/account/policy concerns only when necessary.
- Atlas, Pixel, Ledger, Echo, Route, and Todd never appear in ordinary visitor-facing chat. They receive protected Claude assignments and report problem observed, evidence, likely root cause, confidence, safe actions, result, remaining risk, and approval needs inside ADMIN logs.
- The support API receives the visitor language and instructs the AI assistant to reply in that language whenever possible.
- Demo support replies work without an AI key.
- With `OPENAI_API_KEY`, the route can call an AI model and save support messages to Supabase.
- Support messages table included in `supabase/schema.sql`.

### Claude Control Layer

- Protected admin page: `/admin/intelligence`.
- Admin-only API route: `/api/claude/control`.
- Claude receives compact structured packets only: system name, state, problem, severity, affected users, recent changes, assigned agent, tools, confidence, and next action.
- The route does not send full databases, raw logs, full pages, secrets, API keys, or repeated context by default.
- Commands include Analyze, Explain, Diagnose, Fix Safely, Assign Agent, Compare Logs, Test Again, Create Report, and Escalate to Admin.
- Money, security, permanent deletion, account ownership, and production deployment actions are approval-gated.
- Intelligence actions can be logged to `intelligence_activity_logs` when Supabase service credentials are configured.

### Supabase Database Tables

The schema currently includes tables for:

- profiles
- auth trusted devices
- auth TOTP factors
- auth recovery codes
- auth password reset events
- auth policy settings
- tip events
- login events
- live email subscribers
- stream settings
- support messages
- missing translation events
- live notification templates
- live notification campaigns
- live notification deliveries
- geo visitor sessions
- geo country rollups
- geo reports
- geo security reviews
- redirect logs
- campaigns
- referral events
- wallet transactions
- payment methods
- payment intents
- payment webhook events
- security events
- moderation events
- platform lockdown
- game scores
- game catalog
- game sessions
- game issue reports
- AI engagement messages
- admin audit events
- admin users

Row-level security is enabled in the schema, with starter policies for user-owned records, support messages, stream settings, and game leaderboards.

### Localization System

- Runtime locale files live in `public/locales`.
- `public/locales/en.json` is the complete fallback catalog.
- `public/locales/es.json`, `fr.json`, `de.json`, and `pt.json` are included as starter translated catalogs.
- `public/locales/manifest.json` controls which languages show in the selector.
- `lib/i18n.ts` handles detection, fallback, saved preferences, translation lookup, missing-key logging, localized numbers, and localized currency.
- Language preference is stored in local storage, a cookie, and the Supabase `profiles.preferred_language` field when a user is authenticated.
- Missing translation keys are written to `missing_translation_events` so administrators can review gaps.

To add a language without changing application source code:

1. Add a new JSON file to `public/locales`, such as `it.json`.
2. Add the language to `public/locales/manifest.json`.
3. Include any translated keys you have. Missing keys fall back to English and are logged.
4. Rebuild/redeploy the site so the new static locale file is served.

### Time-Zone Localization System

- Internal stream windows, admin scheduling, logs, and automation rules stay anchored to the platform default time zone.
- `lib/timezone.ts` detects the visitor time zone from browser settings, uses browser-region mapping as a geographic fallback, stores the preference in local storage and a cookie, and asks the visitor to choose a zone if detection fails.
- The public live schedule shows `Your local time` only, so visitors see the correct converted stream times without exposing the internal scheduling zone.
- The footer time-zone selector lets visitors manually change their preferred zone at any time.
- Authenticated profile sync saves the preference to `profiles.preferred_time_zone`.
- Date and time formatting uses `Intl.DateTimeFormat` with IANA time-zone IDs, so daylight-saving-time changes are handled by the browser/runtime.
- The admin dashboard can keep using the internal scheduling zone unless an admin-facing display override is added later.

### Geo-Targeting And Visitor Intelligence

- The private admin dashboard includes a Geo Dashboard for country, region/state, city, time zone, language, browser, operating system, device type, referral source, campaign, and conversion analytics.
- Dynamic World Clock cards display only countries with active visitors and show local time, time zone, active visitor count, and daytime/nighttime state.
- The clickable country map updates the detail panel with active sessions, total visits, average session duration, pages viewed, language preference, referral source, device breakdown, browser usage, and registrations/deposits/purchases/tips.
- Active visitor rows show approximate location, session duration, current page, referral, language, time zone, device, browser, operating system, and new/returning status.
- `/api/geo` is scaffolded to hash IP addresses server-side, parse device/browser data, and return privacy-safe analytics metadata without exposing raw IP addresses.
- Supabase tables are prepared for live visitor sessions, country rollups, daily/weekly/monthly reports, and restricted security reviews with encrypted-IP fields.
- Production geolocation should use a server-side provider, a secret IP hash salt, encrypted raw-IP storage where legally allowed, admin RBAC, retention limits, consent/privacy disclosures, and regional compliance review.

### Live Notifications And Tokenized Tipping

- Visitors can opt in or out of live email alerts from account settings. Future push, mobile push, and SMS toggles are scaffolded.
- Admins can write, preview, schedule, save, and send live announcements after stream activity is confirmed, with a manual override for approved repeat messages during cooldown.
- Live notification campaigns track audience size, successful deliveries, failures, opens, clicks, opt-outs, destination page, cooldown, and broadcast session metadata.
- Cooldown protection prevents duplicate alerts when OBS briefly disconnects and reconnects.
- Payment checkout supports one-time cards, saved tokenized methods with explicit consent, and fast future tips using masked card details.
- The app stores only processor customer IDs, payment tokens, brand, last four digits, expiry, and safe metadata. Raw card numbers, CVV, magnetic stripe data, and unencrypted credentials must never be stored in the database, browser, logs, or admin dashboard.
- Payment intent scaffolding includes idempotency keys, duplicate-tip blocking, webhook dedupe, insufficient-balance checks, unfamiliar-device/risk step-up notes, and admin-configurable thresholds.

### Current Live Contribution Policy

- The Live room uses the current 10-coin (`$5.00`) entry requirement and a post-entry grace period before protected viewing is restricted.
- Confirmed contributions and qualifying purchases update the current server-owned Live access state; the former 25-minute rule is not an active policy.
- The checkout countdown is 64 seconds and pauses in the demo while hosted payment fields are active.
- Confirmed wallet tips and processor-verified purchases are applied idempotently to the active contribution period; browser return pages never qualify a contribution.
- Refusal, timeout, failed payment without retry, or bypass behavior redirects away from live using a 60% Clips4Sale / 40% Fansly weighted rule.
- `/api/access-control` is scaffolded for server-authoritative status, lock, unlock, and redirect actions with hashed device/IP signals and no raw IP exposure.
- Supabase tables are prepared for access sessions, contributions, redirect logs, settings, and audit events.

## Sandbox Visual Testing

Open `/sandbox` while running the dev server.

Sandbox mode:

- bypasses the age gate for visual testing
- unlocks the admin dashboard
- preloads demo user state
- preloads wallet balance, tips, chat, and notifications
- provides buttons for triggering a demo tip, Theater Mode, game window, and lag alert
- works without Supabase keys

## Important Production Notes

These pieces are frontend-ready or scaffolded, but still need real production services before launch:

- Real payment processor integration for wallet deposits and tips.
- Real payment processor vault integration for saved cards, customer IDs, payment tokens, webhooks, idempotency, and step-up verification.
- Real account payout/deposit automation.
- Real email provider for live alerts, unsubscribe handling, suppression lists, campaign metrics, and deposit notifications.
- Protected media storage for lobby music uploads. Production should store approved tracks behind signed URLs or provider-authenticated storage, cache only safe responses/metadata for up to one hour, and never expose private source files or permanent protected URLs.
- Wire Supabase password sign-up, password reset emails, verified TOTP enrollment, hashed recovery codes, trusted-device cookies, admin role checks, 2FA challenge verification, and audit enforcement.
- Server-side watch-limit enforcement.
- Server-side device/session recognition.
- Real VPN/IP intelligence through a security provider.
- Real CDN/firewall/WAF protection through a provider such as Cloudflare.
- Real OBS/live-state detection from the selected video provider.
- Real-time viewer/tip updates through Supabase Realtime or websockets.
- Real server-side IP geolocation provider, privacy notices, retention policies, encrypted IP storage, and restricted security access controls for the Geo Dashboard.
- Real banner, game, tip-menu, and dashboard setting persistence through admin APIs.
- Professional translation review for production-grade legal and policy text in each market.
- Legal review for age-gate, terms, refund policy, privacy, and adult-content compliance.
- Follow `OPEN_SOURCE_POLICY.md` before adding any dependency or paid service. New dependency reports should include package name, license, maintenance status, bundle impact, security considerations, free/paid status, and why it was chosen. Paid service reports should include alternatives considered, expected monthly cost, usage limits, scaling risks, lock-in concerns, and replacement steps.

Browser-based websites cannot reliably detect every screen recorder or built-in OS recording tool. Production protection should use watermarking, account/device logging, rate limits, session enforcement, CDN rules, and legal/compliance processes instead of relying on frontend-only detection.

## Project Files

```text
app/page.tsx                         Main live room page
app/sandbox/page.tsx                 Visual testing route
app/api/support/route.ts             AI customer-support API
app/api/claude/control/route.ts      Claude Control Layer API
app/api/stream-settings/route.ts     Video provider settings API
app/api/access-control/route.ts      Server-owned contribution-period transition API
app/api/cost-dashboard/route.ts      Cost Dashboard billing summary scaffold
app/api/referrals/route.ts           Referral detection and analytics event capture
app/api/admin/setup/route.ts         One-time first-admin setup endpoint
app/api/admin/login/route.ts         Admin login, lockout, session creation
app/api/admin/logout/route.ts        Admin logout and audit event
app/api/admin/password-reset/route.ts Admin password reset request audit
app/go/route.ts                      Deterministic OBS-priority redirect route
middleware.ts                        Edge security gate before page/API logic
app/admin/setup/page.tsx             First-time private owner setup page
app/admin/login/page.tsx             Normal admin login page
app/admin/page.tsx                   Protected ADMIN dashboard scaffold
components/LiveRoom.tsx              Main frontend experience
components/SupportWidget.tsx         AI support widget
lib/i18n.ts                          Localization engine
lib/config.ts                        Tips, clips, games, banner, video provider defaults
lib/auth-policy.ts                   2FA policy, trusted-device, and recovery-code helpers
lib/admin-auth.ts                    First-admin setup, bcrypt passwords, sessions, audit logs
lib/geo.ts                           Geo and referral analytics helpers
lib/redirect-manager.ts              OBS-priority deterministic /go routing logic
lib/security.ts                      Request validation, abuse scoring, and block/throttle rules
lib/supabase/client.ts               Supabase browser client
public/locales/*.json                Translation catalogs
supabase/schema.sql                  Database schema and starter RLS policies
app/globals.css                      Full responsive styling
OPEN_SOURCE_POLICY.md                Open-source-first and cost-efficient development policy
DEPENDENCY_REVIEW_TEMPLATE.md        Review template for dependencies and paid services
```

## Environment Variables

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
OPENAI_SUPPORT_MODEL
CLAUDE_API_KEY
CLAUDE_CONTROL_MODEL
ADMIN_SETUP_SECRET
OBS_STATUS_ENDPOINT
OBS_LIVE
OBS_STREAM_ACTIVE
FANSLY_URL
CLIPS4SALE_URL
REDIRECT_CLIPS_PERCENT
REDIRECT_MANUAL_DESTINATION
REDIRECT_OFFLINE_BLOCKS
SECURITY_WHITELIST_IPS
SECURITY_BLACKLIST_IPS
SECURITY_BLACKLIST_COUNTRIES
SECURITY_BLACKLIST_USER_AGENTS
```

## GitHub Upload

Push the `xmaskedfreaks-next` folder as its own repository:

```bash
git init
git add .
git commit -m "Initial Next.js Supabase site"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

## Deployment

For Vercel:

1. Import the GitHub repo.
2. Add the environment variables listed above.
3. Run the Supabase schema.
4. Set `NEXT_PUBLIC_SITE_URL` to the deployed domain.
5. Configure the real stream provider IDs.
6. Connect payment, email, security, and payout services before accepting real money.

## Latest Platform Update

- Theater Mode now hides menus, banners, schedules, secondary links, and admin-heavy panels while keeping live chat, tip bar, tip goal, viewer count, wallet balance, and global tip notifications visible.
- Global tip notifications include emoji, username, token count, amount, label, and the subtle compressed ching sound.
- Chat now includes a Prohibited Language Enforcement Engine with configurable phrases, enforcement level, ban duration, permanent-ban toggle, appeal status, moderation logs, and a session-removal screen.
- Supabase schema now includes `moderation_rules` and `moderation_bans` scaffolding alongside `moderation_events` for server-side enforcement wiring.
- Customer Support now uses the three-layer model: Visitor → Maya/Riley/Nova/Sage → Claude → hidden specialist(s) → Claude → same visible agent → Visitor.
- The admin dashboard now includes color-coded AI Support Architecture panels with visible Layer 1 agents, hidden Layer 2 specialists, Claude workflow notes, avatars, working hours, capabilities, auto-response behavior, escalation rules, daily check activity, and support escalation logs.
- The support API now prepares admin escalation payloads with visitor username, issue type, message, timestamp, page URL, device type, browser, optional account or transaction references, hidden specialist assignments, workflow path, specialist report template, and approval-risk flags.
- Added a Claude Control Layer with `/admin/intelligence`, `/api/claude/control`, compact packet rules, approval-gated high-risk actions, multi-agent collaboration plans, and searchable Intelligence Activity Log storage.

## Local Checks

When Node.js is available:

```bash
npm run typecheck
npm run lint
npm run build
```

This project is verified locally with Node `20.20.2` and Corepack pnpm `10.12.1`. The documented deployment path is Vercel, but its project, production environment, domain, and credentials are not connected in this workspace. Use the isolated production verification procedure when the development server is active.
