# 04 Database Bible

## Reliability Evidence Migration

Migration: `supabase/migrations/20260729_reliability_incident_management.sql`

| Object | Why it exists | Production status |
| --- | --- | --- |
| `reliability_incidents` | Grouped current incident state and impact | UNVERIFIED until migration is applied |
| `reliability_occurrences` | Append-only evidence for every repeated occurrence | UNVERIFIED |
| `reliability_incident_actions` | Append-only administrator and recovery audit | UNVERIFIED |
| `reliability_alerts` | Deduplicated alert delivery queue | UNVERIFIED |
| `reliability_health_snapshots` | Historical internal health results | UNVERIFIED |
| `reliability_circuit_breakers` | Persistent provider breaker evidence for a future distributed worker | UNVERIFIED |
| `reliability_deployments` | Deployment health and rollback references | UNVERIFIED; no deployment provider connected |
| `reliability_backups` | Backup and restore-test evidence | UNVERIFIED; no backup provider connected |
| `reliability_incident_links` | Related, duplicate, caused-by, and follow-up relationships | UNVERIFIED |
| `reliability_postmortems` | Required severity 4/5 review record | UNVERIFIED |
| `reliability_retention_settings` | Evidence retention periods and reasons | UNVERIFIED |
| `wallet_integrity_holds` | Blocks spending when wallet and signed ledger disagree | UNVERIFIED |

All tables have RLS enabled and revoke direct `anon` and `authenticated` access. Service-role calls remain behind protected server routes. Occurrence and action rows reject updates and deletes.

`scan_wallet_integrity()` compares `token_wallets.balance_tokens` with completed signed `wallet_transactions.total_coins`, creates or refreshes a hold for mismatches, and never modifies either source. `record_reliability_incident(jsonb)` groups repeated fingerprints while adding immutable occurrences.

## Secure ADMIN Tables (2026-07-29)

Migration: `supabase/migrations/20260729_secure_admin_control_center.sql`

| Table / change | Why it exists | Protection | Verification |
| --- | --- | --- | --- |
| `admin_users` security columns | Stores display/recovery profile, Super Admin marker, permission overrides, one-time setup state, and password-change time | Service-role only; password remains bcrypt | Apply migration, complete first setup, inspect server record |
| `admin_sessions` security columns | Enforces absolute expiry, inactivity expiry, remembered-device duration, device hash, and revocation reason | Hashed tokens; RLS; no public policy | Login, idle-expire, logout-all, and tampered-token tests |
| `admin_security_settings` | Single server authority for email 2FA and session timeouts | RLS plus revoked anon/authenticated grants | Toggle through `/admin/security` as Super Admin |
| `admin_login_challenges` | Hashed, expiring, single-use email verification codes with attempt limits | RLS plus revoked anon/authenticated grants | Staging email login, expiry, replay, and fifth-failure test |
| `admin_recovery_codes` | One-time recovery material stored only as bcrypt hashes | RLS plus revoked anon/authenticated grants | Generate codes and confirm plaintext is returned once |
| `admin_login_history` | Restricted success/failure/lock/device evidence | RLS plus revoked anon/authenticated grants | Successful and failed staging login |
| `admin_password_reset_events` additions | Single-use hashed reset tokens and expiry | Existing admin-only table plus service access | Reset password and confirm all earlier sessions are revoked |

Production status: **UNVERIFIED** until this migration is applied to the production Supabase project.

Source: `supabase/schema.sql`

Status: **PARTIAL / UNVERIFIED**

The schema file defines tables and RLS policies. It does not define migrations, indexes, triggers, SQL functions, enums, storage buckets, realtime publication rules, or seed inserts.

## Object Counts

| Object Type | Count / Status |
| --- | --- |
| Tables | 69 |
| RLS enabled statements | 69 |
| Policies | 56 detected |
| Relationships | 12 explicit `references public.*` relationships plus `profiles.id -> auth.users(id)` |
| Indexes | MISSING |
| Triggers | MISSING |
| SQL functions | MISSING |
| Enums | MISSING |
| Storage buckets | MISSING |
| Realtime subscriptions/publications | MISSING |
| Seed inserts | MISSING |
| Migration files | MISSING; single schema file only |

## Tables And Purpose

| Table | Why It Exists |
| --- | --- |
| `profiles` | User profile, display name, locale, country, timezone, wallet balance, two-factor preference. |
| `auth_trusted_devices` | Remember trusted devices for optional 2FA. |
| `auth_totp_factors` | Store TOTP factor references. |
| `auth_recovery_codes` | Store hashed recovery codes. |
| `auth_password_reset_events` | Audit standard-user password resets. |
| `auth_policy_settings` | Store auth policy knobs. |
| `tip_events` | Record live tip events. |
| `live_access_sessions` | Track protected live viewing sessions. |
| `live_access_contributions` | Record paid access extensions. |
| `live_access_redirects` | Log access-lock redirects. |
| `access_control_settings` | Admin settings for paid access rules. |
| `access_control_audit_events` | Audit access-control changes. |
| `cost_providers`, `cost_snapshots`, `cost_budgets`, `cost_alerts` | Cost dashboard data. |
| `login_events` | User login audit trail. |
| `live_email_subscribers`, `live_notification_templates`, `live_notification_campaigns`, `live_notification_deliveries` | Live email notification system. |
| `stream_settings` | Video provider configuration. |
| `support_messages`, `support_agent_settings` | Customer support and agent settings. |
| `background_music_playlists`, `background_music_tracks`, `background_music_logs` | Lobby music system. |
| `missing_translation_events` | Missing localization logging. |
| `redirect_logs`, `redirect_manager_settings`, `redirect_manager_logs` | Redirect manager and campaign route logging. |
| `campaigns`, `referral_events`, `referral_source_rollups` | Campaign and referral analytics. |
| `geo_visitor_sessions`, `geo_country_rollups`, `geo_reports`, `geo_security_reviews` | Geo dashboard and restricted security view. |
| `wallet_transactions`, `coin_packages`, `payment_methods`, `payment_intents`, `payment_webhook_events` | Wallet, packages, tokenized payment metadata, and webhook dedupe. |
| `global_payment_settings`, `payment_country_rules`, `payment_currency_rules`, `exchange_rate_cache`, `international_payment_analytics` | International payment and currency rules. |
| `coin_policy_settings`, `coin_policy_acknowledgements`, `coin_policy_audit_events` | Coin usage disclosure system. |
| `security_events`, `security_rules`, `security_settings`, `security_alerts` | Security dashboard and middleware logs. |
| `moderation_events`, `moderation_rules`, `moderation_bans`, `platform_lockdown` | Moderation and emergency controls. |
| `game_scores`, `game_catalog`, `game_sessions`, `game_issue_reports` | Games and leaderboards. |
| `ai_engagement_messages`, `intelligence_activity_logs` | AI engagement and Claude activity logs. |
| `admin_audit_events`, `admin_users`, `admin_sessions`, `admin_password_reset_events`, `admin_feature_switches` | Admin authentication, sessions, audit, and feature switches. |
| `performance_power_settings`, `performance_power_logs` | Adaptive performance engine settings/logs. |

## Explicit Relationships

- `profiles.id` references `auth.users(id)`.
- `live_access_contributions.access_session_id` references `live_access_sessions.id`.
- `live_access_redirects.access_session_id` references `live_access_sessions.id`.
- `cost_snapshots.provider_id` references `cost_providers.id`.
- `cost_alerts.provider_id` references `cost_providers.id`.
- `live_notification_campaigns.template_id` references `live_notification_templates.id`.
- `live_notification_deliveries.campaign_id` references `live_notification_campaigns.id`.
- `background_music_tracks.playlist_id` references `background_music_playlists.id`.
- `background_music_logs.playlist_id` references `background_music_playlists.id`.
- `background_music_logs.track_id` references `background_music_tracks.id`.
- `payment_intents.coin_package_id` references `coin_packages.id`.
- `payment_intents.payment_method_id` references `payment_methods.id`.
- `payment_webhook_events.payment_intent_id` references `payment_intents.id`.
- `admin_sessions.admin_user_id` references `admin_users.id`.
- `admin_password_reset_events.admin_user_id` references `admin_users.id`.
- `admin_feature_switches.last_changed_by` references `admin_users.id`.
- `performance_power_settings.updated_by` references `admin_users.id`.

## RLS Policies

RLS is enabled for every table in the schema file. Policies exist for profile ownership, user-owned auth records, tip creation, recent tip reads, live access session ownership, cost provider admin reads, live email subscription, coin package reads, wallet/payment ownership, global payment admin management, support message creation, stream settings reads, redirect/referral/security/moderation/game/intelligence/admin table access.

Critical review finding: several policies use broad `authenticated` access for sensitive tables such as admin audit/users/sessions, security rules/events, moderation rules/bans, support agent settings, redirect manager logs, and global payment settings. These must be replaced with real admin-role checks before launch.

## Hosted Payments Migration

`20260729_hosted_checkout_provider_neutral.sql` adds:

- `hosted_payments`: server-authoritative expected amount, currency, package, coin totals, provider, lifecycle, idempotency, and reconciliation state.
- `hosted_payment_events`: immutable, deduplicated evidence for verified callback events.
- `hosted_payment_reconciliation`: unresolved financial integrity findings.
- `wallet_transactions.hosted_payment_id`: one-to-one linkage preventing duplicate credit.
- `confirm_hosted_coin_payment`: atomic validation, wallet credit, ledger write, confirmation, receipt job, and analytics.
- `scan_hosted_payment_reconciliation`: read-only detection of missing ledger credits, unsupported ledger credits, and stuck payments.

Migration application against production Supabase remains **UNVERIFIED**.

## Missing Database Production Pieces

- Versioned migrations.
- Seed data for singleton settings.
- Indexes for high-volume tables.
- Triggers for `updated_at`.
- Stored procedures for wallet credit/debit atomicity.
- Storage bucket definitions.
- Realtime publication configuration for tips/chat/notifications.
- Backup schedule and restore evidence.
