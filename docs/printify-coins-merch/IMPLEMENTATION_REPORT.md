# Printify Coins-Only Merchandise Implementation

Date: 2026-07-29

## Status Language

- **Completed**: implemented and verified locally.
- **Existing and verified**: an existing platform system was inspected and reused.
- **Partially completed**: implementation exists, but production evidence is unavailable.
- **Requires Printify credentials**: needs a real shop token and shop ID.
- **Requires tax configuration**: needs an approved tax provider, registrations, nexus decisions, and product codes.
- **Requires billing setup**: needs a valid Printify billing method and live-order eligibility.
- **Requires Admin mapping**: needs local products and variants mapped in ADMIN.
- **Requires real account verification**: cannot be proven by local mocks or source inspection.
- **Blocked**: production activation must remain off.

## Architecture Reused

| Area | Status | Evidence |
| --- | --- | --- |
| Next.js, React, TypeScript, pnpm | Existing and verified | `package.json`, `pnpm-lock.yaml` |
| Supabase database and authentication | Existing and verified | `lib/api-user.ts`, existing migrations |
| Wallet and ledger | Existing and verified | `token_wallets`, `wallet_transactions` |
| Unified cart and checkout | Existing and verified | `PurchaseProvider`, `commerce_carts`, `commerce_cart_items` |
| Physical orders and inventory | Existing and verified | `commerce_orders`, `commerce_order_items`, reservations, inventory events |
| Customer dashboard | Existing and verified | `/account`, `CustomerDashboard` |
| Notifications and email queue | Existing and verified | `customer_notifications`, `email_delivery_jobs` |
| ADMIN merchandise and orders | Existing and verified | `/admin/merch`, `/admin/orders` |
| Privacy-conscious analytics | Existing and verified | `analytics_events` |
| Prior Printify integration | Blocked | No operational integration existed before this update |

No second wallet, cart, checkout, product catalog, order store, customer store, inventory system, notification system, or email system was created.

## Implementation Matrix

| Requirement | Status | Implementation / Remaining Evidence |
| --- | --- | --- |
| Fixed coin value | Completed | `lib/commerce/coins.ts` fixes 1 coin at 50 integer cents |
| 140 coins equals $70 | Completed | Unit-tested integer conversion |
| $500 equals 1,000 base coins | Completed | Unit-tested conversion; existing bonus-package rules remain separate |
| Coins-only physical payment | Completed | No card method is added; physical checkout uses the existing wallet |
| Server-authoritative retail price | Completed | Local `commerce_products.coin_price` remains authoritative |
| Printify product mapping | Requires Admin mapping | Product, blueprint, provider, sync, and enabled fields added |
| Printify variant mapping | Requires Admin mapping | Variant ID, provider SKU, availability, cost, fit, and sync fields added |
| Local branding remains authoritative | Completed | Printify synchronization does not overwrite public copy, media, URLs, categories, or coin prices |
| Shipping address collection | Completed | Existing checkout form reused and quote invalidates when address changes |
| Destination validation | Partially completed | Required fields and product destination flags enforced; provider support requires a live quote |
| Domestic shipping | Requires Printify credentials | Uses Printify shop shipping endpoint; no universal rate exists |
| International shipping | Requires real account verification | Requires a supported mapped provider, address, shipping quote, and tax result |
| Tax calculation | Requires tax configuration | Provider adapter added; it fails closed and fabricates no tax rate |
| Whole-coin rounding | Completed | Shipping and tax each round upward from cents |
| Itemized checkout | Completed | Merchandise, shipping, applicable tax, total, wallet, and dollar equivalent displayed |
| Quote architecture | Completed | Server-stored 15-minute, customer-owned, single-use quote |
| Quote expiry and ownership | Completed | Checked inside the atomic database function |
| Wallet sufficiency | Completed | Wallet row is locked and negative balances are rejected |
| Atomic wallet deduction | Completed | One database function owns quote, wallet, order, ledger, inventory, and job creation |
| Wallet ledger integration | Completed | One existing-format deduction with an itemized `commerce_breakdown` |
| Order financial record | Completed | Cent and coin components, rate, rounding, costs, margin, and timestamp columns added |
| Printify submission architecture | Completed | Local transaction commits before a queued job can submit |
| Duplicate local purchase protection | Completed | Quote, order idempotency, and database uniqueness |
| Duplicate Printify protection | Completed | One job per order plus stable local order external ID |
| Concurrent completion protection | Partially completed | Row locks and unique constraints verified in migration; live database race test still required |
| Customer dashboard | Completed | Order breakdown and tracking link are surfaced without internal costs |
| Notification integration | Completed | Existing order trigger plus idempotent processing/shipping/delivery notifications |
| Email integration | Completed | Existing queue reused; delivery remains asynchronous |
| Tracking synchronization | Partially completed | Signed webhook receiver implemented; live webhook delivery must be verified |
| ADMIN language controls | Completed | Create, enable, publish, unpublish, and reorder by sort value |
| Public Language filter | Completed | Exact requested placement, multi-select, combined matching, and URL persistence |
| ADMIN mapping controls | Completed | Separate protected Printify mapping panel |
| ADMIN margin view | Partially completed | Public equivalent and mapped production margin shown; live costs need synchronization |
| Analytics | Completed | Quote, purchase, fulfillment submission, shipping, and delivery events use existing analytics |
| Audit trail | Completed | ADMIN changes use existing audit log; system/provider events use fulfillment events |
| Disabled mode | Completed | Default; no job is claimed or order submitted |
| Test mode | Partially completed | Worker supports test mode, but a controlled ADMIN test-order creator is not enabled |
| Live mode | Blocked | Must remain disabled until every production gate below passes |

## Security and Consistency

- Printify and tax credentials are server-only.
- Browser requests never provide trusted shipping, tax, conversion, bonus, or final coin values.
- Raw provider responses and internal cost or margin values are not shown to customers.
- Quote ownership, expiry, state, price, destination rules, fulfillment mapping, inventory reservation, and wallet balance are revalidated in the database transaction.
- Wallet and quote rows are locked before mutation.
- The quote can produce only one order, and an order can produce only one fulfillment job.
- The customer wallet is never sent to Printify.
- Webhook payloads require an HMAC signature before they can update local fulfillment state.
- Worker access requires `CRON_SECRET`.
- ADMIN mapping and language mutations require ADMIN role and 2FA and are audit logged.

## Database Changes

Migration: `supabase/migrations/20260729_printify_coins_merch_languages.sql`

- Adds local Printify product and variant mappings.
- Adds ADMIN-managed merchandise languages and product assignments.
- Adds checkout quotes with exact cents, coins, rounding, provider, and expiry.
- Extends order financial records and fulfillment tracking.
- Adds one idempotent fulfillment job per order.
- Adds fulfillment system/provider events.
- Adds an atomic coins-only physical checkout function.
- Adds a `FOR UPDATE SKIP LOCKED` job claimant.
- Preserves all existing records and tables.

## Environment

Required before live fulfillment:

```dotenv
PHYSICAL_MERCH_PAYMENT_MODE=coins_only
PRINTIFY_INTEGRATION_MODE=disabled
PRINTIFY_API_TOKEN=
PRINTIFY_SHOP_ID=
PRINTIFY_WEBHOOK_SECRET=
TAX_API_URL=
TAX_API_KEY=
CRON_SECRET=
```

`PRINTIFY_INTEGRATION_MODE` must stay `disabled` until rollout approval. The coin value is an immutable server constant in `lib/commerce/coins.ts`; it is not accepted from requests or public environment variables.

## Validation Results

| Validation | Result |
| --- | --- |
| TypeScript | Passed with `tsc --noEmit` |
| ESLint | Passed with zero warnings or errors |
| i18n integrity | Passed |
| New focused tests | 8 passed, 0 failed |
| Full repository tests | 119 passed, 0 failed |
| Next.js production build | Passed; 76 pages generated and style artifact verified |
| Production start smoke | Passed: `/merch` 200, `/account` 200, `/api/health` 200, protected `/admin/merch` redirected to login |
| One coin / 140 coins / $500 conversion | Passed |
| Shipping and tax upward rounding | Passed |
| Quote lock, ownership, wallet lock, and idempotency source checks | Passed |
| Filter order and URL-state source checks | Passed |
| US test order | Blocked: credentials, tax configuration, mapping, billing, and controlled account required |
| International test order | Blocked: same requirements plus confirmed destination support |
| Live concurrency test | Requires real account verification and migrated test database |
| Printify shop retrieval | Requires Printify credentials |
| Real product retrieval | Requires Printify credentials and Admin mapping |
| Real shipping quote | Requires Printify credentials |
| Printify order appears in account | Requires billing setup and controlled test |
| Webhook/tracking delivery | Requires real account verification |

## Launch Blockers

1. Apply the new migration to a non-production Supabase environment.
2. Configure a real Printify shop token, shop ID, webhook secret, billing method, and print provider.
3. Map every sellable local product and variation in ADMIN.
4. Verify production cost and acceptable margin for every mapped variation.
5. Configure a lawful tax provider, registrations, nexus rules, and product tax codes.
6. Retrieve the real shop, product, and variation through the integration.
7. Run one controlled US order and one supported international order.
8. Run the same-quote concurrent completion test against the migrated database.
9. Confirm exactly one deduction, order, ledger entry, job, provider order, notification, and email.
10. Confirm signed status and tracking webhooks update the customer dashboard.
11. Only then change `PRINTIFY_INTEGRATION_MODE` to `live`.

## Known Limits

- Printify connectivity, billing, shipping, fulfillment, and webhook delivery are **UNVERIFIED** without credentials.
- Tax collection is intentionally blocked until an approved provider is configured.
- Browser Back/Forward preserves the URL values on navigation and refresh; an in-page `popstate` listener is not required because this page is re-rendered by navigation, but should be verified in browser QA.
- Production-cost synchronization currently accepts ADMIN-verified values; automatic product-cost synchronization requires a real account test.
- No refund behavior was added or changed.
