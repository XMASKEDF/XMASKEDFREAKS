import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("infrastructure backbone exposes the remaining provider-neutral controls", () => {
  assert.match(source("lib/infrastructure/flags.ts"), /export interface FeatureFlagProvider/);
  assert.match(source("lib/infrastructure/flags.ts"), /"OFF", "SANDBOX", "CONTROLLED", "ON"/);
  assert.match(source("lib/infrastructure/observability.ts"), /createCorrelationContext/);
  assert.match(source("lib/infrastructure/observability.ts"), /REDACTED/);
  assert.match(source("lib/infrastructure/provider-interfaces.ts"), /export interface BackupProvider/);
  assert.match(source("lib/infrastructure/types.ts"), /featureFlags/);
  assert.match(source("lib/infrastructure/types.ts"), /backup:/);
  assert.match(source("lib/infrastructure/observability.ts"), /"CRITICAL"/);
  assert.match(source("lib/infrastructure/alerts.ts"), /cooldown/);
  assert.match(source("lib/infrastructure/error-reporting.ts"), /ErrorReportingProvider/);
  assert.ok(existsSync(new URL("../app/api/readiness/route.ts", import.meta.url)));
});

test("feature flag persistence is explicitly additive and production guarded", () => {
  assert.ok(existsSync(new URL("../supabase/migrations/20260816091000_infrastructure_flags_observability.sql", import.meta.url)));
  const migration = source("supabase/migrations/20260816091000_infrastructure_flags_observability.sql");
  assert.match(migration, /create table if not exists public\.infrastructure_feature_flags/);
  assert.doesNotMatch(migration, /drop table|truncate|delete from|drop column/i);
  assert.match(source("lib/infrastructure/flags.ts"), /durable production feature-flag provider/);
});

test("operations scripts are guarded against production mutation", () => {
  const backup = source("scripts/backup-create.mjs");
  const verify = source("scripts/backup-verify.mjs");
  const release = source("scripts/production-verify.mjs");
  assert.match(backup, /BACKUP_TARGET/);
  assert.match(backup, /Production backups require the approved provider workflow/);
  assert.match(verify, /LOCAL RESTORE TEST BLOCKED/);
  assert.match(release, /No remote migration or production database operation/);
  assert.match(release, /BLOCKED_BY_ACTIVE_DEV_SERVER/);
});
