import type { AlertProvider } from "./provider-interfaces";

export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";
export type OperationalAlert = { key: string; severity: AlertSeverity; title: string; code: string; details?: Record<string, unknown>; recovery?: boolean };
export type AlertDelivery = { sent: boolean; deduplicated: boolean; status: "SENT" | "SUPPRESSED" | "NOT CONFIGURED"; detail: string };

const recentAlerts = new Map<string, number>();
const sensitiveKey = /(password|passcode|secret|token|authorization|cookie|card|cvv|iban|account_number|bank|address|email|private[_-]?key)/i;

function cooldownMs() {
  const configured = Number(process.env.ALERT_COOLDOWN_SECONDS || 300);
  return Math.min(86_400, Math.max(30, Number.isFinite(configured) ? configured : 300)) * 1_000;
}

function safeDetails(details: Record<string, unknown> = {}) {
  return Object.fromEntries(Object.entries(details).slice(0, 20).map(([key, value]) => [key, sensitiveKey.test(key) ? "[REDACTED]" : typeof value === "string" ? value.slice(0, 200) : value]));
}

export class LocalAlertProvider implements AlertProvider {
  readonly kind = "LOCAL" as const;
  async send(alert: OperationalAlert) {
    return { accepted: true, reference: `local-alert:${alert.key}`, detail: "Alert retained by the local development alert adapter." };
  }
}

export function getAlertProvider(): AlertProvider | null {
  return String(process.env.ALERT_PROVIDER || "NONE").toUpperCase() === "LOCAL" ? new LocalAlertProvider() : null;
}

export async function emitOperationalAlert(alert: OperationalAlert): Promise<AlertDelivery> {
  if (alert.recovery) recentAlerts.delete(alert.key);
  const provider = getAlertProvider();
  if (!provider) return { sent: false, deduplicated: false, status: "NOT CONFIGURED", detail: "No approved alert provider is configured." };
  const previous = recentAlerts.get(alert.key);
  if (previous && Date.now() - previous < cooldownMs()) return { sent: false, deduplicated: true, status: "SUPPRESSED", detail: "The alert is inside its configured cooldown window." };
  const result = await provider.send({ ...alert, details: safeDetails(alert.details) });
  if (result.accepted) recentAlerts.set(alert.key, Date.now());
  return { sent: result.accepted, deduplicated: false, status: result.accepted ? "SENT" : "NOT CONFIGURED", detail: result.detail };
}

export function resetLocalAlertDeduplication() { recentAlerts.clear(); }
