# Production Backbone

This document records the operational layer added on 2026-08-16. It describes architecture and verification status; it is not a claim that external providers, production Supabase, or tax/accounting providers are connected.

## Central services

- `lib/risk/index.ts` is the server-side RiskEngine. It normalizes risk score, level, reasons, recommended action, review requirement, and event ID. It excludes protected characteristics and filters sensitive metadata before persistence.
- `lib/entitlements/index.ts` is the EntitlementService. It checks the additive `platform_entitlements` authority first and preserves the existing `purchase_entitlements` fallback for Audio Clips. Active access is server checked and expiry is enforced.
- `lib/cost-control/index.ts` is the CostControlEngine. It normalizes fixed, recurring, usage, manual, estimated, provider, and additive `cost_entries` records. Estimates are labeled as estimates and never invent provider fees.
- `lib/accounting/index.ts` provides tax and accounting-provider adapter boundaries. `NoTaxProvider` and `NoAccountingProvider` are explicit no-op states until an approved provider or manual policy is configured.
- `lib/launch/readiness.ts` provides a server-side readiness report with explicit GREEN/YELLOW/RED checks. A payment provider is not treated as ready when `PAYMENT_PROVIDER=disabled` or `setup_in_progress`; backups remain RED until verified.

## Admin surfaces

- `/admin/system/backbone` is protected by the ADMIN role and `admin.operations.manage` permission.
- `/api/admin/backbone` exposes only bounded operational records, no secrets, raw card data, or full payment credentials. Mutating actions require the Admin session, a reason, and an audit event.
- `/api/admin/accounting/export?format=csv|json` requires recent Admin reauthentication and an audit event. It returns an ephemeral download response, not a public URL.
- The Admin dashboard includes Risk Center, Entitlements, Accounting, Support Cases, Media Rights, and Production Backbone cards.
- Infrastructure health now reports Risk Engine, Entitlement Service, and Cost Control as distinct operational services.

## Database

`supabase/migrations/20260816_fraud_entitlements_accounting_support_rights_launch.sql` is additive. It creates risk events, platform entitlements, support cases/messages, media rights, tax records, accounting adjustments, cost entries, and readiness runs. It enables RLS and leaves access to the existing service-role workflows. It does not delete or rewrite wallet, order, payment, customer, or legacy entitlement rows.

The migration has not been applied from this workspace because production Supabase credentials and a safe migration target were not available. Apply it only through the project’s normal Supabase migration workflow after staging review and backup verification.

## Protected access behavior

The Audio Clips download route now calls `assertEntitlement` before issuing a short-lived private Storage URL. Existing legacy order-item lookup remains in place for the file path and download counter. Missing entitlement attempts are recorded as privacy-filtered risk events when persistence is available.

Customer support cases can be created and listed through `/api/support/cases`; customer reads are limited to the authenticated customer ID. Admin case status changes remain behind the Admin command center.

## Explicit blockers and unverified items

- Supabase migration application and live RLS verification: **UNVERIFIED**.
- Segpay/CCBill settlement and payment webhooks: **NOT CONNECTED**.
- Tax rates/provider and accounting platform adapter: **NOT CONFIGURED**.
- Durable queue, external monitoring, backups/PITR, CDN/WAF, and production cost APIs: **UNVERIFIED**.
- Full production build was not run because the existing development server must remain undisturbed. Typecheck, lint, backbone architecture tests, i18n, and style tests pass.

