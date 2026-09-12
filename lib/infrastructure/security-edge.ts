import { botPolicyForLevel, configuredBotProtectionSensitivity, normalizeBotDetectionLevel, type BotDetectionLevel, type BotProtectionSensitivity } from "./bot-policy";
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

export type UploadDecision = { status: "QUARANTINED" | "SCANNING" | "SAFE" | "REJECTED"; reason: string };
export interface UploadSecurityProvider { inspect(input: { filename: string; mimeType: string; size: number; bytes?: Uint8Array }): Promise<UploadDecision>; }

type Signature = { extension: string; mimeTypes: string[]; matches: (bytes: Uint8Array) => boolean };
const signatures: Signature[] = [
  { extension: "jpg", mimeTypes: ["image/jpeg"], matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { extension: "png", mimeTypes: ["image/png"], matches: (b) => [0x89, 0x50, 0x4e, 0x47].every((value, index) => b[index] === value) },
  { extension: "gif", mimeTypes: ["image/gif"], matches: (b) => new TextDecoder().decode(b.slice(0, 6)) === "GIF89a" || new TextDecoder().decode(b.slice(0, 6)) === "GIF87a" },
  { extension: "webp", mimeTypes: ["image/webp"], matches: (b) => new TextDecoder().decode(b.slice(0, 4)) === "RIFF" && new TextDecoder().decode(b.slice(8, 12)) === "WEBP" },
  { extension: "mp3", mimeTypes: ["audio/mpeg", "audio/mp3"], matches: (b) => new TextDecoder().decode(b.slice(0, 3)) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
  { extension: "aac", mimeTypes: ["audio/aac", "audio/x-aac"], matches: (b) => b[0] === 0xff && (b[1] & 0xf6) === 0xf0 },
  { extension: "wav", mimeTypes: ["audio/wav", "audio/x-wav"], matches: (b) => new TextDecoder().decode(b.slice(0, 4)) === "RIFF" && new TextDecoder().decode(b.slice(8, 12)) === "WAVE" },
  { extension: "mp4", mimeTypes: ["video/mp4", "audio/mp4", "audio/x-m4a"], matches: (b) => new TextDecoder().decode(b.slice(4, 8)) === "ftyp" },
  { extension: "webm", mimeTypes: ["video/webm", "audio/webm"], matches: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
  { extension: "pdf", mimeTypes: ["application/pdf"], matches: (b) => new TextDecoder().decode(b.slice(0, 5)) === "%PDF-" }
];

function signatureFor(extension: string, mimeType: string) {
  return signatures.find((signature) => signature.extension === extension || signature.mimeTypes.includes(mimeType.toLowerCase()));
}

export class BasicUploadSecurityProvider implements UploadSecurityProvider {
  async inspect(input: { filename: string; mimeType: string; size: number; bytes?: Uint8Array }) {
    const extension = input.filename.toLowerCase().split(".").pop() || "";
    const allowed = new Set(signatures.map((signature) => signature.extension).concat(["jpeg", "m4a", "aac"]));
    if (input.size <= 0 || input.size > 250 * 1024 * 1024) return { status: "REJECTED" as const, reason: "File size is outside the approved limit." };
    if (!allowed.has(extension)) return { status: "REJECTED" as const, reason: "File extension is not approved." };
    if (!input.bytes?.byteLength) return { status: "QUARANTINED" as const, reason: "File bytes are unavailable for signature validation." };
    const signature = signatureFor(extension, input.mimeType);
    if (!signature || !signature.matches(input.bytes)) return { status: "REJECTED" as const, reason: "File content does not match its declared type." };

    const scannerUrl = process.env.UPLOAD_SCANNER_URL;
    const scannerToken = process.env.UPLOAD_SCANNER_TOKEN;
    if (!scannerUrl || !scannerToken) return { status: "QUARANTINED" as const, reason: "Awaiting an approved malware scanner; the file is not publishable." };
    const response = await fetch(scannerUrl, { method: "POST", headers: { authorization: `Bearer ${scannerToken}`, "content-type": input.mimeType, "x-filename": input.filename }, body: Buffer.from(input.bytes) }).catch(() => null);
    if (!response?.ok) return { status: "QUARANTINED" as const, reason: "Malware scanner is unavailable; the file remains quarantined." };
    const result = await response.json().catch(() => ({})) as { malicious?: boolean; clean?: boolean };
    if (result.malicious === true || result.clean === false) return { status: "REJECTED" as const, reason: "Malware scanner rejected the upload." };
    return { status: "SAFE" as const, reason: "Signature validation and the configured malware scan passed." };
  }
}
