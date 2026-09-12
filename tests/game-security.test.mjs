import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("gameplay is challenge-exempt while anti-cheat and dedicated policies remain active", () => {
  const policy = source("lib/infrastructure/bot-policy.ts");
  const middleware = source("middleware.ts");
  const rateLimit = source("lib/infrastructure/rate-limit.ts");
  const scoreRoute = source("app/api/games/scores/route.ts");
  assert.match(policy, /GAMEPLAY_BOT_CHALLENGE = false/);
  assert.match(policy, /GAME_BOT_DETECTION = false/);
  assert.match(policy, /GAME_ANTI_CHEAT = true/);
  assert.match(policy, /GAME_SCORE_VALIDATION = true/);
  assert.match(policy, /GAME_REPLAY_PROTECTION = true/);
  assert.match(policy, /isActiveGameplayRoute/);
  assert.match(policy, /api\/games\/scores/);
  assert.match(policy, /api\/games\/errors/);
  assert.match(policy, /api\/games\/assets/);
  assert.doesNotMatch(policy, /api\/games\/settings.*isActiveGameplayRoute/);
  assert.match(policy, /GAMEPLAY_NORMAL/);
  assert.match(policy, /GAME_SCORE_SUBMISSION/);
  assert.match(middleware, /isGameRoute/);
  assert.match(middleware, /!activeGameplayRoute/);
  assert.match(middleware, /Mixed-purpose Admin settings stay protected/);
  assert.match(rateLimit, /gameScoreSubmission/);
  assert.match(rateLimit, /api\/games\/settings.*adminApi/);
  assert.match(scoreRoute, /validateGameResult/);
  assert.match(scoreRoute, /GAME_ANTICHEAT_REJECTED/);
});

test("challenge fallback and provider configuration cannot trap normal visitors", () => {
  const edge = source("lib/infrastructure/security-edge.ts");
  const example = source(".env.example");
  assert.match(edge, /No approved challenge provider is configured; request is monitored instead/);
  assert.match(edge, /NEXT_PUBLIC_TURNSTILE_SITE_KEY/);
  assert.match(edge, /botPolicyForLevel/);
  assert.match(edge, /No approved challenge provider is configured/);
  assert.match(example, /BOT_PROTECTION_SENSITIVITY=balanced/);
});

test("admin security and sandbox simulation expose separated controls", () => {
  const adminPanel = source("components/admin/AdminSecurityPanel.tsx");
  const securityCenter = source("components/admin/SecurityCenterOverview.tsx");
  const simulation = source("app/api/admin/games/security-test/route.ts");
  assert.match(adminPanel, /Gameplay bot challenges/);
  assert.match(adminPanel, /SIMPLE/);
  assert.match(adminPanel, /EASY/);
  assert.match(adminPanel, /MEDIUM/);
  assert.match(adminPanel, /HARD/);
  assert.match(securityCenter, /Game anti-cheat/);
  assert.match(securityCenter, /Gameplay bot challenges/);
  assert.match(securityCenter, /Game bot detection/);
  assert.match(securityCenter, /Score validation/);
  assert.match(securityCenter, /Replay protection/);
  assert.match(simulation, /game_bot_attack/);
  assert.match(simulation, /bot_challenge/);
  assert.match(simulation, /impossible_score/);
  assert.match(simulation, /duplicate_submission/);
  assert.ok(existsSync(new URL("../supabase/migrations/20260819090000_bot_game_protection_tuning.sql", import.meta.url)));
});
