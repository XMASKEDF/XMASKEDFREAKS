import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { sanitizedIncident } from "@/lib/reliability/sanitize";
import type { IncidentInput } from "@/lib/reliability/types";

export async function recordReliabilityIncident(input: IncidentInput) {
  const record = sanitizedIncident(input);
  const service = serviceCredentials();
  if (!service) return { stored: false, incidentId: null, correlationId: record.correlationId, occurrenceCount: 1 };
  const response = await fetch(`${service.url}/rest/v1/rpc/record_reliability_incident`, {
    method: "POST",
    cache: "no-store",
    headers: serviceHeaders(service),
    body: JSON.stringify({ p_record: record })
  }).catch(() => null);
  if (!response?.ok) return { stored: false, incidentId: null, correlationId: record.correlationId, occurrenceCount: 1 };
  const result = await response.json() as { incidentId?: string; correlationId?: string; occurrenceCount?: number };
  if (record.severity >= 4) await queueReliabilityAlert(result.incidentId || "", record.incidentKey, record.severity, result.correlationId || record.correlationId, record.feature);
  return {
    stored: true,
    incidentId: result.incidentId || null,
    correlationId: result.correlationId || record.correlationId,
    occurrenceCount: Number(result.occurrenceCount || 1)
  };
}

async function queueReliabilityAlert(incidentId: string, incidentKey: string, severity: number, reference: string, feature: string) {
  const service = serviceCredentials();
  if (!service || !incidentId) return;
  const hourBucket = new Date().toISOString().slice(0, 13);
  await fetch(`${service.url}/rest/v1/reliability_alerts`, {
    method: "POST",
    headers: serviceHeaders(service, "resolution=ignore-duplicates,return=minimal"),
    body: JSON.stringify({
      incident_id: incidentId,
      channel: "admin",
      deduplication_key: `${incidentKey}:${severity}:${hourBucket}`,
      delivery_status: "queued"
    })
  }).catch(() => undefined);
  const recipient = process.env.ADMIN_SUPPORT_EMAIL?.trim();
  if (recipient) {
    await fetch(`${service.url}/rest/v1/email_delivery_jobs`, {
      method: "POST",
      headers: serviceHeaders(service, "resolution=ignore-duplicates,return=minimal"),
      body: JSON.stringify({
        recipient_email: recipient,
        template_key: "reliability_critical",
        payload: { reference, severity: String(severity), feature },
        related_entity_type: "reliability_incident",
        related_entity_id: incidentId,
        idempotency_key: `reliability-critical:${incidentKey}:${severity}:${hourBucket}`
      })
    }).catch(() => undefined);
  }
}

export async function reliabilityRows(path: string) {
  const service = serviceCredentials();
  if (!service) return [];
  const response = await fetch(`${service.url}/rest/v1/${path}`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null);
  return response?.ok ? await response.json() as Array<Record<string, unknown>> : [];
}
