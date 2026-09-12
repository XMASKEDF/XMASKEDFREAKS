# Security Dependency Map

Verified from the repository on 2026-08-03. This map describes code ownership, not production-provider availability.

| Trust boundary | Authority | Primary evidence | Failure posture |
|---|---|---|---|
| Public request entry | Next.js middleware | `middleware.ts`, `lib/security.ts`, `lib/security/request.ts` | Blocks scored abuse, cross-origin state changes, oversized payloads, and active maintenance scopes. Cloud edge enforcement remains external. |
| Customer identity | Supabase Auth cookie/session | `lib/api-user.ts`, `lib/supabase/*` | Protected APIs reject missing users. Customer isolation ultimately depends on deployed RLS. |
| Admin identity | Hashed database session or signed local development session | `lib/admin-auth.ts`, `/api/admin/*` | Server checks session, role, permissions, inactivity, expiry, lockout, and recent reauthentication. |
| Critical Admin actions | Super Admin plus recent password reauthentication | `/api/admin/maintenance`, `/api/admin/security`, customer wallet/restriction APIs | Fails closed when authority, recency, or database evidence is unavailable. |
| Wallet | PostgreSQL RPC and immutable transaction rows | wallet migrations, `lib/purchase/server.ts`, hosted-payment callback | Browser amounts are ignored; atomic RPCs lock balances and use idempotency. |
| Hosted payments | Provider adapter, verified webhook, confirmation RPC | `lib/payments/*`, `/api/webhooks/payments/[provider]` | Browser return never credits funds. Production stays disabled without approved provider configuration. |
| Orders and fulfillment | PostgreSQL order RPCs and server-side Printify queue | `lib/commerce/*`, `/api/jobs/printify` | Queues preserve failed jobs; provider submissions are server-only and idempotent. |
| Protected downloads | Entitlement query plus signed short-lived response | `/api/audio-clips/[productId]/download`, commerce migrations | Rejects missing ownership and does not expose permanent private paths. |
| Uploads | Admin session, permissions, size/type/signature checks, private storage | `lib/media/validation.ts`, `/api/admin/media` | Rejects unsupported or malformed files. Malware scanning is not connected. |
| Maintenance | Single Supabase row, append-only history, Edge middleware | `lib/maintenance.ts`, `/api/admin/maintenance`, `20260803_security_hardening_emergency_maintenance.sql` | Inactive by default. Full mode preserves Admin, legal, health, reconciliation, and verified callbacks. |
| Reliability and Security Center | Restricted service-role reads | `lib/reliability/*`, `/api/admin/security-center` | Shows UNVERIFIED when provider evidence is absent rather than inventing health. |
| Translation | Locale cookie and static catalogs | `lib/i18n.ts`, `public/locales/*` | English fallback is retained; maintenance copy exists in all current catalogs. |

## Shared-system change rule

Security, wallet, payment, order, and maintenance changes must be additive and server-authoritative. Client controls may request an action but cannot establish identity, price, balance, access, payment confirmation, or maintenance state.
