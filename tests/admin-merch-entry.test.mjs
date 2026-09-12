import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("Admin Merch has one shared product-entry panel", () => {
  const manager = source("components/admin/AdminMerchManager.tsx");
  const panel = source("components/admin/AdminMerchCreatePanel.tsx");
  const route = source("app/api/admin/merch/route.ts");

  assert.match(manager, /AdminMerchCreatePanel/);
  assert.match(manager, /onSubmit=\{action\}/);
  assert.match(manager, /scrollIntoView/);
  for (const field of ["PRODUCT NAME", "CATEGORY", "PRICE (USD)", "SHIPPING COST", "SHIPPING MODE", "FULFILLMENT", "PRODUCT BIO", "INVENTORY \/ QUANTITY", "STATUS", "QUANTITY LIMIT", "PRODUCT IMAGES"]) {
    assert.match(panel, new RegExp(field.replace(/[()\/]/g, "\\$&")));
  }
  assert.match(panel, /action: "product-create"/);
  assert.match(route, /productEntry/);
  assert.match(route, /parseUsdToCents/);
  assert.match(route, /centsToCoinsCeil/);
  assert.match(route, /safeImageList/);
  assert.match(route, /parseWholeNumber/);
  assert.match(route, /SKU MUST BE UNIQUE/);
  assert.match(route, /auditAdminEvent/);
});

test("Admin Merch migration is additive and preserves existing accounting fields", () => {
  const migration = source("supabase/migrations/20260820090000_admin_merch_product_entry.sql");
  assert.match(migration, /add column if not exists price_minor/);
  assert.match(migration, /add column if not exists shipping_cost_minor/);
  assert.match(migration, /add column if not exists shipping_mode/);
  assert.match(migration, /add column if not exists fulfillment_type/);
  assert.match(migration, /on conflict \(slug\) do nothing/);
  assert.doesNotMatch(migration, /drop table|truncate table|delete from public\.commerce_products/i);
});
