import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("Merch category art uses centralized transparent emblem paths with legacy fallbacks", () => {
  const catalog = source("lib/commerce/catalog.ts");
  const emblem = source("components/merch/MerchCategoryEmblem.tsx");
  for (const name of ["hoodie", "shirt", "mug", "hat"]) {
    assert.match(catalog, new RegExp(`/images/merch/categories/${name}\\.png`));
    assert.match(catalog, new RegExp(`/images/merch/categories/${name}\\.jpg`));
  }
  assert.doesNotMatch(catalog, /shorts\\.(?:png|jpg)/);
  assert.match(catalog, /merchCategoryFallbackImage/);
  assert.match(catalog, /merchCategoryCustomImage/);
  assert.match(catalog, /id: "cat-hoodies", name: "Hoodies", slug: "hoodies"/);
  assert.doesNotMatch(catalog, /cat-shorts|name: "Shorts", slug: "shorts"/);
  assert.match(catalog, /id: "cat-hats", name: "Hats", slug: "hats"/);
  assert.match(catalog, /\["hoodies", "After Dark Hoodie"/);
  assert.match(emblem, /onError/);
  assert.match(emblem, /merchandise/);
  assert.ok(emblem.indexOf("merchCategoryCustomImage(category.slug)") < emblem.indexOf("category.imageUrl"));
});

test("Shorts is retired without deleting merchandise history", () => {
  const migration = source("supabase/migrations/20260821090000_retire_shorts_merch_category.sql");
  const seed = source("supabase/migrations/20260820090000_admin_merch_product_entry.sql");
  const adminRoute = source("app/api/admin/merch/route.ts");
  assert.match(migration, /is_active = false/);
  assert.match(migration, /is_published = false/);
  assert.match(migration, /fulfillment_enabled = false/);
  assert.match(migration, /is_hidden = true/);
  assert.doesNotMatch(migration, /delete from|truncate/i);
  assert.doesNotMatch(seed, /'Shorts'|'shorts'/);
  assert.match(adminRoute, /shorts-custom-\$\{Date\.now\(\)\}/);
});

test("the existing Merch category slot remains fixed and transparent", () => {
  const styles = source("app/globals.css");
  const storefront = source("components/merch/MerchStorefront.tsx");
  assert.match(styles, /\.merch-category-emblem \{ width: 2rem; height: 2rem; flex: 0 0 2rem; object-fit: contain;[^}]*background: transparent/);
  assert.match(storefront, /<MerchCategoryEmblem category=\{category\} \/>/);
  assert.match(storefront, /onClick=\{\(\) => setCategoryId\(category\.id\)\}/);
});
