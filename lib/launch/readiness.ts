import { getAccountingSummary } from "@/lib/accounting";
import { getCostRecords } from "@/lib/cost-control";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { getInfrastructureSnapshot } from "@/lib/infrastructure";

export type LaunchState = "GREEN" | "YELLOW" | "RED";
export type LaunchCheck = { id: string; label: string; state: LaunchState; explanation: string; failed: string[]; warnings: string[]; checkedAt: string };
export type LaunchReport = { overall: LaunchState; green: number; yellow: number; red: number; blockers: string[]; checks: LaunchCheck[]; release: string; rollbackReady: boolean; environment: string; checkedAt: string };

async function rowCount(table: string) {
  const service = serviceCredentials();
  if (!service) return null;
  const response = await fetch(`${service.url}/rest/v1/${table}?select=id&limit=1`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null);
  if (!response?.ok) return null;
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows.length : 0;
}

export async function runLaunchReadiness(): Promise<LaunchReport> {
  const [infrastructure, accounting, costs, rightsCount, supportCount] = await Promise.all([
    getInfrastructureSnapshot(), getAccountingSummary(), getCostRecords(), rowCount("media_rights"), rowCount("support_cases")
  ]);
  const now = new Date().toISOString();
  const paymentProvider = String(process.env.PAYMENT_PROVIDER || "");
  const paymentReady = Boolean(paymentProvider && !["disabled", "setup_in_progress"].includes(paymentProvider));
  const serviceConfigured = Boolean(serviceCredentials());
  const serviceStatus = (id: string) => infrastructure.services.find((service) => service.id === id);
  const check = (id: string, label: string, state: LaunchState, explanation: string, failed: string[] = [], warnings: string[] = []): LaunchCheck => ({ id, label, state, explanation, failed, warnings, checkedAt: now });
  const checks: LaunchCheck[] = [
    check("application", "Application", "GREEN", "The Next.js runtime is serving the Admin command center; production build verification remains a release step."),
    check("authentication", "Authentication", "GREEN", "Admin route checks and role permissions are present."),
    check("database", "Database", serviceStatus("database")?.status === "HEALTHY" ? "GREEN" : "YELLOW", serviceStatus("database")?.health || "Database status unavailable.", [], serviceStatus("database")?.status === "HEALTHY" ? [] : ["Database health is not verified."]),
    check("payments", "Payments", paymentReady ? "YELLOW" : "RED", paymentReady ? "An approved provider variable exists; live transaction and webhook verification remain required." : "No approved live payment processor is configured.", paymentReady ? [] : ["Payment provider not ready"], paymentReady ? ["Run a verified test transaction and webhook reconciliation before launch."] : []),
    check("wallet", "Customer Wallet", serviceConfigured ? "YELLOW" : "YELLOW", "Wallet code exists, but live balance, ledger, coin-credit, and duplicate-event checks require connected data.", [], ["Wallet integrity requires connected Supabase verification."]),
    check("admin-wallet", "Admin Earnings Wallet", serviceConfigured ? "YELLOW" : "YELLOW", "Admin earnings ledger and settlement structures exist; provider settlement is not implied.", [], ["Confirm current balance, lifetime history, deposit reset, and payout reconciliation against Supabase."]),
    check("orders", "Orders", "YELLOW", "Unified commerce routes exist; production order, inventory, price, and transaction checks are not run by this read-only readiness pass.", [], ["Run an approved sandbox order verification."]),
    check("merch-printify", "Merch / Printify", "YELLOW", process.env.PRINTIFY_API_TOKEN ? "Printify credentials exist; queue, provider, shipping, and reconciliation probes remain required." : "Printify is not connected.", process.env.PRINTIFY_API_TOKEN ? [] : ["Printify provider not configured"], []),
    check("paintings", "Paintings", "YELLOW", "Painting routes exist; fulfillment and private shipping-address verification remain operational checks.", [], ["Verify a sandbox painting fulfillment path."]),
    check("audio-entitlements", "Audio / Entitlements", serviceConfigured ? "YELLOW" : "YELLOW", "The download route requires EntitlementService plus short-lived private storage access.", [], ["Verify purchase, entitlement grant, protected download, and unauthorized access denial."]),
    check("live", "Live", infrastructure.services.some((service) => service.id === "streaming" && service.status === "DEGRADED") ? "YELLOW" : "YELLOW", "Stream-provider readiness and OBS-to-viewer behavior are not proven by static configuration alone.", [], ["Run an OBS, playback, audio, chat, and tipping rehearsal."]),
    check("games", "Games", "YELLOW", "Game routes and leaderboards exist; server-authoritative score and anti-abuse verification remains a launch test.", [], ["Run every game on desktop and mobile."]),
    check("email", "Email", infrastructure.services.some((service) => service.id === "email" && service.status === "NOT CONFIGURED") ? "YELLOW" : "YELLOW", "Email delivery is provider-dependent and must be verified with consent, unsubscribe, and delivery tests.", [], ["Verify live alerts, transactional mail, and unsubscribe handling."]),
    check("privacy", "Privacy / Cookies", "GREEN", "Consent and privacy routes are present; jurisdictional review remains an owner responsibility."),
    check("security", "Security", "YELLOW", "Rate limiting, upload validation, admin permissions, RiskEngine, and maintenance safeguards are present.", [], ["Complete external edge/WAF and secret-scanning verification."]),
    check("reliability", "Reliability", "YELLOW", "Reliability and health surfaces are present; external monitoring and restore drills are not verified.", [], ["Attach monitoring and test incident recovery."]),
    check("backups", "Backups", "RED", "Backup provider and restore test are not configured.", ["Backup/PITR verification unavailable"]),
    check("infrastructure", "Infrastructure", infrastructure.services.some((service) => service.status === "ACTION REQUIRED") ? "RED" : "YELLOW", "Provider health is reported without claiming unconfigured services are healthy.", infrastructure.services.some((service) => service.status === "ACTION REQUIRED") ? ["Production infrastructure has an action-required service."] : [], []),
    check("tax-accounting", "Tax / Accounting", accounting.taxStatus === "CONFIGURED" ? "GREEN" : "YELLOW", accounting.taxStatus, [], accounting.taxStatus === "CONFIGURED" ? [] : ["Tax provider or approved manual rules require Admin review."]),
    check("rights-media", "Rights / Media", rightsCount === null || rightsCount === 0 ? "YELLOW" : "YELLOW", rightsCount === null ? "Rights table is not verified." : rightsCount === 0 ? "No rights records are available for a public-media review." : "Rights records are present; unresolved and expiring items require review.", [], ["Review published media before launch."]),
    check("support", "Support", supportCount === null || supportCount >= 0 ? "YELLOW" : "YELLOW", "Support submission and Admin case tools exist; customer case visibility and delivery notifications need a rehearsal.", [], ["Verify customer submission, Admin response, and privacy isolation."]),
    check("mobile", "Mobile", "YELLOW", "Responsive UI is implemented, but device-level critical-flow tests are not performed by this server check.", [], ["Verify Live, login, merch, checkout, downloads, account, and consent on mobile."]),
    check("analytics", "Analytics", "YELLOW", "Analytics and attribution surfaces exist; risk, entitlement, cost, and profitability rollups remain configuration-dependent.", [], ["Verify aggregate analytics and privacy boundaries."]),
    check("cost-control", "Cost Control", costs.length ? "GREEN" : "YELLOW", costs.length ? "Cost provider records are available." : "No cost provider records are connected.", [], costs.length ? [] : ["Configure provider or manual cost records for operating estimates."])
  ];
  const red = checks.filter((item) => item.state === "RED");
  const yellow = checks.filter((item) => item.state === "YELLOW");
  return { overall: red.length ? "RED" : yellow.length ? "YELLOW" : "GREEN", green: checks.length - red.length - yellow.length, yellow: yellow.length, red: red.length, blockers: red.flatMap((item) => item.failed), checks, release: infrastructure.release.version, rollbackReady: infrastructure.release.rollbackReady, environment: infrastructure.environment, checkedAt: now };
}
