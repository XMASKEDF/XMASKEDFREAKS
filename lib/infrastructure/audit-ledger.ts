import { createHash, randomUUID } from "node:crypto";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";

const sensitiveKey = /password|token|secret|authorization|cookie|card|cvv|iban|bank|address/i;

function safeMetadata(value: Record<string, unknown> = {}) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !sensitiveKey.test(key)).slice(0, 40).map(([key, item]) => [key, typeof item === "string" ? item.slice(0, 500) : item]));
}

export type AuditLedgerInput = {
  eventType: string;
  actorType?: string;
  actorId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  relatedTransactionId?: string | null;
  relatedOrderId?: string | null;
  result?: string;
  environment?: string;
  correlationId?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
};

export async function appendAuditLedgerEvent(input: AuditLedgerInput) {
  const service = serviceCredentials();
  const eventId = randomUUID();
  if (!service) return { persisted: false, eventId };
  const ipHash = input.ipAddress ? createHash("sha256").update(`${input.ipAddress}|${process.env.ADMIN_DEVICE_SALT || "xmf-audit"}`).digest("hex").slice(0, 32) : null;
  const response = await fetch(`${service.url}/rest/v1/infrastructure_audit_ledger`, { method: "POST", headers: serviceHeaders(service, "return=minimal"), body: JSON.stringify({ id: eventId, event_type: input.eventType.slice(0, 120), actor_type: input.actorType || "ADMIN", actor_id: input.actorId || null, actor_ip_hash: ipHash, target_type: input.targetType || null, target_id: input.targetId || null, related_transaction_id: input.relatedTransactionId || null, related_order_id: input.relatedOrderId || null, environment: input.environment || process.env.XMF_ENVIRONMENT || process.env.APP_ENV || "LOCAL", result: input.result || "recorded", safe_metadata: safeMetadata(input.metadata), correlation_id: input.correlationId || null }) }).catch(() => null);
  return { persisted: Boolean(response?.ok), eventId };
}
