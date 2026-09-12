import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isKillSwitchRouteBlocked, isMaintenanceRouteBlocked, type MaintenancePolicySettings } from "../lib/maintenance-policy.ts";
import { isSameOriginRequest, requestBodyLimit } from "../lib/security/request.ts";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFileSync(new URL(path, root), "utf8");
const inactiveSettings: MaintenancePolicySettings = { enabled: false, scope: "full", disabledSystems: [] };

test("state-changing browser APIs reject cross-origin requests while verified callback routes remain eligible", () => {
  assert.equal(isSameOriginRequest({ method: "POST", pathname: "/api/merch", origin: "https://example.com", originHeader: "https://evil.example", refererHeader: null, fetchSite: "cross-site" }), false);
  assert.equal(isSameOriginRequest({ method: "POST", pathname: "/api/merch", origin: "https://example.com", originHeader: "https://example.com", refererHeader: null, fetchSite: "same-origin" }), true);
  assert.equal(isSameOriginRequest({ method: "POST", pathname: "/api/webhooks/payments/test", origin: "https://example.com", originHeader: null, refererHeader: null, fetchSite: "cross-site" }), true);
});

test("request limits distinguish JSON, verified callbacks, and approved media uploads", () => {
  assert.equal(requestBodyLimit("/api/merch"), 1024 * 1024);
  assert.equal(requestBodyLimit("/api/webhooks/payments/test"), 64 * 1024);
  assert.equal(requestBodyLimit("/api/admin/media"), 16 * 1024 * 1024);
});

test("full maintenance blocks public and checkout routes but preserves admin, legal, health, and verified callbacks", () => {
  const active = { ...inactiveSettings, enabled: true, scope: "full" as const };
  assert.equal(isMaintenanceRouteBlocked(active, "/live"), true);
  assert.equal(isMaintenanceRouteBlocked(active, "/api/payments/hosted", "POST"), true);
  assert.equal(isMaintenanceRouteBlocked(active, "/admin/security"), false);
  assert.equal(isMaintenanceRouteBlocked(active, "/policies"), false);
  assert.equal(isMaintenanceRouteBlocked(active, "/api/health"), false);
  assert.equal(isMaintenanceRouteBlocked(active, "/api/webhooks/payments/test", "POST"), false);
});

test("scoped maintenance blocks only the selected service family", () => {
  const checkout = { ...inactiveSettings, enabled: true, scope: "checkout" as const };
  assert.equal(isMaintenanceRouteBlocked(checkout, "/games"), false);
  assert.equal(isMaintenanceRouteBlocked(checkout, "/api/payments/hosted", "POST"), true);
  const selected = { ...inactiveSettings, enabled: true, scope: "selected" as const, disabledSystems: ["games"] };
  assert.equal(isMaintenanceRouteBlocked(selected, "/games"), true);
  assert.equal(isMaintenanceRouteBlocked(selected, "/live"), false);
});

test("Kill Switch controls require Super Admin, recent reauthentication, exact confirmation, and server RPC", () => {
  const route = source("app/api/admin/maintenance/route.ts");
  assert.match(route, /isSuperAdmin/);
  assert.match(route, /hasRecentAdminReauthentication/);
  assert.match(route, /confirmation !== "KILL SWITCH"/);
  assert.match(route, /set_emergency_maintenance/);
  assert.match(route, /runReliabilityHealthChecks/);
  assert.doesNotMatch(route, /searchParams.*bypass|maintenanceBypass/i);
});

test("Kill Switch blocks the entire public surface while preserving recovery paths", () => {
  const active = { enabled: true };
  for (const pathname of ["/", "/live", "/merch", "/games", "/api/tips", "/api/payments/hosted"]) {
    assert.equal(isKillSwitchRouteBlocked(active, pathname), true, pathname);
  }
  for (const pathname of ["/admin/security", "/api/admin/maintenance", "/api/webhooks/payments", "/api/webhooks/printify", "/api/health", "/kill-switch"]) {
    assert.equal(isKillSwitchRouteBlocked(active, pathname), false, pathname);
  }
});

test("public maintenance endpoint cannot expose private reason or Admin identity", () => {
  const route = source("app/api/maintenance/route.ts");
  assert.match(route, /publicMaintenanceSettings/);
  assert.doesNotMatch(route, /privateReason|activatedBy|disabledSystems/);
  assert.match(route, /cache-control.*no-store/);
});

test("maintenance history and audit evidence are protected and append-only", () => {
  const migration = source("supabase/migrations/20260803090000_security_hardening_emergency_maintenance.sql");
  assert.match(migration, /maintenance_history_immutable/);
  assert.match(migration, /revoke all on public\.maintenance_history from anon, authenticated/);
  assert.match(migration, /security definer/);
  assert.match(migration, /grant execute.*service_role/);
  assert.match(migration, /state_version = state_version \+ 1/);
});

test("browser policy blocks framing and unsafe production script execution", () => {
  const middleware = source("middleware.ts");
  assert.match(middleware, /frame-ancestors 'none'/);
  assert.match(middleware, /x-content-type-options.*nosniff/);
  assert.match(middleware, /strict-transport-security/);
  assert.match(middleware, /script-src 'self' 'nonce-/);
  assert.doesNotMatch(middleware, /script-src[^\n]+unsafe-inline/);
});
