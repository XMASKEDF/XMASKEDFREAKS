import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("Sage is the existing bot-detection supervisor", () => {
  const registry = source("lib/ai/agent-registry.ts");
  const policy = source("lib/infrastructure/bot-policy.ts");
  assert.match(registry, /Sage: \{[\s\S]*bot detection monitoring/);
  assert.match(registry, /Sage: \{[\s\S]*false-positive review/);
  assert.match(policy, /supervisorAgentId: "Sage"/);
  assert.match(policy, /DEFAULT_BOT_DETECTION_CONFIG: BotDetectionConfig = \{ enabled: true, level: "easy", supervisorAgentId: "Sage" \}/);
  for (const level of ["simple", "easy", "medium", "hard"]) assert.match(policy, new RegExp(`${level}:`));
});

test("bot policy is additive and games retain challenge-off anti-cheat protection", () => {
  const migration = source("supabase/migrations/20260817090000_bot_detection_supervisor.sql");
  const middleware = source("middleware.ts");
  const policy = source("lib/infrastructure/bot-policy.ts");
  assert.match(migration, /add column if not exists bot_detection_enabled/);
  assert.match(migration, /add column if not exists bot_detection_level/);
  assert.match(migration, /add column if not exists bot_detection_supervisor_agent_id/);
  assert.doesNotMatch(migration, /drop table|delete from|truncate/i);
  assert.match(middleware, /getStoredBotDetectionConfig/);
  assert.match(middleware, /gameplayBotSignalsEnabled = botConfig\.enabled && !activeGameplayRoute/);
  assert.match(middleware, /SECURITY_VERIFICATION_REQUIRED/);
  assert.match(policy, /GAMEPLAY_BOT_CHALLENGE = false/);
  assert.match(policy, /GAME_ANTI_CHEAT = true/);
  assert.match(policy, /GAME_REPLAY_PROTECTION = true/);
});

test("admin controls and reporting preserve customer-first operation", () => {
  const panel = source("components/admin/AdminSecurityPanel.tsx");
  const route = source("app/api/admin/security/route.ts");
  const simulation = source("app/api/admin/security/bot-simulation/route.ts");
  const securityCenter = source("app/api/admin/security-center/route.ts");
  const aiRoute = source("app/api/admin/ai-agents/route.ts");
  for (const level of ["SIMPLE", "EASY", "MEDIUM", "HARD"]) assert.match(panel, new RegExp(level));
  for (const scenario of ["normal_customer", "international_customer", "fast_browsing_customer", "obvious_bot", "brute_force_bot", "api_flood", "challenge_pass", "challenge_failure"]) assert.match(panel, new RegExp(scenario));
  assert.match(route, /bot_detection_policy_changed/);
  assert.match(route, /old:/);
  assert.match(route, /new:/);
  assert.match(simulation, /sandbox: true/);
  assert.match(securityCenter, /botReport/);
  assert.match(securityCenter, /BOT DETECTION MAY BE TOO AGGRESSIVE/);
  assert.match(aiRoute, /buildBotReport/);
  assert.match(aiRoute, /supervisorAgentId/);
});
