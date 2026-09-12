import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("referral heatmap migration is additive, production-scoped, and Admin RPC protected", () => {
  const migrationPath = "supabase/migrations/20260816092000_referral_heatmap_analytics.sql";
  assert.ok(existsSync(new URL(`../${migrationPath}`, import.meta.url)));
  const migration = source(migrationPath);
  assert.match(migration, /create or replace function public\.get_referral_heatmap/);
  assert.match(migration, /environment = 'production'/);
  assert.match(migration, /admin_earnings_ledger/);
  assert.match(migration, /status = 'verified'/);
  assert.match(migration, /generate_series\(0, 6\)/);
  assert.match(migration, /generate_series\(0, 11\)/);
  assert.match(migration, /at time zone v_timezone/);
  assert.match(migration, /grant execute[\s\S]*service_role/);
  assert.doesNotMatch(migration, /drop table|truncate|delete from|drop column/i);
  const forwardMigration = source("supabase/migrations/20260818090000_referral_heatmap_attribution_fix.sql");
  assert.match(forwardMigration, /create or replace function public\.get_referral_heatmap/);
  assert.match(forwardMigration, /linked\.attributed_source/);
  assert.match(forwardMigration, /external_referral/);
  assert.match(forwardMigration, /source_type\) not in \('sandbox', 'test', 'test_transaction'\)/);
});

test("heatmap API is Admin-only and returns aggregate CSV data", () => {
  const route = source("app/api/admin/analytics/referral-heatmap/route.ts");
  assert.match(route, /getAdminBySession/);
  assert.match(route, /admin\.role !== "ADMIN"/);
  assert.match(route, /format.*csv|csv/i);
  assert.match(route, /content-disposition/);
  assert.doesNotMatch(route, /user_id|email|ip_address|raw events/i);
});

test("Referring Websites renders both heatmaps and the required empty purchase state", () => {
  const page = source("app/admin/analytics/traffic/page.tsx");
  const component = source("components/admin/ReferralHeatmaps.tsx");
  assert.match(page, /<ReferralHeatmaps initialData=\{heatmapData\} \/>/);
  assert.match(page, /<h1>Referring Websites<\/h1>/);
  assert.match(component, /VISITORS ACTIVITY/);
  assert.match(component, /PURCHASE PEAK HOURS/);
  assert.match(component, /NO PURCHASE ACTIVITY DATA/);
  assert.match(component, /No purchases match the selected filters\./);
  assert.match(component, /America\/Chicago/);
  assert.match(component, /first_touch/);
  assert.match(component, /latest_touch/);
  assert.match(component, /purchaseCategory/);
  assert.match(component, /<small>Impressions<\/small>/);
  assert.match(component, /<small>Purchases<\/small>/);
  assert.match(component, /Retry/);
  assert.match(component, /emptyState=\{purchaseCount === 0\}/);
  assert.match(component, /value="conversion">Conversion rate/);
  assert.match(component, /Conversion rate is qualifying purchase sessions/);
  assert.match(source("lib/analytics/referral-heatmap.ts"), /createEmptyHeatmapCells/);
  assert.match(source("lib/analytics/referral-heatmap.ts"), /summarizeHeatmap/);
  assert.match(source("lib/analytics/referral-heatmap.ts"), /heatmapScaleMaximum/);
});

test("heatmap contract preserves 84 fixed buckets and shared geometry", () => {
  const heatmap = source("lib/analytics/referral-heatmap.ts");
  const migration = source("supabase/migrations/20260818090000_referral_heatmap_attribution_fix.sql");
  assert.match(heatmap, /Array\.from\(\{ length: 84 \}/);
  assert.match(migration, /generate_series\(0, 6\)/);
  assert.match(migration, /generate_series\(0, 11\)/);
  assert.match(heatmap, /HEATMAP_BUCKETS = \["12 AM"[\s\S]*"10 PM"\]/);
  assert.match(heatmap, /PurchaseHeatmapMetric = "purchase_count" \| "revenue" \| "average_order" \| "conversion"/);
  assert.match(source("components/admin/ReferralHeatmaps.tsx"), /sourceOptions = \[[\s\S]*external_referral/);
});
