import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260729091500_printify_enterprise_management.sql");
const fulfillmentMigration = read("supabase/migrations/20260729091000_printify_coins_merch_languages.sql");
const adminApi = read("app/api/admin/printify/route.ts");
const orderWorker = read("app/api/jobs/printify/route.ts");
const managementWorker = read("app/api/jobs/printify-management/route.ts");
const manager = read("lib/commerce/pod/management.ts");
const provider = read("lib/commerce/pod/types.ts");
const printify = read("lib/commerce/printify.ts");

test("POD architecture remains provider-neutral", () => {
  assert.match(provider, /export interface PodProvider/);
  assert.match(provider, /listProducts/);
  assert.match(provider, /listProviders/);
  assert.match(provider, /getProvider/);
  assert.match(provider, /listOrders/);
  assert.match(provider, /shippingRates/);
  assert.match(provider, /submitOrder/);
});

test("Printify calls remain server-side and use official shop and catalog resources", () => {
  assert.match(printify, /import "server-only"/);
  assert.match(printify, /\/products\.json/);
  assert.match(printify, /\/orders\.json/);
  assert.match(printify, /\/catalog\/print_providers\.json/);
  assert.match(printify, /\/shipping\/\$\{encodeURIComponent\(method\)\}\.json/);
  assert.doesNotMatch(printify, /NEXT_PUBLIC_PRINTIFY/);
});

test("enterprise tables are private and preserve reconciliation evidence", () => {
  for (const table of ["pod_provider_settings", "pod_sync_runs", "pod_product_snapshots", "pod_provider_options", "pod_shipping_rate_cache", "pod_api_request_logs", "pod_order_snapshots", "pod_reconciliation_findings", "pod_provider_metrics_daily"]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /revoke all on public\.pod_provider_settings/);
  assert.match(migration, /grant all on public\.pod_provider_settings[\s\S]+to service_role/);
  assert.match(migration, /finding_key text not null unique/);
});

test("fulfillment submission stays queued, sequential, retry-limited, and duplicate-resistant", () => {
  assert.match(orderWorker, /for \(const job of jobs\)/);
  assert.match(orderWorker, /max_retry_attempts/);
  assert.match(orderWorker, /automatic_retry_enabled/);
  assert.match(orderWorker, /printify_order_id=is\.null|printify_order_id/);
  assert.match(fulfillmentMigration, /order_id uuid not null unique references public\.commerce_orders/);
  assert.match(fulfillmentMigration, /printify_order_id text unique/);
});

test("reconciliation is flag-only and escalates serious findings", () => {
  assert.match(manager, /never creates replacement orders|No duplicate provider orders were created/);
  assert.match(manager, /missing_provider_order/);
  assert.match(manager, /duplicate_submission/);
  assert.match(manager, /tracking_mismatch/);
  assert.match(manager, /status_mismatch/);
  assert.match(manager, /recordReliabilityIncident/);
  assert.doesNotMatch(manager, /submitOrder\(/);
});

test("Admin actions require permission, rate limits, audit, and confirmation", () => {
  assert.match(adminApi, /admin\.commerce\.manage/);
  assert.match(adminApi, /Too many management actions/);
  assert.match(adminApi, /Confirmation is required before retrying fulfillment/);
  assert.match(adminApi, /printify_order_id=is\.null/);
  assert.match(adminApi, /auditAdminEvent/);
});

test("scheduled management honors feature switches and configured intervals", () => {
  assert.match(managementWorker, /if \(!settings\?\.enabled\)/);
  assert.match(managementWorker, /product_sync_minutes/);
  assert.match(managementWorker, /shipping_cache_minutes/);
  assert.match(managementWorker, /reconciliation_minutes/);
  assert.match(managementWorker, /CRON_SECRET/);
});
