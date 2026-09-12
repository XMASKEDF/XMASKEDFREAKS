import { serviceCredentials, serviceHeaders } from "@/lib/api-user";

export type BotDetectionLevel = "simple" | "easy" | "medium" | "hard";
export type BotProtectionSensitivity = "low" | "balanced" | "high";
export type BotDetectionConfig = { enabled: boolean; level: BotDetectionLevel; supervisorAgentId: "Sage" };

export const DEFAULT_BOT_DETECTION_CONFIG: BotDetectionConfig = { enabled: true, level: "easy", supervisorAgentId: "Sage" };

const BOT_LEVEL_POLICIES: Record<BotDetectionLevel, { observeScore: number; throttleScore: number; blockScore: number; requestSoftLimit: number; requestHardLimit: number; failedAttempts: number; challengeScore: number }> = {
  simple: { observeScore: 75, throttleScore: 100, blockScore: 125, requestSoftLimit: 240, requestHardLimit: 600, failedAttempts: 12, challengeScore: 90 },
  easy: { observeScore: 45, throttleScore: 75, blockScore: 105, requestSoftLimit: 90, requestHardLimit: 180, failedAttempts: 8, challengeScore: 75 },
  medium: { observeScore: 35, throttleScore: 60, blockScore: 90, requestSoftLimit: 90, requestHardLimit: 180, failedAttempts: 6, challengeScore: 60 },
  hard: { observeScore: 25, throttleScore: 45, blockScore: 75, requestSoftLimit: 60, requestHardLimit: 120, failedAttempts: 4, challengeScore: 45 }
};

// Game input is trusted as gameplay data, not treated as a bot signal.
export const GAME_BOT_DETECTION = false as const;
export const GAMEPLAY_BOT_CHALLENGE = false as const;
export const GAME_ANTI_CHEAT = true as const;
export const GAME_SCORE_VALIDATION = true as const;
export const GAME_REPLAY_PROTECTION = true as const;

export const GAME_RATE_LIMIT_POLICIES = {
  GAMEPLAY_NORMAL: { name: "GAMEPLAY_NORMAL", limit: 240, windowSeconds: 60 },
  GAME_SCORE_SUBMISSION: { name: "GAME_SCORE_SUBMISSION", limit: 30, windowSeconds: 60 }
} as const;

export function normalizeBotProtectionSensitivity(value: unknown): BotProtectionSensitivity {
  return value === "low" || value === "high" ? value : "balanced";
}

export function normalizeBotDetectionLevel(value: unknown): BotDetectionLevel {
  return value === "simple" || value === "medium" || value === "hard" ? value : "easy";
}

export function botPolicyForLevel(level: BotDetectionLevel) {
  return BOT_LEVEL_POLICIES[level];
}

export function botDetectionEnabledFromEnv() {
  return process.env.BOT_DETECTION_ENABLED !== "false";
}

export function configuredBotProtectionSensitivity(): BotProtectionSensitivity {
  return normalizeBotProtectionSensitivity(process.env.BOT_PROTECTION_SENSITIVITY);
}

export function isGameRoute(pathname: string) {
  return pathname === "/games" || pathname.startsWith("/games/") || pathname.startsWith("/api/games/");
}

/**
 * Only these routes are eligible for the gameplay bot-challenge bypass.
 * Admin settings stay outside this list even though they share the /api/games
 * namespace, so a future sensitive-route policy cannot inherit the bypass.
 */
export function isActiveGameplayRoute(pathname: string) {
  return pathname === "/games"
    || pathname.startsWith("/games/")
    || pathname === "/api/games/scores"
    || pathname === "/api/games/errors"
    || pathname.startsWith("/api/games/assets/");
}

export function isHighRiskBotPath(pathname: string) {
  return pathname.startsWith("/admin")
    || pathname.startsWith("/api/admin")
    || /login|signup|register|password-reset|account-recovery|checkout|payments|payout|bank|upload|media|webhooks|payment-callback/i.test(pathname);
}

/** Interactive verification is opt-in and limited to account, feedback, and checkout flows. */
export function isTurnstileCandidateRoute(pathname: string) {
  if (isActiveGameplayRoute(pathname) || pathname.startsWith("/api/webhooks/") || pathname.includes("/payment-callback")) return false;
  return /signup|register|password-reset|account-recovery|newsletter|feedback|checkout|guest/i.test(pathname);
}

export function challengeThreshold(sensitivity: BotProtectionSensitivity) {
  if (sensitivity === "low") return { abuseScore: 75, failedAttempts: 8 };
  if (sensitivity === "high") return { abuseScore: 45, failedAttempts: 4 };
  return { abuseScore: 60, failedAttempts: 6 };
}

let cachedSensitivity: { value: BotProtectionSensitivity; expiresAt: number } | null = null;
let cachedBotConfig: { value: BotDetectionConfig; expiresAt: number } | null = null;

export async function getStoredBotProtectionSensitivity(): Promise<BotProtectionSensitivity> {
  if (cachedSensitivity && cachedSensitivity.expiresAt > Date.now()) return cachedSensitivity.value;
  const fallback = configuredBotProtectionSensitivity();
  const service = serviceCredentials();
  if (!service) {
    cachedSensitivity = { value: fallback, expiresAt: Date.now() + 2_000 };
    return fallback;
  }
  const response = await fetch(`${service.url}/rest/v1/security_settings?id=eq.1&select=bot_protection_sensitivity&limit=1`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null);
  const rows = response?.ok ? await response.json().catch(() => []) as Array<{ bot_protection_sensitivity?: unknown }> : [];
  const value = normalizeBotProtectionSensitivity(rows[0]?.bot_protection_sensitivity || fallback);
  cachedSensitivity = { value, expiresAt: Date.now() + 2_000 };
  return value;
}

export async function getStoredBotDetectionConfig(): Promise<BotDetectionConfig> {
  if (cachedBotConfig && cachedBotConfig.expiresAt > Date.now()) return cachedBotConfig.value;
  const fallback: BotDetectionConfig = { ...DEFAULT_BOT_DETECTION_CONFIG, enabled: botDetectionEnabledFromEnv() };
  const service = serviceCredentials();
  if (!service) {
    cachedBotConfig = { value: fallback, expiresAt: Date.now() + 2_000 };
    return fallback;
  }
  const response = await fetch(`${service.url}/rest/v1/security_settings?id=eq.1&select=bot_detection_enabled,bot_detection_level,bot_detection_supervisor_agent_id&limit=1`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null);
  const rows = response?.ok ? await response.json().catch(() => []) as Array<Record<string, unknown>> : [];
  const row = rows[0] || {};
  const value: BotDetectionConfig = {
    enabled: typeof row.bot_detection_enabled === "boolean" ? row.bot_detection_enabled : fallback.enabled,
    level: normalizeBotDetectionLevel(row.bot_detection_level),
    supervisorAgentId: "Sage"
  };
  cachedBotConfig = { value, expiresAt: Date.now() + 2_000 };
  return value;
}

export function clearStoredBotDetectionConfigCache() {
  cachedBotConfig = null;
}
