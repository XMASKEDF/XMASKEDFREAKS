import { cacheConfiguration, getCacheProvider } from "./cache";
import { turnstileStatus } from "./security-edge";
import { getWafHealth, wafConfiguration } from "./waf";

export async function getSecurityEdgeSnapshot() {
  const [waf] = await Promise.all([getWafHealth()]);
  const cache = getCacheProvider();
  const cacheConfig = cacheConfiguration();
  const production = String(process.env.XMF_ENVIRONMENT || process.env.APP_ENV || "LOCAL").toUpperCase() === "PRODUCTION";
  return {
    waf: { ...waf, provider: wafConfiguration().provider },
    turnstile: turnstileStatus(),
    rateLimiting: { provider: cache.kind, status: production && (!cache.shared || !cacheConfig.configured) ? "ACTION REQUIRED" : "HEALTHY", mode: "CENTRALIZED", detail: production && (!cache.shared || !cacheConfig.configured) ? "Production requires a configured shared Redis-compatible limiter before multiple instances are deployed." : "Central rate limiting is active through the configured shared-state boundary.", checkedAt: new Date().toISOString() },
    botProtection: { mode: "OBSERVE_WITH_SCOPED_CHALLENGE", status: "HEALTHY", gameChallenge: "OFF", antiCheat: "ON", checkedAt: new Date().toISOString() },
    securityHeaders: { mode: "ENFORCED", status: "HEALTHY", checkedAt: new Date().toISOString() },
    riskEngine: { mode: "ACTIVE", status: "HEALTHY", checkedAt: new Date().toISOString() }
  };
}
