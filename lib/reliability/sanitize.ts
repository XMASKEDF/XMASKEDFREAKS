import { createHash, randomBytes } from "crypto";
import type { IncidentInput } from "@/lib/reliability/types";

const secretPatterns = [
  /\bAuthorization\s*[:=]\s*Bearer\s+[A-Za-z0-9._~+/=-]+\b/gi,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi,
  /\b(?:password|passwd|pwd|secret|api[_-]?key|authorization|cookie|token|session|cvv|cvc)\s*[:=]\s*[^\s,;]+/gi,
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9_-]+\b/g,
  /\b\d{13,19}\b/g
];

export function cleanReliabilityText(value: unknown, maximum = 2000) {
  let text = String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ");
  for (const pattern of secretPatterns) text = text.replace(pattern, "[REDACTED]");
  text = text
    .replace(/(?:\/Users|\/home|[A-Z]:\\Users)[^\s)]+/gi, "[INTERNAL_PATH]")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, maximum);
}

export function cleanStack(value: unknown) {
  return cleanReliabilityText(value, 8000)
    .split(" at ")
    .slice(0, 24)
    .join(" at ");
}

export function sanitizeMetadata(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[TRUNCATED]";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return cleanReliabilityText(value, 500);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeMetadata(item, depth + 1));
  if (typeof value !== "object") return String(value).slice(0, 100);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 40).map(([key, item]) => {
    if (/password|secret|token|authorization|cookie|cvv|card|credential|api.?key|private.?key/i.test(key)) return [key, "[REDACTED]"];
    return [cleanReliabilityText(key, 80), sanitizeMetadata(item, depth + 1)];
  }));
}

export function reliabilityFingerprint(input: Pick<IncidentInput, "feature" | "title" | "errorMessage" | "affectedRoute">) {
  const normalized = [input.feature, input.title, input.errorMessage, input.affectedRoute]
    .map((value) => cleanReliabilityText(value, 500).toLowerCase().replace(/\b[0-9a-f]{8,}\b/g, ":id").replace(/\d+/g, ":n"))
    .join("|");
  return createHash("sha256").update(normalized).digest("hex");
}

export function newCorrelationId() {
  return `XMF-${Date.now().toString(36).toUpperCase()}-${randomBytes(5).toString("hex").toUpperCase()}`;
}

export function sanitizedIncident(input: IncidentInput) {
  const correlationId = cleanReliabilityText(input.correlationId, 128) || newCorrelationId();
  return {
    incidentKey: reliabilityFingerprint(input),
    correlationId,
    title: cleanReliabilityText(input.title, 200),
    plainExplanation: cleanReliabilityText(input.plainExplanation, 1200),
    technicalExplanation: cleanReliabilityText(input.technicalExplanation, 4000),
    severity: Math.max(1, Math.min(5, Math.floor(input.severity))) as 1 | 2 | 3 | 4 | 5,
    feature: cleanReliabilityText(input.feature, 120),
    affectedRoute: cleanReliabilityText(input.affectedRoute, 500),
    affectedCustomerCount: Math.max(0, Math.floor(input.affectedCustomerCount || 0)),
    affectedOrderCount: Math.max(0, Math.floor(input.affectedOrderCount || 0)),
    affectedWalletTransactionCount: Math.max(0, Math.floor(input.affectedWalletTransactionCount || 0)),
    affectedRegion: cleanReliabilityText(input.affectedRegion, 120),
    browser: cleanReliabilityText(input.browser, 120),
    deviceType: cleanReliabilityText(input.deviceType, 120),
    operatingSystem: cleanReliabilityText(input.operatingSystem, 120),
    requestId: cleanReliabilityText(input.requestId, 160),
    userId: validUuid(input.userId) ? input.userId : "",
    orderId: validUuid(input.orderId) ? input.orderId : "",
    paymentId: cleanReliabilityText(input.paymentId, 160),
    walletLedgerId: validUuid(input.walletLedgerId) ? input.walletLedgerId : "",
    errorMessage: cleanReliabilityText(input.errorMessage, 2000),
    sanitizedStack: cleanStack(input.sanitizedStack),
    suspectedCause: cleanReliabilityText(input.suspectedCause, 2000),
    automaticResponse: cleanReliabilityText(input.automaticResponse, 2000),
    recoveryResult: cleanReliabilityText(input.recoveryResult, 2000),
    recommendedAdminAction: cleanReliabilityText(input.recommendedAdminAction, 2000),
    deploymentVersion: cleanReliabilityText(input.deploymentVersion || process.env.DEPLOYMENT_VERSION || process.env.VERCEL_GIT_COMMIT_SHA || "local", 160),
    financialImpact: Boolean(input.financialImpact),
    securityImpact: Boolean(input.securityImpact),
    customerDataRisk: Boolean(input.customerDataRisk),
    moneyAtRisk: Boolean(input.moneyAtRisk),
    metadata: sanitizeMetadata(input.metadata || {}) as Record<string, unknown>
  };
}

function validUuid(value?: string) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}
