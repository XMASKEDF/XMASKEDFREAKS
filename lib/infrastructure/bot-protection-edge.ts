import { botPolicyForLevel, configuredBotProtectionSensitivity, normalizeBotDetectionLevel, type BotDetectionLevel } from "./bot-policy";
import { getCacheProvider } from "./cache";
import { namespacedStateKey } from "./shared-state";

export type TurnstileMode = "disabled" | "observe" | "active";
export type BotProtectionDecision = { required: boolean; provider: "NONE" | "TURNSTILE_COMPATIBLE"; reason: string; verified?: boolean };
export interface BotProtectionProvider { evaluate(input: { action: string; abuseScore?: number; failedAttempts?: number; challengeToken?: string; remoteIp?: string }): Promise<BotProtectionDecision>; }
export class NoopBotProtectionProvider implements BotProtectionProvider { async evaluate() { return { required: false, provider: "NONE" as const, reason: "No approved challenge provider is configured; request is monitored instead." }; } }
class UnconfiguredTurnstileProvider implements BotProtectionProvider {
  constructor(private readonly mode: TurnstileMode) {}
  async evaluate() {
    return { required: this.mode === "active", provider: "NONE" as const, reason: "Turnstile is active but its server configuration is incomplete." };
  }
}

export function turnstileMode(value: unknown = process.env.TURNSTILE_MODE) : TurnstileMode {
  return value === "active" || value === "observe" ? value : "disabled";
}

export function turnstileConfiguration() {
  return {
    mode: turnstileMode(),
    siteKeyConfigured: Boolean(process.env.TURNSTILE_SITE_KEY || process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
    secretConfigured: Boolean(process.env.TURNSTILE_SECRET_KEY),
    expectedHostname: process.env.TURNSTILE_EXPECTED_HOSTNAME || null,
    expectedAction: process.env.TURNSTILE_EXPECTED_ACTION || null
  };
}

async function challengeFingerprint(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class TurnstileCompatibleBotProtectionProvider implements BotProtectionProvider {
  readonly provider = "TURNSTILE_COMPATIBLE" as const;
  constructor(private readonly secret: string, private readonly level: BotDetectionLevel = "easy", private readonly mode: TurnstileMode = turnstileMode()) {}
  async evaluate(input: { action: string; abuseScore?: number; failedAttempts?: number; challengeToken?: string; remoteIp?: string }) {
    if (this.mode === "disabled") return { required: false, provider: this.provider, reason: "Turnstile is disabled by configuration." };
    const threshold = botPolicyForLevel(this.level);
    const suspicious = Number(input.abuseScore || 0) >= threshold.challengeScore || Number(input.failedAttempts || 0) >= threshold.failedAttempts;
    if (!suspicious) return { required: false, provider: this.provider, reason: "Request did not meet the challenge threshold." };
    if (!input.challengeToken) return { required: this.mode === "active", provider: this.provider, reason: this.mode === "active" ? `Challenge required for ${input.action}.` : `Challenge observed for ${input.action}; observe mode does not interrupt visitors.` };
    const fingerprint = await challengeFingerprint(input.challengeToken);
    const cache = getCacheProvider();
    const replayKey = namespacedStateKey("security", `turnstile-replay:${fingerprint}`);
    if (!await cache.acquireLock(replayKey, 300)) {
      return { required: this.mode === "active", provider: this.provider, reason: "Challenge token was already used.", verified: false };
    }
    const body = new URLSearchParams({ secret: this.secret, response: input.challengeToken, ...(input.remoteIp ? { remoteip: input.remoteIp } : {}) });
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body }).catch(() => null);
    const result = response?.ok ? await response.json().catch(() => ({})) as { success?: boolean; hostname?: string; action?: string } : {};
    const hostnameValid = !turnstileConfiguration().expectedHostname || result.hostname === turnstileConfiguration().expectedHostname;
    const actionValid = !turnstileConfiguration().expectedAction || result.action === turnstileConfiguration().expectedAction;
    const verified = result.success === true && hostnameValid && actionValid;
    return { required: this.mode === "active" && !verified, provider: this.provider, verified, reason: verified ? "Challenge verified." : "Challenge could not be verified." };
  }
}

export function getBotProtectionProvider(level: BotDetectionLevel = normalizeBotDetectionLevel(process.env.BOT_DETECTION_LEVEL || (configuredBotProtectionSensitivity() === "high" ? "hard" : configuredBotProtectionSensitivity() === "low" ? "simple" : "easy"))): BotProtectionProvider {
  const config = turnstileConfiguration();
  if (config.mode === "active" && (!config.secretConfigured || !config.siteKeyConfigured)) return new UnconfiguredTurnstileProvider(config.mode);
  return config.secretConfigured && config.siteKeyConfigured && config.mode !== "disabled"
    ? new TurnstileCompatibleBotProtectionProvider(process.env.TURNSTILE_SECRET_KEY as string, level, config.mode)
    : new NoopBotProtectionProvider();
}

export function turnstileStatus() {
  const config = turnstileConfiguration();
  const configured = config.siteKeyConfigured && config.secretConfigured;
  return { ...config, status: config.mode === "disabled" ? "NOT CONFIGURED" : configured ? "HEALTHY" : "ACTION REQUIRED", replayProtection: "SHARED_CACHE_REQUIRED" as const, checkedAt: new Date().toISOString() };
}
