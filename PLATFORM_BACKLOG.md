# Platform Build Backlog

This repo now includes frontend scaffolds and database tables for the larger platform spec. These items require real backend services, payment processors, CDN provider APIs, or security infrastructure before production.

## Implemented In This Build

- `/sandbox` visual testing mode with preloaded state and sandbox toolbar.
- Exact requested tip menu and token pricing.
- Stronger 18+ compliance gate with required confirmations and original policy language.
- Video-first live room with chat, wallet display, quick tip, theater mode, and live notifications.
- Mux, Bunny Stream, and Cloudflare Stream provider selector.
- `/go` deterministic redirect route scaffold using America/Chicago schedule and OBS env flag.
- AI support widget with Maya, plus Riley, Nova, and Sage routing language.
- FAQ section.
- Mini-game floating window, Pac-Mask Chase, Space Invader Sweep, leaderboard hooks, and Todd admin-monitor copy.
- 728x90 XMASKEDFREAKS live banner overlay and creator dashboard banner controls.
- Runtime multilingual localization system with locale JSON files, detection, searchable selector, fallback, missing-key logging, saved preference, footer switcher, and localized AI support routing.
- Automatic time-zone localization with internal platform scheduling, visitor-local public schedules, saved preferences, and footer selector.
- Admin Geo Dashboard with sample active visitor intelligence, dynamic country clocks, clickable country map, filters, active visitor table, geographic reports, `/api/geo` scaffold, and Supabase geo tables.
- Live Notification Manager with editable email announcement templates, default `HURRY THEY'RE LIVE!!!!` message, desktop/mobile preview, stream-active verification, cooldown protection, campaign history, opt-in settings, and API/schema scaffolding.
- Tokenized tipping scaffold with explicit card-save consent, masked saved payment methods, fast future tips, duplicate-tip protection, risk thresholds, idempotent payment intents, and webhook dedupe tables.
- Client-side prohibited-language enforcement scaffold.
- Supabase tables for redirects, campaigns, referrals, wallet transactions, security events, moderation events, lockdown, game scores, AI engagement messages, admin audit events, admin users, support, and stream settings.

## Production Work Still Needed

- Real payment processor integration and saved-card/wallet tokenization.
- Payment processor customer vault, SCA/3DS step-up verification, fraud scoring, idempotent webhook processing, and payment-method lifecycle management.
- Real-time global notifications via Supabase Realtime or another websocket service.
- Production IP geolocation provider, encrypted IP storage, retention controls, privacy consent/disclosure handling, and restricted security-view RBAC for Geo Dashboard investigations.
- CDN/stream provider API integration for OBS live status detection.
- Admin RBAC and first-admin setup routes with secure password hashing and 2FA.
- Edge/CDN DDoS protection, rate limiting, IP intelligence, and Cloudflare rules.
- Email delivery service for live alerts, support escalations, and deposit notifications.
- Email compliance layer for consent records, unsubscribe links, suppression lists, bounce handling, campaign metrics, and deliverability monitoring.
- Professional human/legal review for every production translation, especially Terms, Privacy, Refund, DMCA, and compliance copy.
- Full referral/campaign analytics dashboards with charts and date filters.
- Server-side moderation bans using IP/device/account signals.
- Full server-side persistence for admin-managed games, banner settings, tip menus, and leaderboards.
- Backend schedule/admin APIs that enforce internal platform-time storage while returning visitor-local display metadata for global users.
- Audio processing for the video element using Web Audio API where browser support allows it.
