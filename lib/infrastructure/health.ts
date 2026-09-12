import { cacheConfiguration, getCacheProvider } from "./cache";
import { getBatch1ProviderStatuses } from "./provider-configuration";
import { getJobQueueProvider } from "./queue";
import { featureFlagStates, getFeatureFlagProvider } from "./flags";
import { getAssetDeliveryProvider } from "./delivery";
import { getObjectStorageProvider, storageBuckets } from "./storage";
import { emailConfiguration } from "../email/provider";
import { getBackupProvider, getDeploymentProvider, getExternalHealthMonitorProvider, getStreamingProvider } from "./provider-runtime";
import { getSecurityEdgeSnapshot } from "./security-status";
import { mediaToolHealth } from "@/lib/media/processor";
import { metricsSnapshot } from "./observability";
import type { InfrastructureEnvironment, InfrastructureServiceId, InfrastructureServiceStatus, InfrastructureSnapshot, InfrastructureStatus, ProviderKind } from "./types";

const serviceDefinitions: Array<{ id: InfrastructureServiceId; label: string; provider: ProviderKind; switchable: boolean }> = [
  { id: "application", label: "Application", provider: "LOCAL", switchable: false }, { id: "storage", label: "Storage", provider: "LOCAL", switchable: true },
  { id: "cdn", label: "CDN / Asset Delivery", provider: "NONE", switchable: true }, { id: "cache", label: "Cache", provider: "LOCAL", switchable: true },
  { id: "queue", label: "Queue", provider: "LOCAL", switchable: true }, { id: "workers", label: "Background Workers", provider: "LOCAL", switchable: true },
  { id: "database", label: "Database", provider: "SUPABASE", switchable: false }, { id: "backups", label: "Backups", provider: "NONE", switchable: true },
  { id: "rate-limiting", label: "Rate Limiting", provider: "LOCAL", switchable: false }, { id: "security-edge", label: "Security Edge", provider: "NONE", switchable: false },
  { id: "streaming", label: "Streaming", provider: "NONE", switchable: true }, { id: "media-processing", label: "Media Processing", provider: "LOCAL", switchable: true },
  { id: "email", label: "Email Delivery", provider: "NONE", switchable: true }, { id: "external-monitoring", label: "External Monitoring", provider: "NONE", switchable: true },
  { id: "audit-ledger", label: "Audit Ledger", provider: "SUPABASE", switchable: false }, { id: "staging", label: "Staging Isolation", provider: "NONE", switchable: false }, { id: "upload-scanning", label: "Upload Scanning", provider: "NONE", switchable: false },
  { id: "risk-engine", label: "Risk Engine", provider: "LOCAL", switchable: false }, { id: "entitlements", label: "Entitlement Service", provider: "LOCAL", switchable: false }, { id: "cost-control", label: "Cost Control", provider: "LOCAL", switchable: true },
  { id: "deployment", label: "Deployment / Release Health", provider: "LOCAL", switchable: false }, { id: "event-bus", label: "Event Bus", provider: "LOCAL", switchable: false }
];

function environment(): InfrastructureEnvironment { const value = String(process.env.XMF_ENVIRONMENT || process.env.APP_ENV || "LOCAL").toUpperCase(); return ["LOCAL", "SANDBOX", "STAGING", "PRODUCTION"].includes(value) ? value as InfrastructureEnvironment : "LOCAL"; }
function configured(name: string) { const value = String(process.env[name] || "").trim(); return Boolean(value && value !== "NONE" && !value.startsWith("replace-") && !value.includes("your-")); }
function providerFromEnvironment(name: string): ProviderKind { const value = String(process.env[name] || "NONE").toUpperCase(); return ["NONE", "LOCAL", "CLOUDFLARE", "SUPABASE", "UPSTASH", "S3_COMPATIBLE", "REDIS_COMPATIBLE", "CUSTOM"].includes(value) ? value as ProviderKind : "CUSTOM"; }
function localStatus(env: InfrastructureEnvironment): InfrastructureStatus { return env === "SANDBOX" ? "SANDBOX" : env === "PRODUCTION" ? "ACTION REQUIRED" : "HEALTHY"; }

async function databaseStatus() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || url.includes("your-project") || key.startsWith("replace-")) return { status: "NOT CONFIGURED" as const, health: "Supabase service credentials are not configured.", errorState: null };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_500);
  try {
    const response = await fetch(`${url}/auth/v1/health`, { cache: "no-store", signal: controller.signal, headers: { apikey: key } });
    return { status: response.ok ? "HEALTHY" as const : "DEGRADED" as const, health: response.ok ? "Supabase health endpoint responded." : `Supabase health returned ${response.status}.`, errorState: response.ok ? null : `HTTP ${response.status}` };
  } catch (error) { return { status: "OFFLINE" as const, health: "Supabase health check did not respond.", errorState: error instanceof Error ? error.name : "health_check_failed" }; } finally { clearTimeout(timer); }
}

export async function getPublicHealthStatus() {
  const database = await databaseStatus();
  return { status: database.status === "OFFLINE" ? "degraded" as const : "ok" as const, checkedAt: new Date().toISOString() };
}

export async function getReadinessStatus() {
  const currentEnvironment = environment();
  const database = await databaseStatus();
  const ready = currentEnvironment !== "PRODUCTION" || database.status === "HEALTHY";
  return {
    ready,
    status: ready ? "ok" as const : "not_ready" as const,
    checkedAt: new Date().toISOString(),
    reason: ready ? null : "A production database health check is required before accepting traffic."
  };
}

export async function getInfrastructureSnapshot(): Promise<InfrastructureSnapshot> {
  const env = environment();
  const now = new Date().toISOString();
  const database = await databaseStatus();
  const edge = await getSecurityEdgeSnapshot();
  const mediaProbe = await mediaToolHealth();
  const email = emailConfiguration();
  const queue = getJobQueueProvider();
  const cache = getCacheProvider();
  const cacheConfig = cacheConfiguration();
  const cacheProbe = await cache.health();
  const storageProvider = getObjectStorageProvider();
  const storageProbe = await Promise.race([storageProvider.health(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 2_500))]);
  const storageStatus: InfrastructureStatus = storageProvider.kind === "LOCAL" ? localStatus(env) : storageProbe?.status || "DEGRADED";
  const storageDetail = storageProvider.kind === "LOCAL" ? "Local storage adapter available for development." : storageProbe?.detail || "Storage provider is configured but no health response was received.";
  const deliveryProvider = getAssetDeliveryProvider();
  const backupProvider = getBackupProvider();
  const backupKind = providerFromEnvironment("BACKUP_PROVIDER");
  const backupConfigured = Boolean(backupProvider);
  const backupProbe = backupProvider ? await Promise.race([backupProvider.status(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 2_500))]) : null;
  const backupStatus: InfrastructureStatus = !backupConfigured ? "NOT CONFIGURED" : env === "SANDBOX" ? "SANDBOX" : backupProbe?.database.status || "DEGRADED";
  const streamingProvider = getStreamingProvider();
  const streamingProbe = streamingProvider ? await Promise.race([streamingProvider.health(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 2_500))]) : null;
  const externalMonitor = getExternalHealthMonitorProvider();
  const externalMonitorProbe = externalMonitor ? await Promise.race([externalMonitor.health(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 2_500))]) : null;
  const deploymentProvider = getDeploymentProvider();
  const deploymentProbe = deploymentProvider ? await Promise.race([deploymentProvider.releaseHealth(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 2_500))]) : null;
  const flags = getFeatureFlagProvider();
  const services: InfrastructureServiceStatus[] = serviceDefinitions.map((definition) => {
    let status: InfrastructureStatus = "NOT CONFIGURED";
    let health = "Provider has not been connected or checked.";
    let errorState: string | null = null;
    if (definition.id === "database") { status = database.status; health = database.health; errorState = database.errorState; }
    else if (["application", "rate-limiting", "event-bus", "risk-engine", "entitlements", "cost-control"].includes(definition.id)) { status = localStatus(env); health = env === "PRODUCTION" ? "Application service is present; production telemetry and provider checks remain required." : "Local service self-check passed."; errorState = env === "PRODUCTION" ? "PRODUCTION_TELEMETRY_REQUIRED" : null; }
    else if (definition.id === "audit-ledger") { status = database.status === "HEALTHY" ? "HEALTHY" : env === "PRODUCTION" ? "ACTION REQUIRED" : "HEALTHY"; health = database.status === "HEALTHY" ? "Append-only ledger uses the configured database service." : "Local audit events are retained only when a database service is configured."; errorState = database.status === "HEALTHY" ? null : env === "PRODUCTION" ? "DATABASE_REQUIRED" : null; }
    else if (definition.id === "staging") { status = env === "STAGING" ? "HEALTHY" : env === "SANDBOX" ? "SANDBOX" : "NOT CONFIGURED"; health = env === "STAGING" ? "This process is isolated as the staging environment." : "Staging is a separate deployment and is not represented by the local process."; errorState = env === "STAGING" || env === "SANDBOX" ? null : "SEPARATE_ENVIRONMENT_REQUIRED"; }
    else if (definition.id === "upload-scanning") { const scannerConfigured = configured("UPLOAD_SCANNER_URL") && configured("UPLOAD_SCANNER_TOKEN") && process.env.UPLOAD_SCANNER_MODE === "url"; status = scannerConfigured ? "DEGRADED" : "NOT CONFIGURED"; health = scannerConfigured ? "URL-capable scanner credentials are configured; a live scan is required per asset." : "Uploads remain quarantined because no approved URL-capable malware scanner is configured."; errorState = scannerConfigured ? "PROVIDER_PROBE_REQUIRED" : null; }
    else if (definition.id === "storage") { status = storageStatus; health = storageDetail; errorState = storageProvider.kind === "LOCAL" && env === "PRODUCTION" ? "LOCAL_ADAPTER_IN_PRODUCTION" : storageProbe?.status === "ACTION REQUIRED" ? "STORAGE_PROVIDER_ACCESS_REQUIRED" : storageProbe && storageProbe.status !== "HEALTHY" ? "STORAGE_HEALTH_CHECK_FAILED" : null; }
    else if (definition.id === "email") { status = email.mode === "disabled" ? "NOT CONFIGURED" : email.configured ? "DEGRADED" : "ACTION REQUIRED"; health = email.mode === "disabled" ? "Email delivery is disabled; no external messages can be sent." : email.configured ? `${email.provider} is configured; sender verification and delivery probes remain required.` : "Email provider configuration is incomplete and delivery is fail-closed."; errorState = email.configured ? "SENDER_VERIFICATION_REQUIRED" : "EMAIL_PROVIDER_CONFIGURATION_REQUIRED"; }
    else if (definition.id === "cdn") { status = deliveryProvider.kind === "LOCAL" ? "NOT CONFIGURED" : "DEGRADED"; health = deliveryProvider.kind === "LOCAL" ? "No CDN public base or provider is configured." : "CDN delivery is configured; targeted purge and edge health probes remain required."; errorState = deliveryProvider.kind === "LOCAL" ? null : "PROVIDER_PROBE_REQUIRED"; }
    else if (definition.id === "cache") { status = cache.kind === "LOCAL" ? localStatus(env) : cacheProbe.status; health = cache.kind === "LOCAL" ? (cacheConfig.requestedProvider === "REDIS_COMPATIBLE" && !cacheConfig.configured ? "Redis-compatible shared state is requested but its server-only endpoint/token configuration is incomplete." : "Local cache adapter available for development and single-instance operation.") : cacheProbe.detail; errorState = cache.kind === "LOCAL" && env === "PRODUCTION" ? "LOCAL_ADAPTER_IN_PRODUCTION" : cache.kind === "LOCAL" && !cacheConfig.configured ? "SHARED_CACHE_CONFIGURATION_REQUIRED" : cache.kind !== "LOCAL" && !cacheProbe.reachable ? "SHARED_CACHE_PROVIDER_UNAVAILABLE" : null; }
    else if (definition.id === "media-processing") { status = mediaProbe.status as InfrastructureStatus; health = mediaProbe.detail; errorState = status === "HEALTHY" ? null : "MEDIA_WORKER_OR_TOOLING_REQUIRED"; }
    else if (["queue", "deployment"].includes(definition.id)) { status = localStatus(env); health = env === "PRODUCTION" ? "Local adapter requires an approved production provider." : "Local adapter available."; errorState = env === "PRODUCTION" ? "LOCAL_ADAPTER_IN_PRODUCTION" : null; }
    else if (definition.id === "backups") { status = backupStatus; health = !backupConfigured ? "No approved backup provider is configured." : backupProbe?.database.detail || "Backup provider configured; independent backup and restore probes are required."; errorState = backupConfigured && !backupProbe ? "PROVIDER_PROBE_REQUIRED" : null; }
    else if (definition.id === "streaming" && streamingProvider) { status = streamingProbe?.status || "DEGRADED"; health = streamingProbe?.detail || "Streaming provider is configured but no provider health response was received."; errorState = streamingProbe ? null : "PROVIDER_PROBE_REQUIRED"; }
    else if (definition.id === "external-monitoring" && externalMonitor) { status = externalMonitorProbe?.status || "DEGRADED"; health = externalMonitorProbe?.detail || "External monitoring is configured but no provider health response was received."; errorState = externalMonitorProbe ? null : "PROVIDER_PROBE_REQUIRED"; }
    else if (definition.id === "deployment" && deploymentProvider) { status = deploymentProbe?.health || "DEGRADED"; health = deploymentProbe ? `Release ${deploymentProbe.currentRelease} is reported by the deployment provider.` : "Deployment provider is configured but no release health response was received."; errorState = deploymentProbe ? null : "PROVIDER_PROBE_REQUIRED"; }
    else if (definition.id === "security-edge") { status = edge.waf.status; health = edge.waf.detail; errorState = status === "HEALTHY" ? null : "EDGE_PROVIDER_CONFIGURATION_REQUIRED"; }
    return { ...definition, status, provider: definition.id === "storage" ? storageProvider.kind : definition.id === "cdn" ? deliveryProvider.kind : definition.id === "cache" ? cache.kind : definition.id === "email" && email.provider !== "disabled" ? "CUSTOM" : definition.id === "streaming" && streamingProvider ? "CUSTOM" : definition.id === "backups" ? backupKind : definition.id === "external-monitoring" && externalMonitor ? "CUSTOM" : definition.id === "security-edge" ? "CLOUDFLARE" : definition.provider, lastCheck: now, health, errorState, enabled: status !== "NOT CONFIGURED", switchable: definition.switchable };
  });
  return {
    environment: env,
    release: { version: deploymentProbe?.currentRelease || process.env.DEPLOYMENT_VERSION || process.env.VERCEL_GIT_COMMIT_SHA || "local", deployedAt: deploymentProbe?.deployedAt || process.env.DEPLOYMENT_TIME || null, previousRelease: deploymentProbe?.previousRelease || process.env.PREVIOUS_RELEASE_VERSION || null, rollbackReady: deploymentProbe?.rollbackReady || Boolean(process.env.PREVIOUS_RELEASE_VERSION) },
    services, metrics: metricsSnapshot(), queue: queue.stats(), cache: { provider: cache.kind, shared: cache.shared, configured: cacheConfig.configured, reachable: cacheProbe.reachable, status: cache.kind === "LOCAL" ? localStatus(env) : cacheProbe.status, detail: cacheProbe.detail, latencyMs: cacheProbe.latencyMs, errors: "errorCount" in cache && typeof cache.errorCount === "function" ? cache.errorCount() : 0, ...cache.stats() }, storage: { provider: storageProvider.kind, publicRoot: process.env.CDN_PUBLIC_BASE_URL || null, privateSigning: storageProvider.kind !== "LOCAL" || Boolean(process.env.SIGNED_DOWNLOAD_SECRET && !process.env.SIGNED_DOWNLOAD_SECRET.startsWith("replace-")), status: storageStatus, detail: storageDetail, checkedAt: storageProbe?.checkedAt || now, ...(storageProbe?.latencyMs === undefined ? {} : { latencyMs: storageProbe.latencyMs }), buckets: storageBuckets() },
    providerConfiguration: getBatch1ProviderStatuses(),
    backup: { provider: backupKind, database: backupStatus, media: backupProbe?.media.status || backupStatus, pitr: backupProbe?.pitr || backupStatus, lastBackup: process.env.BACKUP_LAST_SUCCESS_AT || null, lastRestoreTest: backupProbe?.lastRestoreTest || process.env.BACKUP_LAST_RESTORE_TEST_AT || null },
    featureFlags: flags.list().map((flag) => ({ ...flag, state: featureFlagStates.includes(flag.state) ? flag.state : "OFF" })),
    security: { waf: edge.waf.status, ddos: edge.waf.status, botProtection: edge.turnstile.status as InfrastructureStatus, managedRateLimit: edge.rateLimiting.status as InfrastructureStatus }, generatedAt: now
  };
}
