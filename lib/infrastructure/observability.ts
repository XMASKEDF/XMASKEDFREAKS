import { createHash, randomUUID } from "node:crypto";

const sensitiveKey = /(password|passcode|secret|token|authorization|cookie|card|cvv|iban|account_number|bank|address|email|session[_-]?id|private[_-]?key)/i;
const secretString = /Bearer\s+[^\s]+|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g;
const signedQuery = /([?&](?:access_token|api[_-]?key|signature|sig|token|x-amz-(?:credential|signature|security-token))=)[^&\s]+/gi;
const secretAssignment = /\b(api[_-]?key|secret|token|password|authorization|cookie|cvv)\s*[:=]\s*[^\s,;]+/gi;

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "CRITICAL";
export type LegacyLogLevel = "debug" | "info" | "warn" | "error";
export type CorrelationContext = { requestId: string; eventId?: string; jobId?: string; sessionId?: string };
export type StructuredLogEntry = CorrelationContext & {
  timestamp: string;
  level: LogLevel;
  service: string;
  event: string;
  environment: string;
  route?: string;
  provider?: string;
  operation?: string;
  errorCode?: string;
  durationMs?: number;
  metadata: Record<string, unknown>;
};

function redactString(value: string) {
  return value.slice(0, 500).replace(secretString, "[REDACTED]").replace(signedQuery, "$1[REDACTED]").replace(secretAssignment, "$1=[REDACTED]");
}

function safeValue(value: unknown, key = ""): unknown {
  if (sensitiveKey.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safeValue(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 50).map(([childKey, childValue]) => [childKey, safeValue(childValue, childKey)]));
  if (typeof value === "string") return redactString(value);
  return value;
}

function normalizedLevel(level: LogLevel | LegacyLogLevel): LogLevel {
  const value = level.toUpperCase();
  return ["DEBUG", "INFO", "WARN", "ERROR", "CRITICAL"].includes(value) ? value as LogLevel : "INFO";
}

function safeEnvironment() {
  const value = String(process.env.XMF_ENVIRONMENT || process.env.APP_ENV || "LOCAL").toUpperCase();
  return ["LOCAL", "SANDBOX", "STAGING", "PRODUCTION"].includes(value) ? value : "LOCAL";
}

function safeSessionId(value: unknown) {
  return typeof value === "string" && value ? createHash("sha256").update(value).digest("hex").slice(0, 16) : undefined;
}

export function createCorrelationContext(input: Partial<CorrelationContext> = {}): CorrelationContext { return { requestId: input.requestId || randomUUID(), eventId: input.eventId, jobId: input.jobId, sessionId: input.sessionId }; }
export function correlationHeaders(context: CorrelationContext) { return { "x-request-id": context.requestId, ...(context.eventId ? { "x-event-id": context.eventId } : {}), ...(context.jobId ? { "x-job-id": context.jobId } : {}) }; }
export function structuredLog(level: LogLevel | LegacyLogLevel, service: string, event: string, metadata: Record<string, unknown> = {}, context: Partial<CorrelationContext> = {}) {
  const safeMetadata = safeValue(metadata) as Record<string, unknown>;
  const rawSessionId = context.sessionId || metadata.sessionId || metadata.session_id;
  const entry: StructuredLogEntry = {
    ...createCorrelationContext(context),
    sessionId: safeSessionId(rawSessionId),
    timestamp: new Date().toISOString(),
    level: normalizedLevel(level),
    service: service.slice(0, 100),
    event: event.slice(0, 160),
    environment: safeEnvironment(),
    route: typeof metadata.route === "string" ? redactString(metadata.route).slice(0, 200) : undefined,
    provider: typeof metadata.provider === "string" ? metadata.provider.slice(0, 100) : undefined,
    operation: typeof metadata.operation === "string" ? metadata.operation.slice(0, 100) : undefined,
    errorCode: typeof metadata.errorCode === "string" ? metadata.errorCode.slice(0, 100) : undefined,
    durationMs: typeof metadata.durationMs === "number" && Number.isFinite(metadata.durationMs) ? Math.max(0, Math.round(metadata.durationMs)) : undefined,
    metadata: safeMetadata
  };
  if (typeof window === "undefined") { const writer = entry.level === "ERROR" || entry.level === "CRITICAL" ? console.error : entry.level === "WARN" ? console.warn : console.info; writer(JSON.stringify(entry)); }
  return entry;
}

type Metric = { count: number; totalMs: number; errors: number; lastAt: string };
const metrics = new Map<string, Metric>();
export function recordMetric(name: string, durationMs = 0, failed = false) { const current = metrics.get(name) || { count: 0, totalMs: 0, errors: 0, lastAt: "" }; const next = { count: current.count + 1, totalMs: current.totalMs + Math.max(0, durationMs), errors: current.errors + (failed ? 1 : 0), lastAt: new Date().toISOString() }; metrics.set(name, next); return { name, ...next, averageMs: Math.round(next.totalMs / next.count) }; }
export function metricsSnapshot() { return Array.from(metrics, ([name, metric]) => ({ name, ...metric, averageMs: metric.count ? Math.round(metric.totalMs / metric.count) : 0 })); }
