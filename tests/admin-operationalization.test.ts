import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeOperationalState, validateRedirectDestination } from "../lib/admin-operationalization.ts";
import { getUpdateRegistry } from "../lib/admin-update-registry.ts";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFileSync(new URL(path, root), "utf8");

test("operational state normalizes package economics and keeps six default slots", () => {
  const state = normalizeOperationalState({ coinPackages: [{ id: "custom", name: "Custom", amount: 16, baseCoins: 999, bonusCoins: 4, enabled: true, order: 1 }] });
  assert.equal(state.coinPackages.length, 1);
  assert.equal(state.coinPackages[0].baseCoins, 32);
  assert.equal(state.coinPackages[0].bonusCoins, 4);
  assert.equal(state.coinPolicy.immutableCoinValueCents, 50);
  assert.equal(normalizeOperationalState(null).coinPackages.length, 6);
});

test("redirect destinations are internal or approved HTTPS only", () => {
  assert.equal(validateRedirectDestination("/live").ok, true);
  assert.equal(validateRedirectDestination("https://fansly.com/creator").ok, true);
  assert.equal(validateRedirectDestination("javascript:alert(1)").ok, false);
  assert.equal(validateRedirectDestination("https://unsafe.example/redirect").ok, false);
  assert.equal(validateRedirectDestination("//unsafe.example").ok, false);
});

test("operationalization is a protected durable Admin workstation", () => {
  const page = source("app/admin/operationalization/page.tsx");
  const center = source("components/admin/AdminOperationalizationCenter.tsx");
  const route = source("app/api/admin/operationalization/route.ts");
  const migration = source("supabase/migrations/20260911120000_admin_operationalization.sql");
  assert.match(page, /getAdminBySession/);
  assert.match(page, /admin\.operations\.manage/);
  assert.match(center, /SANDBOX INTERVENTION #1/);
  assert.match(center, /Shared Media Library/);
  assert.match(center, /Run isolated scenario/);
  assert.match(route, /hasAdminPermission\(admin, "admin\.operations\.manage"\)/);
  assert.match(route, /auditAdminEvent/);
  assert.match(route, /queue-live-notification/);
  assert.match(migration, /admin_operational_state/);
  assert.match(migration, /admin_operational_events/);
  assert.doesNotMatch(migration, /api_key|service_role|password_hash|credential_value/i);
});

test("hosted checkout consumes the same operational package authority", () => {
  const route = source("app/api/payments/hosted/route.ts");
  const liveConfig = source("app/api/live-config/route.ts");
  const liveRoom = source("components/LiveRoom.tsx");
  assert.match(route, /getOperationalCoinPackage/);
  assert.match(route, /quoteCoinPackage/);
  assert.match(liveConfig, /getPublicLiveOperationalSettings/);
  assert.match(liveRoom, /settings\.coinPackages/);
});

test("the obsolete contribution backlog item is retired without removing Live access", () => {
  const status = source("XMASKEDFREAKS_FINAL_SETUP/12_ADMIN_OPERATIONALIZATION/ADMIN_TOOL_STATUS.md");
  const remaining = source("XMASKEDFREAKS_FINAL_SETUP/12_ADMIN_OPERATIONALIZATION/ADMIN_REMAINING_IMPLEMENTATION.md");
  assert.match(status, /25-Minute Contribution Rule.*STALE \/ SUPERSEDED/);
  assert.doesNotMatch(remaining, /25-Minute Contribution Rule/);
  assert.match(source("lib/config.ts"), /minimumAccessCoins: 10/);
});

test("the current intervention is registered as a durable Admin update package", () => {
  const packageEntry = getUpdateRegistry().find((entry) => entry.id === "admin-operationalization-intervention-1");
  assert.ok(packageEntry);
  assert.equal(packageEntry.title, "XMASKEDFREAKS UPDATE — SANDBOX INTERVENTION #1 / ADMIN OPERATIONALIZATION");
  assert.equal(packageEntry.items.length, 17);
  assert.equal(packageEntry.environment, "SANDBOX");
  assert.equal(packageEntry.status, "NEEDS INFRASTRUCTURE");
});
