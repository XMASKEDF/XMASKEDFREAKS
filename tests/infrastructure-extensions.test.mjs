import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("infrastructure extension is additive and append-only", () => {
  const migrationPath = "supabase/migrations/20260817090500_infrastructure_safety_layer.sql";
  assert.ok(existsSync(new URL(`../${migrationPath}`, import.meta.url)));
  const migration = source(migrationPath);
  assert.match(migration, /infrastructure_audit_ledger/);
  assert.match(migration, /prevent_infrastructure_audit_ledger_mutation/);
  assert.match(migration, /infrastructure_backup_restore_tests/);
  assert.match(migration, /environment in \('SANDBOX','STAGING'\)/);
  assert.doesNotMatch(migration, /drop\s+table|truncate(?:\s|;)|delete\s+from|drop\s+column/i);
});

test("provider adapters and media safety boundaries are present", () => {
  assert.match(source("lib/infrastructure/storage.ts"), /S3CompatibleObjectStorageProvider/);
  assert.match(source("lib/infrastructure/storage.ts"), /safeObjectKey/);
  assert.match(source("lib/infrastructure/delivery.ts"), /CdnAssetDeliveryProvider/);
  assert.match(source("lib/infrastructure/cache.ts"), /RedisCompatibleCacheProvider/);
  assert.match(source("lib/infrastructure/provider-runtime.ts"), /ConfiguredDeploymentProvider/);
  assert.match(source("lib/infrastructure/security-edge.ts"), /TurnstileCompatibleBotProtectionProvider/);
  assert.match(source("lib/infrastructure/security-edge.ts"), /File content does not match/);
  assert.match(source("lib/infrastructure/security-edge.ts"), /file remains quarantined/);
  assert.match(source("lib/infrastructure/types.ts"), /"SCANNING"/);
});

test("Batch 1 provider status is server-side, secret-free, and uses existing environment names", () => {
  const source = readFileSync(new URL("../lib/infrastructure/provider-configuration.ts", import.meta.url), "utf8");
  const email = readFileSync(new URL("../lib/email/provider.ts", import.meta.url), "utf8");
  for (const name of ["CLOUDFLARE_API_TOKEN", "CDN_PROVIDER", "STREAM_HEALTH_URL", "STREAM_PLAYBACK_BASE_URL", "PRINTIFY_API_TOKEN", "PRINTIFY_SHOP_ID"]) assert.match(source, new RegExp(name));
  for (const name of ["EMAIL_PROVIDER", "EMAIL_MODE", "RESEND_API_KEY", "EMAIL_FROM"]) assert.match(`${source}\n${email}`, new RegExp(name));
  assert.match(source, /lastSuccessfulHealthCheck/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_(?:CLOUDFLARE|PRINTIFY|EMAIL)/);
});

test("public health output does not expose internal service details", () => {
  const route = source("app/api/health/route.ts");
  assert.match(route, /status/);
  assert.match(route, /checkedAt/);
  assert.doesNotMatch(route, /database:\s|queue:\s|cache:\s|storage:\s|environment:\s|version:/);
});

test("event bus isolates handler failures and tips retain flood-only protection", () => {
  const events = source("lib/infrastructure/events.ts");
  assert.match(events, /handlerFailures/);
  assert.match(events, /catch \(error\)/);
  const rateLimit = source("lib/infrastructure/rate-limit.ts");
  assert.match(rateLimit, /tips:\s*\{\s*name:\s*"tips"/);
  assert.doesNotMatch(rateLimit, /tipCooldown|normalTipCooldown/);
});

test("required provider configuration remains server-side and placeholder-only", () => {
  const env = source(".env.example");
  for (const name of ["STORAGE_SECRET_KEY", "REDIS_TOKEN", "UPLOAD_SCANNER_TOKEN", "DEPLOYMENT_PROVIDER_TOKEN", "EXTERNAL_MONITOR_TOKEN"]) {
    assert.match(env, new RegExp(`^${name}=`, "m"));
    assert.doesNotMatch(env, new RegExp(`NEXT_PUBLIC_${name}`));
  }
});
