import { botPolicyForLevel, normalizeBotDetectionLevel, type BotDetectionLevel } from "@/lib/infrastructure/bot-policy";

export type SecurityAction = "allow" | "throttle" | "block";

export type SecurityDecision = {
  action: SecurityAction;
  score: number;
  reasons: string[];
  retryAfterSeconds?: number;
};

export type SecurityRequestInput = {
  ip: string;
  country: string;
  userAgent: string;
  pathname: string;
  method: string;
  requestCount: number;
  failedAuthCount: number;
  contentLength: number;
  query: string;
  whitelistedIps?: string[];
  blacklistedIps?: string[];
  blacklistedCountries?: string[];
  blacklistedUserAgents?: string[];
  botDetectionEnabled?: boolean;
  botDetectionLevel?: BotDetectionLevel;
};

const defaultBadUserAgents = [
  "badbot",
  "scraper",
  "curl",
  "wget",
  "python-requests",
  "httpclient",
  "nikto",
  "sqlmap",
  "masscan",
  "zgrab"
];

const attackPatterns = [
  "../",
  "%2e%2e",
  "<script",
  "union select",
  "sleep(",
  "benchmark(",
  "/wp-admin",
  "/xmlrpc.php",
  ".env",
  "phpmyadmin"
];

export function parseSecurityList(value?: string | null) {
  return (value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function extractClientIp(headers: Headers) {
  const proxyMode = String(process.env.TRUSTED_PROXY_MODE || "direct").toLowerCase();
  if (proxyMode === "cloudflare") return headers.get("cf-connecting-ip")?.trim() || "0.0.0.0";
  if (proxyMode === "trusted") return headers.get("x-real-ip")?.trim() || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0";
  return "0.0.0.0";
}

export function evaluateSecurityRequest(input: SecurityRequestInput): SecurityDecision {
  const botDetectionEnabled = input.botDetectionEnabled !== false;
  const botLevel = normalizeBotDetectionLevel(input.botDetectionLevel);
  const botPolicy = botPolicyForLevel(botLevel);
  const ip = input.ip.toLowerCase();
  const country = input.country.toLowerCase();
  const userAgent = input.userAgent.toLowerCase();
  const target = `${input.pathname}?${input.query}`.toLowerCase();
  const reasons: string[] = [];
  let score = 0;

  if (input.whitelistedIps?.includes(ip)) {
    return { action: "allow", score: 0, reasons: ["IP whitelist"] };
  }

  if (input.blacklistedIps?.includes(ip)) {
    return { action: "block", score: 100, reasons: ["IP blacklist"] };
  }

  // Country, language, timezone, VPN, and travel signals never decide bot status alone.
  // Bot classification can be disabled without weakening explicit security rules.
  if (botDetectionEnabled) {
    const blockedAgent = [...defaultBadUserAgents, ...(input.blacklistedUserAgents || [])].find((agent) => userAgent.includes(agent));
    if (blockedAgent) {
      score += 35;
      reasons.push(`Bot user agent: ${blockedAgent}`);
    }

    if (!userAgent) {
      score += 25;
      reasons.push("Missing user agent");
    }
  }

  const matchedAttack = attackPatterns.find((pattern) => target.includes(pattern));
  if (matchedAttack) {
    score += 55;
    reasons.push(`Request validation failed: ${matchedAttack}`);
  }

  if (botDetectionEnabled && input.requestCount > botPolicy.requestHardLimit) {
    score += 50;
    reasons.push("Request rate over hard limit");
  } else if (botDetectionEnabled && input.requestCount > botPolicy.requestSoftLimit) {
    score += 25;
    reasons.push("Request rate elevated");
  }

  if (input.failedAuthCount >= 8) {
    score += 45;
    reasons.push("Repeated failed authentication");
  } else if (input.failedAuthCount >= 4) {
    score += 20;
    reasons.push("Excessive login attempts");
  }

  if (input.contentLength > 2_000_000) {
    score += 30;
    reasons.push("Large request body");
  }

  if (input.method !== "GET" && input.method !== "POST" && input.method !== "HEAD" && input.method !== "OPTIONS") {
    score += 20;
    reasons.push("Unexpected HTTP method");
  }

  const blockThreshold = botDetectionEnabled ? botPolicy.blockScore : 75;
  const throttleThreshold = botDetectionEnabled ? botPolicy.throttleScore : 45;
  if (score >= blockThreshold) return { action: "block", score, reasons, retryAfterSeconds: 900 };
  if (score >= throttleThreshold) return { action: "throttle", score, reasons, retryAfterSeconds: 60 };
  return { action: "allow", score, reasons: reasons.length ? reasons : ["Security checks passed"] };
}
