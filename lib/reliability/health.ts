import { performance } from "perf_hooks";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { getMaintenanceSettings } from "@/lib/maintenance";
import { getEmailProvider } from "@/lib/email/provider";
import { getHostedCheckoutProvider } from "@/lib/payments/provider";
import { getPrintifyHealth } from "@/lib/commerce/printify";
import { getObjectStorageProvider } from "@/lib/infrastructure/storage";
import { circuitSnapshot } from "@/lib/reliability/circuit-breaker";
import { recordReliabilityIncident, reliabilityRows } from "@/lib/reliability/server";
import type {
  HealthCheck,
  PlatformStatus,
  ReliabilityCenterData,
  ReliabilityIncident
} from "@/lib/reliability/types";

type CheckResult = { functional: boolean; detail: string; state?: HealthCheck["state"] };

async function check(
  id: string,
  label: string,
  category: string,
  thresholdMs: number,
  operation: () => Promise<CheckResult>
): Promise<HealthCheck> {
  const started = performance.now();
  const checkedAt = new Date().toISOString();
  try {
    const result = await Promise.race([
      operation(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("CHECK_TIMEOUT")), Math.max(1500, thresholdMs * 4)))
    ]);
    const latencyMs = Math.round(performance.now() - started);
    return {
      id, label, category,
      state: result.state || (!result.functional ? "degraded" : latencyMs > thresholdMs ? "degraded" : "operational"),
      reachable: true,
      functional: result.functional,
      latencyMs,
      thresholdMs,
      detail: result.detail,
      checkedAt
    };
  } catch (error) {
    return {
      id, label, category, state: "outage", reachable: false, functional: false,
      latencyMs: Math.round(performance.now() - started), thresholdMs,
      detail: error instanceof Error && error.message === "CHECK_TIMEOUT" ? "Health check timed out." : "Service could not be verified.",
      checkedAt
    };
  }
}

function unverified(id: string, label: string, category: string, detail: string): HealthCheck {
  return { id, label, category, state: "unverified", reachable: null, functional: null, latencyMs: null, thresholdMs: 1000, detail, checkedAt: new Date().toISOString() };
}

async function restFunctional(path: string, healthy: (rows: Array<Record<string, unknown>>) => CheckResult) {
  const service = serviceCredentials();
  if (!service) throw new Error("DATABASE_NOT_CONFIGURED");
  const response = await fetch(`${service.url}/rest/v1/${path}`, { cache: "no-store", headers: serviceHeaders(service) });
  if (!response.ok) throw new Error(`REST_${response.status}`);
  return healthy(await response.json() as Array<Record<string, unknown>>);
}

export async function runReliabilityHealthChecks() {
  const service = serviceCredentials();
  const checks: HealthCheck[] = [
    { id: "application", label: "Website server", category: "Frontend Reliability", state: "operational", reachable: true, functional: true, latencyMs: 0, thresholdMs: 500, detail: "This protected server route executed normally.", checkedAt: new Date().toISOString() },
    service
      ? await check("database", "Database", "Database Health", 800, () => restFunctional("token_wallets?select=user_id&limit=1", () => ({ functional: true, detail: "Service-role query completed." })))
      : unverified("database", "Database", "Database Health", "Supabase service credentials are not connected."),
    service
      ? await check("auth", "Authentication", "Authentication", 800, async () => {
          const response = await fetch(`${service.url}/auth/v1/health`, { cache: "no-store", headers: { apikey: service.serviceKey } });
          return { functional: response.ok, detail: response.ok ? "Supabase Auth responded." : `Auth health returned ${response.status}.` };
        })
      : unverified("auth", "Authentication", "Authentication", "Authentication provider is not connected."),
    await check("storage", "Private storage", "Media", 1000, async () => {
      const health = await getObjectStorageProvider().health();
      const state = health.status === "HEALTHY" ? "operational" : health.status === "OFFLINE" ? "outage" : "degraded";
      return { functional: health.status === "HEALTHY", state, detail: health.detail };
    }),
    service
      ? await check("wallet", "Wallet integrity", "Wallet and Payment Health", 1200, async () => {
          const response = await fetch(`${service.url}/rest/v1/rpc/scan_wallet_integrity`, { method: "POST", cache: "no-store", headers: serviceHeaders(service), body: "{}" });
          if (!response.ok) return { functional: false, detail: "Wallet integrity scan migration is unavailable." };
          const rows = await response.json() as Array<{ is_consistent?: boolean }>;
          const mismatches = rows.filter((row) => row.is_consistent === false).length;
          return { functional: mismatches === 0, state: mismatches ? "outage" : "operational", detail: mismatches ? `${mismatches} wallet account(s) are held for reconciliation.` : "Wallet balances match completed ledger totals." };
        })
      : unverified("wallet", "Wallet integrity", "Wallet and Payment Health", "Database-backed wallet scan is unavailable."),
    await check("payment", "Hosted payment processor", "Wallet and Payment Health", 1000, async () => {
      const provider = getHostedCheckoutProvider();
      const health = await provider.health();
      return {
        functional: health.functional === true,
        state: health.functional === true ? "operational" : "unverified",
        detail: `${provider.name.toUpperCase()}: ${health.detail}`
      };
    }),
    service
      ? await check("orders", "Orders", "Order and Fulfillment Health", 900, () => restFunctional("commerce_orders?select=id,fulfillment_status,payment_status&limit=500", (rows) => {
          const failed = rows.filter((row) => row.fulfillment_status === "failed" || row.payment_status === "failed").length;
          return { functional: failed === 0, detail: failed ? `${failed} order(s) require review.` : "No failed orders were returned." };
        }))
      : unverified("orders", "Orders", "Order and Fulfillment Health", "Order storage is not connected."),
    await check("printify", "Printify fulfillment", "API and Integration Health", 1200, async () => {
      const provider = await getPrintifyHealth();
      if (!provider.configured) return { functional: false, state: "unverified", detail: provider.detail };
      if (!provider.functional) return { functional: false, state: "outage", detail: provider.detail };
      if (!service) return { functional: true, state: "degraded", detail: "Provider is reachable, but queue storage is unverified." };
      const queue = await restFunctional("printify_fulfillment_jobs?select=id,status,attempts,last_error_code&status=in.(failed,manual_approval,retry,processing)&limit=200", (rows) => {
        const blocked = rows.filter((row) => row.status === "failed" || row.status === "manual_approval").length;
        return { functional: blocked === 0, detail: blocked ? `${blocked} fulfillment job(s) require Admin review.` : `${rows.length} active or retryable fulfillment job(s).` };
      });
      return { ...queue, detail: `${provider.detail} ${queue.detail}` };
    }),
    await check("email", "Email delivery", "API and Integration Health", 800, async () => {
      const health = await getEmailProvider().health();
      const state = health.status === "HEALTHY" ? "operational" : health.status === "DEGRADED" ? "degraded" : health.status === "OFFLINE" ? "outage" : "unverified";
      return { functional: health.configured, state, detail: `${health.provider.toUpperCase()} / ${health.mode}: ${health.detail}` };
    }),
    service
      ? await check("notifications", "Notifications", "Background Jobs", 900, () => restFunctional("customer_notifications?select=id&limit=1", () => ({ functional: true, detail: "Notification storage responded." })))
      : unverified("notifications", "Notifications", "Background Jobs", "Notification storage is not connected."),
    { id: "search", label: "Search", category: "API and Integration Health", state: "operational", reachable: true, functional: true, latencyMs: 0, thresholdMs: 500, detail: "Search uses the local server-authoritative catalog.", checkedAt: new Date().toISOString() },
    await providerConfigurationCheck("live", "Live stream status", "Live System Status", Boolean(process.env.OBS_STATUS_ENDPOINT || process.env.OBS_LIVE || process.env.OBS_STREAM_ACTIVE), "OBS/live detection is not connected."),
    service
      ? await check("jobs", "Background workers", "Background Jobs", 1000, () => restFunctional("email_delivery_jobs?select=id,status,attempts&status=in.(pending,retry,processing,failed)&limit=500", (rows) => {
          const failed = rows.filter((row) => row.status === "failed").length;
          return { functional: failed === 0, detail: failed ? `${failed} email job(s) exhausted retries.` : `${rows.length} email job(s) pending or processing.` };
        }))
      : unverified("jobs", "Background workers", "Background Jobs", "Job storage is not connected."),
    service
      ? await check("backups", "Backup evidence", "Backups", 800, () => restFunctional("reliability_backups?select=status,completed_at,restore_tested_at&order=started_at.desc&limit=1", (rows) => {
          const latest = rows[0];
          return { functional: Boolean(latest && latest.status === "completed"), detail: latest ? `Latest recorded backup: ${String(latest.status)}.` : "No backup evidence has been recorded." };
        }))
      : unverified("backups", "Backup evidence", "Backups", "Backup monitoring is not connected.")
  ];
  return checks;
}

async function providerConfigurationCheck(id: string, label: string, category: string, configured: boolean, missing: string): Promise<HealthCheck> {
  return configured
    ? { id, label, category, state: "degraded", reachable: null, functional: null, latencyMs: null, thresholdMs: 1000, detail: "Configured; a provider-specific active probe is still required.", checkedAt: new Date().toISOString() }
    : unverified(id, label, category, missing);
}

function statusFrom(checks: HealthCheck[], incidents: ReliabilityIncident[], maintenance: boolean): PlatformStatus {
  if (maintenance) return "Kill Switch";
  const active = incidents.filter((incident) => !["Resolved", "False Positive"].includes(incident.status));
  if (active.some((incident) => incident.severity === 5)) return "Major Outage";
  if (active.some((incident) => incident.severity === 4) || checks.filter((item) => item.state === "outage").length >= 2) return "Partial Outage";
  if (active.some((incident) => incident.status === "Monitoring")) return "Recovering";
  if (active.some((incident) => incident.severity >= 3) || checks.some((item) => item.state === "outage" || item.state === "degraded")) return "Degraded";
  return "Operational";
}

export async function getReliabilityCenterData(): Promise<ReliabilityCenterData> {
  const service = serviceCredentials();
  const [checks, incidentsRaw, jobs, backups, deployments, securityEvents, alerts, paymentFindings, printifyFindings, maintenance] = await Promise.all([
    runReliabilityHealthChecks(),
    reliabilityRows("reliability_incidents?select=*&order=last_occurred_at.desc&limit=500"),
    reliabilityRows("printify_fulfillment_jobs?select=id,order_id,status,attempts,next_attempt_at,last_error_code,updated_at&order=updated_at.desc&limit=200"),
    reliabilityRows("reliability_backups?select=*&order=started_at.desc&limit=100"),
    reliabilityRows("reliability_deployments?select=*&order=deployed_at.desc&limit=100"),
    reliabilityRows("security_events?select=id,country_code,endpoint,reason,action,abuse_score,created_at&order=created_at.desc&limit=200"),
    reliabilityRows("reliability_alerts?select=id,incident_id,channel,delivery_status,attempted_at,delivered_at,error_code,created_at&order=created_at.desc&limit=200"),
    reliabilityRows("hosted_payment_reconciliation?select=id,hosted_payment_id,finding_type,severity,status,summary,created_at,updated_at&status=in.(open,investigating)&order=created_at.desc&limit=200"),
    reliabilityRows("pod_reconciliation_findings?provider=eq.printify&select=id,commerce_order_id,provider_order_id,finding_type,severity,status,summary,last_detected_at&status=in.(open,investigating)&order=last_detected_at.desc&limit=200"),
    getMaintenanceSettings()
  ]);
  const incidents = incidentsRaw as unknown as ReliabilityIncident[];
  const walletMismatches = service ? await walletScanRows(service) : [];
  const today = new Date().toISOString().slice(0, 10);
  const dailyIncidents = incidents.filter((incident) => incident.first_detected_at.startsWith(today) || incident.last_occurred_at.startsWith(today));
  const overallStatus = statusFrom(checks, incidents, maintenance.enabled);
  if (service) {
    await fetch(`${service.url}/rest/v1/reliability_health_snapshots`, {
      method: "POST",
      headers: serviceHeaders(service, "return=minimal"),
      body: JSON.stringify({ overall_status: overallStatus, checks, duration_ms: checks.reduce((sum, item) => sum + (item.latencyMs || 0), 0), deployment_version: process.env.DEPLOYMENT_VERSION || process.env.VERCEL_GIT_COMMIT_SHA || "local" })
    }).catch(() => undefined);
  }
  return {
    configured: Boolean(service),
    overallStatus,
    incidents,
    checks,
    walletMismatches,
    paymentFindings,
    printifyFindings,
    jobs,
    backups,
    deployments,
    securityEvents,
    alerts,
    circuitStates: circuitSnapshot(),
    maintenance: maintenance as unknown as Record<string, unknown>,
    daily: {
      total: dailyIncidents.length,
      newIncidents: dailyIncidents.filter((item) => item.first_detected_at.startsWith(today)).length,
      resolved: dailyIncidents.filter((item) => item.status === "Resolved").length,
      active: incidents.filter((item) => !["Resolved", "False Positive"].includes(item.status)).length,
      critical: incidents.filter((item) => item.severity >= 4 && !item.resolved_at).length,
      affectedCustomers: dailyIncidents.reduce((sum, item) => sum + item.affected_customer_count, 0),
      financial: dailyIncidents.filter((item) => item.financial_impact || item.money_at_risk).length,
      browser: dailyIncidents.filter((item) => item.feature === "Browser").length
    }
  };
}

async function walletScanRows(service: NonNullable<ReturnType<typeof serviceCredentials>>) {
  const response = await fetch(`${service.url}/rest/v1/rpc/scan_wallet_integrity`, { method: "POST", headers: serviceHeaders(service), body: "{}" }).catch(() => null);
  if (!response?.ok) return [];
  const rows = await response.json() as Array<{ user_id: string; actual_balance: number; expected_balance: number; is_consistent: boolean }>;
  const mismatches = rows.filter((row) => !row.is_consistent);
  if (mismatches.length) {
    await recordReliabilityIncident({
      title: "Wallet integrity mismatch detected",
      plainExplanation: "One or more wallets were placed on a spending hold because the saved balance did not match completed ledger entries.",
      technicalExplanation: "scan_wallet_integrity returned inconsistent running totals. Existing balances and ledger rows were preserved.",
      severity: 4,
      feature: "Wallet",
      affectedCustomerCount: mismatches.length,
      affectedWalletTransactionCount: mismatches.length,
      automaticResponse: "Blocked new spending for affected wallets; no balances were changed.",
      recommendedAdminAction: "Review the wallet ledger chronologically and document a reconciliation before releasing each hold.",
      financialImpact: true,
      moneyAtRisk: true,
      metadata: { mismatchCount: mismatches.length }
    });
  }
  return mismatches;
}

export function runtimeCircuitState() {
  return circuitSnapshot();
}
