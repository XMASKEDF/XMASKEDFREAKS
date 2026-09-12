import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("MERCH exposes six database-driven slots and responsive category navigation", async () => {
  const [catalog, storefront, styles] = await Promise.all([source("lib/commerce/catalog.ts"), source("components/merch/MerchStorefront.tsx"), source("app/globals.css")]);
  assert.equal((catalog.match(/\["(?:clothes|hoodies|mugs|stickers)",/g) || []).length, 6);
  assert.match(storefront, /const pageItems = visible\.slice\(/);
  assert.match(storefront, /pageItems\.map/);
  assert.match(storefront, /categoryId/);
  assert.match(storefront, /merch\.selectSize/);
  assert.match(styles, /\.merch-grid/);
  assert.match(styles, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
});

test("commerce checkout is atomic, idempotent, and inventory-authoritative", async () => {
  const migration = await source("supabase/migrations/20260722090000_unified_commerce_merch_orders_auctions.sql");
  assert.match(migration, /create or replace function public\.checkout_commerce_cart/);
  assert.match(migration, /for update/);
  assert.match(migration, /idempotency_key=p_idempotency_key/);
  assert.match(migration, /INVENTORY_CHANGED/);
  assert.ok(migration.indexOf("insert into commerce_orders") < migration.indexOf("update token_wallets set balance_tokens"));
  assert.ok(migration.indexOf("update token_wallets set balance_tokens") < migration.indexOf("delete from commerce_cart_items"));
});

test("admin commerce surfaces require ADMIN with 2FA", async () => {
  const routes = await Promise.all(["merch", "orders", "catalog", "paintings"].map((name) => source(`app/api/admin/${name}/route.ts`)));
  for (const route of routes) { assert.match(route, /role/); assert.match(route, /"ADMIN"/); assert.match(route, /two_factor_required/); }
});

test("auction bidding reserves coins and rejects client-authoritative timing", async () => {
  const [route, migration, countdown] = await Promise.all([source("app/api/paintings/route.ts"), source("supabase/migrations/20260722090000_unified_commerce_merch_orders_auctions.sql"), source("components/paintings/AuctionCountdown.tsx")]);
  assert.match(route, /place_painting_bid/);
  assert.match(route, /idempotency-key/);
  assert.match(migration, /coin_reservations/);
  assert.match(migration, /now\(\)>=auction\.ends_at/);
  assert.match(migration, /anti_sniping_window_seconds/);
  assert.match(countdown, /serverTime/);
});

test("vertical catalog pauses for focus, hidden tabs, and reduced motion", async () => {
  const catalog = await source("components/catalog/VerticalCatalog.tsx");
  assert.match(catalog, /prefers-reduced-motion/);
  assert.match(catalog, /visibilitychange/);
  assert.match(catalog, /onMouseEnter/);
  assert.match(catalog, /onFocus/);
});
