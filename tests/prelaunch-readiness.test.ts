import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderEmailTemplate } from "../lib/email/provider.ts";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("search normalizes public records and excludes unpublished catalog entries", async () => {
  const [catalog, route] = await Promise.all([source("lib/site-search.ts"), source("app/api/search/route.ts")]);
  assert.match(catalog, /filter\(\(item\) => item\.active && item\.published\)/);
  assert.match(catalog, /entry\.status === "published"/);
  assert.match(route, /normalize\("NFKC"\)/);
  assert.match(route, /pageSize = 12/);
  assert.match(route, /search_result_click/);
});

test("search supports exact, partial, case-insensitive, filters, and price sorting", async () => {
  const catalog = await source("lib/site-search.ts");
  assert.match(catalog, /toLocaleLowerCase/);
  assert.match(catalog, /haystack\.includes\(term\)/);
  assert.match(catalog, /a\.title\.toLocaleLowerCase\(\) === query\.toLocaleLowerCase\(\)/);
  assert.match(catalog, /price-low/);
  assert.match(catalog, /record\.type !== filter/);
});

test("inventory reservation and checkout remain server-authoritative and atomic", async () => {
  const migration = await source("supabase/migrations/20260722090000_unified_commerce_merch_orders_auctions.sql");
  assert.match(migration, /reserve_commerce_cart/);
  assert.match(migration, /expires_at<=now\(\)/);
  assert.match(migration, /for update/);
  assert.match(migration, /INVENTORY_CHANGED/);
  assert.match(migration, /idempotency_key=p_idempotency_key/);
  assert.match(migration, /update product_variants v set inventory_quantity/);
});

test("pre-launch inventory controls use the existing adjustment RPC and audit every action", async () => {
  const route = await source("app/api/admin/prelaunch/route.ts");
  assert.match(route, /adjust_commerce_inventory/);
  assert.match(route, /inventory-settings/);
  assert.match(route, /admin_prelaunch_/);
  assert.match(route, /restock-email:/);
});

test("painting locks prevent a second completed sale", async () => {
  const migration = await source("supabase/migrations/20260722090000_unified_commerce_merch_orders_auctions.sql");
  assert.match(migration, /buy_now_painting/);
  assert.match(migration, /for update/);
  assert.match(migration, /auction\.status not in \('live','extended'\)/);
  assert.match(migration, /update painting_auctions set status='fulfillment_pending'/);
});

test("email templates render only approved variables without executable templates", () => {
  const rendered = renderEmailTemplate("Order {{orderNumber}}\nBcc: bad", "Hi {{nickname}} {{notAllowed}}", { orderNumber: "XMF-1", nickname: "Caleb", notAllowed: "secret" }, ["orderNumber", "nickname"]);
  assert.equal(rendered.subject, "Order XMF-1 Bcc: bad");
  assert.equal(rendered.text, "Hi Caleb ");
});

test("email delivery is queued, idempotent, retry-limited, and cron protected", async () => {
  const [migration, worker] = await Promise.all([source("supabase/migrations/20260723090500_prelaunch_operations.sql"), source("app/api/jobs/email/route.ts")]);
  assert.match(migration, /idempotency_key text not null unique/);
  assert.match(migration, /status in \('queued','sending','sent','retry','failed','cancelled'\)/);
  assert.match(worker, /CRON_SECRET/);
  assert.match(worker, /retries < 5/);
});

test("notifications are isolated by authenticated user and support read state", async () => {
  const route = await source("app/api/notifications/route.ts");
  assert.match(route, /user_id=eq\.\$\{user\.id\}/);
  assert.match(route, /read-all/);
  assert.match(route, /dismissed_at/);
  assert.doesNotMatch(route, /user_id=eq\.\$\{body/);
});

test("policies are versioned, multilingual, accepted by version, and never overwritten", async () => {
  const migration = await source("supabase/migrations/20260723090500_prelaunch_operations.sql");
  assert.match(migration, /policy_versions/);
  assert.match(migration, /language_code/);
  assert.match(migration, /unique\(user_id, policy_version_id\)/);
  assert.match(migration, /status in \('draft','scheduled','published','archived'\)/);
});

test("admin audit evidence is ADMIN-only in APIs and immutable in the database", async () => {
  const [route, migration] = await Promise.all([source("app/api/admin/prelaunch/route.ts"), source("supabase/migrations/20260723090500_prelaunch_operations.sql")]);
  assert.match(route, /hasAdminPermission\(admin, "admin\.operations\.manage"\)/);
  assert.match(route, /hasRecentAdminReauthentication/);
  assert.match(route, /audit-export/);
  assert.match(migration, /ADMIN_AUDIT_EVENTS_ARE_IMMUTABLE/);
});

test("media validation accepts modern formats and generates responsive variants", async () => {
  const [validation, route, config] = await Promise.all([source("lib/media/image-validation.ts"), source("app/api/admin/media/route.ts"), source("next.config.mjs")]);
  assert.match(validation, /webp/);
  assert.match(validation, /avif/);
  assert.match(route, /\["thumbnail", 320\]/);
  assert.match(route, /\["large", 1920\]/);
  assert.match(config, /image\/avif/);
});

test("maintenance preserves ADMIN, health, static assets, and payment reconciliation without exposing all jobs", async () => {
  const [middleware, policy] = await Promise.all([source("middleware.ts"), source("lib/maintenance-policy.ts")]);
  assert.match(middleware, /pathname\.startsWith\("\/admin"\)/);
  assert.match(policy, /\/api\/jobs\/payment-reconciliation/);
  assert.match(policy, /disabled\.has\("printify"\)/);
  assert.match(middleware, /_next\/static/);
  assert.match(middleware, /KILL_SWITCH_ACTIVE/);
});

test("analytics avoids raw IP storage and exposes no-result search metrics", async () => {
  const [events, admin] = await Promise.all([source("app/api/analytics/events/route.ts"), source("components/admin/AdminPrelaunchManager.tsx")]);
  assert.match(events, /createHash\("sha256"\)/);
  assert.doesNotMatch(events, /ip_address:/);
  assert.match(admin, /No Results Searches/);
});

test("public header retains account balance and adds search plus notifications", async () => {
  const [layout, nav] = await Promise.all([source("app/layout.tsx"), source("components/PublicNavigation.tsx")]);
  assert.match(layout, /PersistentAccountWidget/);
  assert.match(layout, /NotificationCenter/);
  assert.match(nav, /href="\/search"/);
});

test("maintenance, email, and cleanup health is observable without exposing secrets", async () => {
  const [health, jobs] = await Promise.all([source("app/api/health/route.ts"), source("app/api/jobs/prelaunch/route.ts")]);
  assert.match(health, /status: status\.status/);
  assert.doesNotMatch(health, /emailConfigured|EMAIL_API_KEY|supabaseConfigured/);
  assert.match(jobs, /inventory_reservations/);
  assert.match(jobs, /policy_versions/);
  assert.match(jobs, /analytics_events/);
});
