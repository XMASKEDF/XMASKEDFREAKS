# 06 Supabase Bible

Status: **PARTIAL / UNVERIFIED**

## Evidence

- Client browser factory: `lib/supabase/client.ts`
- Server REST helper: `lib/admin-auth.ts`
- Service role usage: admin auth, middleware logs, stream settings, support, referrals, Claude logs, feature switches.
- Schema: `supabase/schema.sql`
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

## Authentication

| Area | Status | Evidence |
| --- | --- | --- |
| Standard Supabase auth | PARTIAL | `LiveRoom.tsx` uses Supabase profile upsert and local demo login flow. |
| Admin auth | PARTIAL | Custom `admin_users` and `admin_sessions` tables in `lib/admin-auth.ts`. |
| Admin password hashing | PARTIAL | `bcryptjs` hash/compare in `lib/admin-auth.ts`. |
| Admin 2FA | PLACEHOLDER | Login checks only `^\d{6,8}$`; no TOTP verification. |
| Password reset | PLACEHOLDER | `app/api/admin/password-reset/route.ts` logs request and says email will be sent after mail is connected. |

## RLS

RLS is enabled in `supabase/schema.sql`, but production readiness is **BLOCKED** until policy hardening and access tests are complete.

Critical issue: policies such as `Authenticated users can read admin users`, `Authenticated users can read admin sessions`, `Authenticated users can read security events`, and broad moderation/support setting policies must be converted to true ADMIN-only checks.

## Storage

Status: **MISSING**

No Supabase Storage buckets are defined. Background music, banners, uploads, clips, and protected media storage are unverified.

## Realtime

Status: **MISSING / UNVERIFIED**

No realtime publication setup is in `schema.sql`. Client code uses BroadcastChannel/localStorage for reward notifications, not Supabase Realtime.

## Functions

Status: **MISSING**

No Supabase Edge Functions or SQL functions are present.

## Roles

Status: **PARTIAL**

Tables include `admin_users.role`, but RLS does not use a verified admin role function. Server routes use custom session checks for some admin APIs.

## Backups

Status: **UNVERIFIED**

No Supabase backup schedule or restore drill is documented in code.

## Production Checklist

1. Create production Supabase project.
2. Apply schema as versioned migrations.
3. Add seed data for singleton settings.
4. Harden RLS with admin-role checks.
5. Verify browser anon access to every table.
6. Verify server service-role routes.
7. Configure backups and test restore.
8. Configure storage buckets and signed URL policy.
9. Configure realtime publications only for approved events.
10. Run admin setup/login/session smoke tests.

