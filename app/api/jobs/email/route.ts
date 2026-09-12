import { NextRequest, NextResponse } from "next/server";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { getEmailProvider, renderEmailTemplate } from "@/lib/email/provider";
import { CircuitOpenError, withCircuitBreaker } from "@/lib/reliability/circuit-breaker";
import { recordReliabilityIncident } from "@/lib/reliability/server";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const secret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const service = serviceCredentials(); if (!service) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  const headers = serviceHeaders(service);
  const response = await fetch(`${service.url}/rest/v1/email_delivery_jobs?or=(status.eq.queued,status.eq.retry)&next_attempt_at=lte.${new Date().toISOString()}&select=*,email_templates(subject,body_text,allowed_variables,enabled)&order=queued_at.asc&limit=25`, { headers });
  const jobs = response.ok ? await response.json() as Array<Record<string, unknown>> : [];
  const provider = getEmailProvider(); let sent = 0; let failed = 0;
  for (const job of jobs) {
    const template = Array.isArray(job.email_templates) ? job.email_templates[0] as Record<string, unknown> : job.email_templates as Record<string, unknown>;
    if (!template?.enabled) {
      await fetch(`${service.url}/rest/v1/email_delivery_jobs?id=eq.${job.id}&status=in.(queued,retry)`, { method: "PATCH", headers, body: JSON.stringify({ status: "failed", retry_count: Number(job.retry_count || 0) + 1, failure_reason: "EMAIL_TEMPLATE_UNAVAILABLE" }) });
      failed += 1;
      continue;
    }
    await fetch(`${service.url}/rest/v1/email_delivery_jobs?id=eq.${job.id}&status=in.(queued,retry)`, { method: "PATCH", headers, body: JSON.stringify({ status: "sending" }) });
    const rendered = renderEmailTemplate(String(template.subject), String(template.body_text), job.payload as Record<string, unknown>, Array.isArray(template.allowed_variables) ? template.allowed_variables.map(String) : []);
    const result = await withCircuitBreaker("email-delivery", async () => {
      const delivery = await provider.send({ to: String(job.recipient_email), ...rendered, idempotencyKey: String(job.idempotency_key) });
      if (!delivery.accepted && delivery.temporaryFailure) throw new Error(delivery.error || "EMAIL_PROVIDER_TEMPORARY_FAILURE");
      return delivery;
    }, { threshold: 4, cooldownMs: 60_000 }).catch((error: unknown) => ({
      delivered: false,
      accepted: false,
      state: "FAILED" as const,
      providerReference: undefined,
      temporaryFailure: true,
      error: error instanceof CircuitOpenError ? "EMAIL_PROVIDER_CIRCUIT_OPEN" : error instanceof Error ? error.message : "EMAIL_PROVIDER_FAILURE"
    }));
    const retries = Number(job.retry_count || 0) + (result.accepted ? 0 : 1);
    const status = result.accepted ? "sent" : result.temporaryFailure && retries < 5 ? "retry" : "failed";
    const now = new Date().toISOString();
    await fetch(`${service.url}/rest/v1/email_delivery_jobs?id=eq.${job.id}`, { method: "PATCH", headers, body: JSON.stringify({ status, retry_count: retries, sent_at: result.accepted ? now : null, provider_accepted_at: result.accepted ? now : null, delivered_at: result.delivered ? now : null, provider_reference: result.providerReference || null, delivery_state: result.state, failure_reason: result.error || null, next_attempt_at: new Date(Date.now() + Math.min(60, 2 ** retries) * 60_000).toISOString() }) });
    if (status === "failed") {
      await recordReliabilityIncident({
        title: "Email delivery exhausted safe retries",
        plainExplanation: "A transactional email could not be delivered after the approved retry limit.",
        technicalExplanation: "The queued email job moved to failed status. Recipient details and message content were not copied into the incident.",
        severity: 3,
        feature: "Email",
        automaticResponse: "Stopped automatic retries for this job and preserved it for administrator review.",
        recommendedAdminAction: "Check provider health and the sanitized job failure code before retrying.",
        metadata: { jobId: String(job.id), retryCount: retries, failureCode: result.error || "EMAIL_DELIVERY_FAILED" }
      });
    }
    if (result.accepted) sent += 1; else failed += 1;
  }
  return NextResponse.json({ processed: jobs.length, sent, failed });
}
