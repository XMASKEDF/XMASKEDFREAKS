import type { InfrastructureStatus, ProviderKind } from "./types";

export type WafMode = "disabled" | "observe" | "active";
export type WafHealth = { provider: ProviderKind; mode: WafMode; status: InfrastructureStatus; detail: string; checkedAt: string; latencyMs?: number };

export function wafMode(value: unknown = process.env.WAF_MODE): WafMode {
  return value === "active" || value === "observe" ? value : "disabled";
}

export function wafConfiguration() {
  return { provider: String(process.env.WAF_PROVIDER || "cloudflare").toLowerCase(), mode: wafMode(), tokenConfigured: Boolean(process.env.CLOUDFLARE_API_TOKEN), zoneConfigured: Boolean(process.env.CLOUDFLARE_ZONE_ID), accountConfigured: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID) };
}

export class CloudflareWafProvider {
  readonly kind = "CLOUDFLARE" as const;
  async health(): Promise<WafHealth> {
    const config = wafConfiguration();
    if (config.mode === "disabled") return { provider: this.kind, mode: config.mode, status: "NOT CONFIGURED", detail: "Cloudflare WAF management is disabled until the owner enables the approved mode.", checkedAt: new Date().toISOString() };
    if (!config.tokenConfigured) return { provider: this.kind, mode: config.mode, status: "ACTION REQUIRED", detail: "Cloudflare WAF mode is enabled but CLOUDFLARE_API_TOKEN is not configured.", checkedAt: new Date().toISOString() };
    const started = Date.now();
    const response = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", { headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` }, signal: AbortSignal.timeout(2500) }).catch(() => null);
    return { provider: this.kind, mode: config.mode, status: response?.ok ? "HEALTHY" : response?.status === 401 || response?.status === 403 ? "ACTION REQUIRED" : "DEGRADED", detail: response?.ok ? "Cloudflare token verification succeeded; no account configuration was changed." : "Cloudflare read-only token verification failed.", checkedAt: new Date().toISOString(), latencyMs: Date.now() - started };
  }
}

export async function getWafHealth() { return new CloudflareWafProvider().health(); }
