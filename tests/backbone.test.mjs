import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("production backbone has centralized services and an additive migration", () => {
  assert.match(source("lib/risk/index.ts"), /export function evaluateRisk/);
  assert.match(source("lib/entitlements/index.ts"), /export async function assertEntitlement/);
  assert.match(source("lib/cost-control/index.ts"), /export async function getCostRecords/);
  assert.match(source("supabase/migrations/20260816090000_fraud_entitlements_accounting_support_rights_launch.sql"), /create table if not exists public.risk_events/);
  assert.match(source("supabase/migrations/20260816090000_fraud_entitlements_accounting_support_rights_launch.sql"), /create table if not exists public.platform_entitlements/);
  assert.match(source("supabase/migrations/20260816090000_fraud_entitlements_accounting_support_rights_launch.sql"), /create table if not exists public.support_cases/);
  assert.match(source("supabase/migrations/20260816090000_fraud_entitlements_accounting_support_rights_launch.sql"), /create table if not exists public.media_rights/);
  assert.match(source("supabase/migrations/20260816090000_fraud_entitlements_accounting_support_rights_launch.sql"), /alter table public.platform_entitlements add column if not exists download_count/);
});

test("protected admin backbone and audio entitlement guard are wired", () => {
  assert.ok(existsSync(new URL("../app/admin/system/backbone/page.tsx", import.meta.url)));
  assert.ok(existsSync(new URL("../app/api/admin/backbone/route.ts", import.meta.url)));
  assert.match(source("app/api/admin/backbone/route.ts"), /admin\.operations\.manage/);
  assert.match(source("app/api/audio-clips/[productId]/download/route.ts"), /assertEntitlement/);
  assert.match(source("app/api/admin/accounting/export/route.ts"), /Recent administrator reauthentication/);
});
