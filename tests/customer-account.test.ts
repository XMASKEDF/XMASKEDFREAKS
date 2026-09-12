import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateNickname } from "../lib/account/nickname.ts";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("nickname rules accept the supported character set and length", () => {
  assert.deepEqual(validateNickname("Caleb_2026"), { valid: true, normalized: "Caleb_2026", code: "AVAILABLE", message: "Available" });
  assert.equal(validateNickname("ab").valid, false);
  assert.equal(validateNickname("name with spaces").valid, false);
  assert.equal(validateNickname(" Caleb_2026").valid, false);
  assert.equal(validateNickname("name-with-dash").valid, false);
  assert.equal(validateNickname("a".repeat(21)).valid, false);
});

test("nickname rules reject reserved names and prohibited fragments without an English special case", () => {
  assert.equal(validateNickname("ADMIN").code, "RESERVED");
  assert.equal(validateNickname("Maya").code, "RESERVED");
  assert.equal(validateNickname("fuck_user").code, "PROHIBITED");
});

test("database migration enforces case-insensitive uniqueness and protected wallet updates", () => {
  const migration = source("supabase/migrations/20260723090000_customer_account_experience.sql");
  assert.match(migration, /unique index[\s\S]*lower\(display_name\)/i);
  assert.match(migration, /nickname_available/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /p_idempotency_key/i);
  assert.match(migration, /NEGATIVE_BALANCE/);
  assert.match(migration, /two_factor_required = true/);
  assert.match(migration, /customer_favorites enable row level security/i);
  assert.match(migration, /customer_recent_views enable row level security/i);
});

test("account API filters order items to the authenticated customer order ids", () => {
  const api = source("app/api/account/route.ts");
  assert.match(api, /digitalOrderIds/);
  assert.match(api, /commerceOrderIds/);
  assert.match(api, /order_id=in\./);
  assert.doesNotMatch(api, /digital_order_items", "select=/);
  assert.doesNotMatch(api, /commerce_order_items", "select=/);
});

test("persistent identity, wallet synchronization, dashboard, and storefront memory are wired globally", () => {
  const layout = source("app/layout.tsx");
  const provider = source("components/account/AccountProvider.tsx");
  const dashboard = source("components/account/CustomerDashboard.tsx");
  const games = source("components/games/GamePlayShell.tsx");
  assert.match(layout, /<AccountProvider>/);
  assert.match(layout, /<PersistentAccountWidget/);
  assert.match(provider, /BroadcastChannel\("xmf-account-sync"\)/);
  assert.match(provider, /postgres_changes/);
  assert.match(dashboard, /customer-balance-band/);
  assert.match(dashboard, /customer-order-list/);
  assert.match(dashboard, /account\.favorites/);
  assert.match(dashboard, /account\.recentlyViewed/);
  assert.match(dashboard, /account\.notifications/);
  assert.match(dashboard, /digitalLibrary/);
  assert.match(games, /recordRecentView/);
});

test("public search includes Feet and keeps the existing catalog source", async () => {
  const [search, route, experience] = await Promise.all([
    source("lib/site-search.ts"),
    source("app/api/search/route.ts"),
    source("components/search/SearchExperience.tsx")
  ]);
  assert.match(search, /getFeetPresets/);
  assert.match(search, /type: "feet"/);
  assert.match(route, /"feet"/);
  assert.match(experience, /"feet"/);
});

test("admin customer actions require the existing protected admin session and audit each mutation", () => {
  const api = source("app/api/admin/customers/route.ts");
  assert.match(api, /hasAdminPermission\(admin, "admin\.customers\.manage"\)/);
  assert.match(api, /isSuperAdmin/);
  assert.match(api, /hasRecentAdminReauthentication/);
  assert.match(api, /admin_adjust_customer_wallet/);
  assert.match(api, /auditAdminEvent/);
  assert.match(api, /idempotencyKey/);
});
