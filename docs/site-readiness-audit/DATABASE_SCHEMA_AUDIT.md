# Database Schema Audit

Schema file: `supabase/schema.sql`  
Status: **SCHEMA PRESENT, NOT APPLIED OR VERIFIED**

## Tables Found

The schema defines tables for:

- Profiles, authentication policy, trusted devices, TOTP factors, recovery codes, password reset events.
- Tip events, live access sessions, access contributions, redirects, access settings, access audit events.
- Cost providers, cost snapshots, budgets, and alerts.
- Live email subscribers, notification templates, campaigns, and deliveries.
- Stream settings and support messages.
- Background music playlists, tracks, and logs.
- Missing translation events.
- Redirect logs, redirect manager settings/logs, campaigns, referral events, referral rollups.
- Geo visitor sessions, country rollups, reports, and restricted security reviews.
- Wallet transactions, coin packages, payment methods, payment intents, payment webhook events.
- Historical schema still contains international payment metadata fields; current application code uses canonical USD pricing and no visible converter interface.
- Coin policy settings, acknowledgements, and audit events.
- Security events, rules, settings, and alerts.
- Moderation events, rules, bans, and platform lockdown.
- Game scores, catalog, sessions, issue reports.
- AI engagement messages and intelligence activity logs.
- Admin audit events, admin users, admin sessions, admin password reset events, feature switches.
- Performance power settings and logs.

## Code-To-Table References Verified By Static Scan

| Code Table Reference | Schema Table Exists |
| --- | --- |
| `profiles` | Yes |
| `missing_translation_events` | Yes |
| `game_scores` | Yes |
| `game_sessions` | Yes |
| `tip_events` | Yes |
| `moderation_events` | Yes |
| `support_messages` | Yes |
| `stream_settings` | Yes |
| `security_events` | Yes |
| `redirect_manager_logs` | Yes |
| `admin_users` | Yes |
| `admin_sessions` | Yes |
| `admin_audit_events` | Yes |
| `admin_feature_switches` | Yes |
| `intelligence_activity_logs` | Yes |

## Risks

- Schema has not been applied to a real Supabase project in this audit.
- RLS policies, indexes, constraints, and migrations were not runtime verified.
- Client-side writes exist in `LiveRoom.tsx`; RLS must be strict before public launch.
- Payment and wallet tables exist, but real payment webhook reconciliation is not implemented.
- Access-control API currently returns JSON state and does not persist every session state server-side.

## Required Database Actions

1. Create a Supabase project.
2. Run `supabase/schema.sql` in SQL Editor or convert it into versioned migrations.
3. Verify all server routes can read/write expected tables.
4. Add/verify RLS policies for all browser-writeable tables.
5. Add seed data for admin feature switches, stream settings, coin packages, global payment settings, and access control.
6. Test admin setup, login, session expiry, and audit logging.
7. Test payment/webhook idempotency once a real processor is added.
