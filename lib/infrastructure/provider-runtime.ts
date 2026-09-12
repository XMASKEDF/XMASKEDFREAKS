import type { BackupProvider, DeploymentProvider, ExternalHealthMonitorProvider, ProviderHealth, StreamingProvider } from "./provider-interfaces";
import type { InfrastructureEnvironment, InfrastructureStatus } from "./types";

export type StreamingState = "OFFLINE" | "CONNECTING" | "LIVE" | "DEGRADED" | "FAILED";

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stateCandidate(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function normalizeStreamingState(payload: unknown, responseOk = true): StreamingState {
  const data = recordValue(payload) || {};
  const result = recordValue(data.result);
  const status = result ? recordValue(result.status) : undefined;
  const statusCurrent = status ? recordValue(status.current) : undefined;
  const current = result ? recordValue(result.current) : undefined;
  const rawState = stateCandidate(status?.state)
    || stateCandidate(statusCurrent?.state)
    || stateCandidate(result?.status)
    || stateCandidate(result?.state)
    || stateCandidate(current?.state)
    || stateCandidate(data.state);
  const normalized = rawState?.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized === "CONNECTED" || normalized === "LIVE" || normalized === "CONNECTED_TO_INGEST") return "LIVE";
  if (normalized === "CONNECTING" || normalized === "RECONNECTING") return "CONNECTING";
  if (normalized === "OFFLINE" || normalized === "DISCONNECTED") return "OFFLINE";
  if (normalized === "DEGRADED") return "DEGRADED";
  if (normalized === "FAILED" || normalized === "ERROR") return "FAILED";
  return responseOk ? "DEGRADED" : "FAILED";
}

export function resolveStreamingPlaybackUrl(configuredUrl: string, quality: "AUTO" | "1080P" | "720P" | "LOW"): { url: string; pathType: "exact-manifest" | "base-derived" } {
  const manifestPath = configuredUrl.split(/[?#]/, 1)[0].toLowerCase();
  if (manifestPath.endsWith(".m3u8")) return { url: configuredUrl, pathType: "exact-manifest" };
  const base = configuredUrl.replace(/\/$/, "");
  return { url: `${base}/${quality.toLowerCase()}.m3u8`, pathType: "base-derived" };
}

function providerStatus(ok: boolean, detail: string, startedAt: number): ProviderHealth { return { status: ok ? "HEALTHY" : "DEGRADED", detail, latencyMs: Date.now() - startedAt, checkedAt: new Date().toISOString() }; }

export class ConfiguredExternalHealthMonitorProvider implements ExternalHealthMonitorProvider {
  readonly kind = "CUSTOM" as const;
  constructor(private readonly baseUrl: string, private readonly token: string) {}
  async register(endpoint: string) {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/checks`, { method: "POST", headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" }, body: JSON.stringify({ endpoint, environment: process.env.XMF_ENVIRONMENT || "LOCAL" }) }).catch(() => null);
    return response?.ok ? { accepted: true, detail: "Endpoint registered with the configured external monitor." } : { accepted: false, detail: "External monitor registration failed." };
  }
  async health() { const started = Date.now(); const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/health`, { headers: { authorization: `Bearer ${this.token}` }, cache: "no-store" }).catch(() => null); return providerStatus(Boolean(response?.ok), response?.ok ? "External monitor responded." : "External monitor did not respond.", started); }
}

export class ConfiguredBackupProvider implements BackupProvider {
  readonly kind = "CUSTOM" as const;
  constructor(private readonly statusUrl: string, private readonly restoreTestUrl?: string, private readonly token?: string) {}
  private headers(): Record<string, string> { return this.token ? { authorization: `Bearer ${this.token}` } : {}; }
  async status() {
    const response = await fetch(this.statusUrl, { headers: this.headers(), cache: "no-store" }).catch(() => null);
    const data = response?.ok ? await response.json().catch(() => ({})) as Record<string, unknown> : {};
    const health = (key: string): ProviderHealth => ({ status: response?.ok && data[key] === true ? "HEALTHY" : response?.ok ? "DEGRADED" : "OFFLINE", detail: response?.ok ? String(data[`${key}Detail`] || `${key} status returned by backup provider.`) : "Backup provider status could not be read.", checkedAt: new Date().toISOString() });
    return { database: health("databaseHealthy"), media: health("mediaHealthy"), pitr: response?.ok && data.pitrHealthy === true ? "HEALTHY" : "DEGRADED" as InfrastructureStatus, lastRestoreTest: typeof data.lastRestoreTest === "string" ? data.lastRestoreTest : null };
  }
  async verifyRestore(environment: Exclude<InfrastructureEnvironment, "PRODUCTION">) {
    if (!this.restoreTestUrl) return { accepted: false, reference: "UNVERIFIED", detail: "A staging/sandbox restore-test endpoint is not configured." };
    const response = await fetch(this.restoreTestUrl, { method: "POST", headers: { ...this.headers(), "content-type": "application/json" }, body: JSON.stringify({ environment }) }).catch(() => null);
    const data = response?.ok ? await response.json().catch(() => ({})) as Record<string, unknown> : {};
    return { accepted: Boolean(response?.ok), reference: String(data.reference || "UNVERIFIED"), detail: String(data.detail || (response?.ok ? "Restore test accepted." : "Restore test was not accepted.")) };
  }
}

export class ConfiguredStreamingProvider implements StreamingProvider {
  readonly kind = "CUSTOM" as const;
  constructor(private readonly healthUrl: string, private readonly playbackBaseUrl: string, private readonly token?: string) {}
  private headers(): Record<string, string> { return this.token ? { authorization: `Bearer ${this.token}` } : {}; }
  async health() {
    const started = Date.now();
    const response = await fetch(this.healthUrl, { cache: "no-store", headers: this.headers() }).catch(() => null);
    const data = response?.ok ? await response.json().catch(() => ({})) as Record<string, unknown> : {};
    const state = normalizeStreamingState(data, Boolean(response?.ok));
    return { ...providerStatus(Boolean(response?.ok) && state !== "FAILED", response?.ok ? `Streaming provider state: ${state}.` : "Streaming provider health did not respond.", started), state };
  }
  async playbackUrl(quality: "AUTO" | "1080P" | "720P" | "LOW") {
    return resolveStreamingPlaybackUrl(this.playbackBaseUrl, quality).url;
  }
}

export class ConfiguredDeploymentProvider implements DeploymentProvider {
  readonly kind = "CUSTOM" as const;
  constructor(private readonly healthUrl: string, private readonly rollbackUrl?: string, private readonly token?: string) {}
  private headers(): Record<string, string> { return this.token ? { authorization: `Bearer ${this.token}` } : {}; }
  async releaseHealth() {
    const response = await fetch(this.healthUrl, { headers: this.headers(), cache: "no-store" }).catch(() => null);
    const data = response?.ok ? await response.json().catch(() => ({})) as Record<string, unknown> : {};
    const health = ["HEALTHY", "DEGRADED", "OFFLINE", "ACTION REQUIRED", "NOT CONFIGURED", "SANDBOX"].includes(String(data.health)) ? String(data.health) as InfrastructureStatus : response?.ok ? "DEGRADED" as const : "OFFLINE" as const;
    return { currentRelease: String(data.currentRelease || process.env.DEPLOYMENT_VERSION || "unknown"), previousRelease: typeof data.previousRelease === "string" ? data.previousRelease : process.env.PREVIOUS_RELEASE_VERSION || null, deployedAt: typeof data.deployedAt === "string" ? data.deployedAt : process.env.DEPLOYMENT_TIME || null, health, rollbackReady: Boolean(data.rollbackReady || process.env.PREVIOUS_RELEASE_VERSION) };
  }
  async rollback(reference: string) {
    if (!this.rollbackUrl) return { accepted: false, detail: "Rollback endpoint is not configured; no production action was attempted." };
    const response = await fetch(this.rollbackUrl, { method: "POST", headers: { ...this.headers(), "content-type": "application/json" }, body: JSON.stringify({ reference }) }).catch(() => null);
    return { accepted: Boolean(response?.ok), detail: response?.ok ? "Rollback request accepted by the configured deployment provider." : "Rollback request was not accepted." };
  }
}

export function getExternalHealthMonitorProvider() {
  if (["", "NONE", "DISABLED"].includes(String(process.env.EXTERNAL_MONITOR_PROVIDER || "NONE").toUpperCase())) return null;
  const baseUrl = process.env.EXTERNAL_MONITOR_URL;
  const token = process.env.EXTERNAL_MONITOR_TOKEN;
  return baseUrl && token ? new ConfiguredExternalHealthMonitorProvider(baseUrl, token) : null;
}

export function getBackupProvider() {
  if (["", "NONE", "DISABLED"].includes(String(process.env.BACKUP_PROVIDER || "NONE").toUpperCase())) return null;
  const statusUrl = process.env.BACKUP_STATUS_URL;
  return statusUrl ? new ConfiguredBackupProvider(statusUrl, process.env.BACKUP_RESTORE_TEST_URL, process.env.BACKUP_PROVIDER_TOKEN) : null;
}

export function getStreamingProvider() {
  if (["", "NONE", "DISABLED"].includes(String(process.env.STREAMING_PROVIDER || "NONE").toUpperCase())) return null;
  const healthUrl = process.env.STREAM_HEALTH_URL;
  const playbackBaseUrl = process.env.STREAM_PLAYBACK_BASE_URL;
  const token = process.env.CLOUDFLARE_STREAM_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
  return healthUrl && playbackBaseUrl ? new ConfiguredStreamingProvider(healthUrl, playbackBaseUrl, token) : null;
}

export function getDeploymentProvider() {
  const healthUrl = process.env.DEPLOYMENT_HEALTH_URL;
  return healthUrl ? new ConfiguredDeploymentProvider(healthUrl, process.env.DEPLOYMENT_ROLLBACK_URL, process.env.DEPLOYMENT_PROVIDER_TOKEN) : null;
}
