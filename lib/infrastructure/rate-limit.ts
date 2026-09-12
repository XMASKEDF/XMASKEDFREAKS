import { getCacheProvider } from "./cache";
import { GAME_RATE_LIMIT_POLICIES } from "./bot-policy";
import { privateStateKey } from "./shared-state";

export type RateLimitRule = { name: string; limit: number; windowSeconds: number; burst?: number };
export const rateLimitRules: Record<string, RateLimitRule> = {
  login: { name: "login", limit: 10, windowSeconds: 60 }, registration: { name: "registration", limit: 5, windowSeconds: 3600 },
  passwordReset: { name: "passwordReset", limit: 5, windowSeconds: 3600 }, adminLogin: { name: "adminLogin", limit: 8, windowSeconds: 300 },
  checkout: { name: "checkout", limit: 20, windowSeconds: 60 }, tips: { name: "tips", limit: 30, windowSeconds: 60 }, paymentCallback: { name: "paymentCallback", limit: 120, windowSeconds: 60 },
  feedback: { name: "feedback", limit: 10, windowSeconds: 3600 }, newsletter: { name: "newsletter", limit: 5, windowSeconds: 3600 }, search: { name: "search", limit: 60, windowSeconds: 60 }, downloads: { name: "downloads", limit: 30, windowSeconds: 60 }, scores: { name: "scores", limit: 30, windowSeconds: 60 }, uploads: { name: "uploads", limit: 20, windowSeconds: 3600 }, adminApi: { name: "adminApi", limit: 120, windowSeconds: 60 },
  gameplayNormal: GAME_RATE_LIMIT_POLICIES.GAMEPLAY_NORMAL,
  gameScoreSubmission: GAME_RATE_LIMIT_POLICIES.GAME_SCORE_SUBMISSION
};

export function ruleForPath(pathname: string, method: string) {
  if (pathname.includes("/admin/login") || pathname === "/api/admin/login") return rateLimitRules.adminLogin;
  if (pathname.includes("/password-reset")) return rateLimitRules.passwordReset;
  if (pathname.includes("/register") || pathname.includes("/signup")) return rateLimitRules.registration;
  if (pathname.includes("/tips")) return rateLimitRules.tips;
  if (pathname.includes("/checkout") || pathname.includes("/payments/hosted")) return rateLimitRules.checkout;
  if (pathname.includes("/webhooks/") || pathname.includes("/payment-callback")) return rateLimitRules.paymentCallback;
  if (pathname.includes("/newsletter")) return rateLimitRules.newsletter;
  if (pathname.includes("/feedback")) return rateLimitRules.feedback;
  if (pathname === "/api/games/settings" && method !== "GET") return rateLimitRules.adminApi;
  if (pathname === "/api/games/scores") return rateLimitRules.gameScoreSubmission;
  if (pathname.startsWith("/api/games/")) return rateLimitRules.gameplayNormal;
  if (pathname.includes("/upload") || pathname.includes("/media")) return rateLimitRules.uploads;
  if (pathname.includes("/search")) return rateLimitRules.search;
  if (pathname.includes("/download")) return rateLimitRules.downloads;
  if (method !== "GET" && pathname.startsWith("/api/admin/")) return rateLimitRules.adminApi;
  return null;
}

export async function checkRateLimit(rule: RateLimitRule, subject: string) { const cache = getCacheProvider(); const key = await privateStateKey("rate-limit", `${rule.name}:${subject.slice(0, 160)}`); const count = await cache.increment(key, 1, rule.windowSeconds); return { allowed: count <= rule.limit, count, limit: rule.limit, remaining: Math.max(0, rule.limit - count), retryAfterSeconds: rule.windowSeconds, backend: cache.kind, shared: cache.shared }; }
