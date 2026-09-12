import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resetCircuit, withCircuitBreaker, CircuitOpenError } from "../lib/reliability/circuit-breaker.ts";
import { cleanReliabilityText, reliabilityFingerprint, sanitizeMetadata } from "../lib/reliability/sanitize.ts";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFileSync(new URL(path, root), "utf8");

test("incident evidence redacts secrets, payment data, and local paths", () => {
  const cleaned = cleanReliabilityText("password=hunter2 Authorization: Bearer abc.def 4242424242424242 /Users/person/private.ts");
  assert.doesNotMatch(cleaned, /hunter2|abc\.def|4242424242424242|\/Users\/person/);
  assert.match(cleaned, /\[REDACTED\]/);
  assert.match(cleaned, /\[INTERNAL_PATH\]/);
  assert.deepEqual(sanitizeMetadata({ apiKey: "secret", nested: { cardNumber: "4242" } }), {
    apiKey: "[REDACTED]",
    nested: { cardNumber: "[REDACTED]" }
  });
});

test("dynamic identifiers group into one incident fingerprint", () => {
  const first = reliabilityFingerprint({ feature: "Wallet", title: "Ledger 123 failed", errorMessage: "order aabbccdd99", affectedRoute: "/account/123" });
  const second = reliabilityFingerprint({ feature: "Wallet", title: "Ledger 999 failed", errorMessage: "order ffeeddcc77", affectedRoute: "/account/456" });
  assert.equal(first, second);
});

test("circuit breaker opens after bounded failures and requires a reset or cooldown", async () => {
  resetCircuit("test-provider");
  await assert.rejects(withCircuitBreaker("test-provider", async () => { throw new Error("offline"); }, { threshold: 2, cooldownMs: 60_000 }));
  await assert.rejects(withCircuitBreaker("test-provider", async () => { throw new Error("offline"); }, { threshold: 2, cooldownMs: 60_000 }));
  await assert.rejects(
    withCircuitBreaker("test-provider", async () => "unexpected", { threshold: 2, cooldownMs: 60_000 }),
    CircuitOpenError
  );
  resetCircuit("test-provider");
  assert.equal(await withCircuitBreaker("test-provider", async () => "healthy"), "healthy");
});

test("Reliability Center has the required protected sixteen-panel contract", () => {
  const page = source("app/admin/reliability/page.tsx");
  const center = source("components/admin/ReliabilityCenter.tsx");
  const tabBlock = center.match(/const tabs = \[([\s\S]*?)\] as const/)?.[1] || "";
  assert.equal((tabBlock.match(/"/g) || []).length / 2, 16);
  assert.match(page, /getAdminBySession/);
  assert.match(page, /admin\.operations\.manage/);
  assert.match(page, /redirect\("\/admin\/login"\)/);
  assert.match(center, /Wallet and Payment Health/);
  assert.match(center, /Incident History/);
  assert.match(center, /Export sanitized report/);
});

test("admin reliability API requires permission and refuses unapproved recovery", () => {
  const route = source("app/api/admin/reliability/route.ts");
  assert.match(route, /hasAdminPermission\(admin, "admin\.operations\.manage"\)/);
  assert.match(route, /Critical incidents require closure notes/);
  assert.match(route, /Administrator confirmation is required/);
  assert.match(route, /This recovery action is not approved for automatic execution/);
  assert.doesNotMatch(route, /balance_tokens.*PATCH|delete.*wallet_transactions/i);
});

test("public health is minimal while protected checks include reachability and function", () => {
  const publicHealth = source("app/api/health/route.ts");
  const internalHealth = source("lib/reliability/health.ts");
  assert.doesNotMatch(publicHealth, /emailConfigured|supabaseConfigured|STRIPE|serviceKey|apiKey/);
  assert.match(internalHealth, /reachable:/);
  assert.match(internalHealth, /functional:/);
  assert.match(internalHealth, /latencyMs/);
});

test("wallet integrity mismatch is held without editing balances or ledger evidence", () => {
  const migration = source("supabase/migrations/20260729092000_reliability_incident_management.sql");
  assert.match(migration, /scan_wallet_integrity/);
  assert.match(migration, /wallet_integrity_holds/);
  assert.match(migration, /WALLET_INTEGRITY_HOLD/);
  assert.match(migration, /RELIABILITY_EVIDENCE_IS_APPEND_ONLY/);
  assert.doesNotMatch(migration.match(/create or replace function public\.scan_wallet_integrity[\s\S]*?revoke all on function public\.scan_wallet_integrity/)?.[0] || "", /update\s+token_wallets|delete\s+from\s+wallet_transactions/i);
});

test("critical incident lifecycle includes links, postmortems, retention, alerts, and immutable actions", () => {
  const migration = source("supabase/migrations/20260729092000_reliability_incident_management.sql");
  assert.match(migration, /reliability_incident_links/);
  assert.match(migration, /reliability_postmortems/);
  assert.match(migration, /reliability_retention_settings/);
  assert.match(migration, /reliability_alerts/);
  assert.match(migration, /reliability_actions_immutable/);
  assert.match(migration, /2555/);
});

test("browser reporting is rate-limited, sanitized, deduplicated, and cleaned up", () => {
  const route = source("app/api/reliability/client/route.ts");
  const reporter = source("components/reliability/ReliabilityClientReporter.tsx");
  assert.match(route, /rateLimited/);
  assert.match(route, /createHash\("sha256"\)/);
  assert.doesNotMatch(route, /userId:|paymentId:|orderId:/);
  assert.match(reporter, /Date\.now\(\) - last < 60_000/);
  assert.match(reporter, /removeEventListener\("unhandledrejection"/);
  assert.match(reporter, /removeEventListener\("error", onResourceError, true\)/);
});

test("email and Printify jobs preserve retries and report terminal incidents", () => {
  const email = source("app/api/jobs/email/route.ts");
  const printify = source("app/api/jobs/printify/route.ts");
  assert.match(email, /retries < 5/);
  assert.match(email, /withCircuitBreaker\("email-delivery"/);
  assert.match(email, /recordReliabilityIncident/);
  assert.match(printify, /withCircuitBreaker\("printify-fulfillment"/);
  assert.match(printify, /manual_approval/);
  assert.match(printify, /recordReliabilityIncident/);
  assert.match(printify, /verify that no remote order exists/i);
});

test("critical and daily administrator alerts use deduplicated existing email jobs", () => {
  const migration = source("supabase/migrations/20260729092000_reliability_incident_management.sql");
  const server = source("lib/reliability/server.ts");
  const daily = source("app/api/jobs/reliability/route.ts");
  assert.match(migration, /reliability_critical/);
  assert.match(migration, /reliability_daily/);
  assert.match(server, /reliability-critical:/);
  assert.match(daily, /CRON_SECRET/);
  assert.match(daily, /reliability-daily:\$\{reportDate\}/);
  assert.match(daily, /getReliabilityCenterData/);
});
