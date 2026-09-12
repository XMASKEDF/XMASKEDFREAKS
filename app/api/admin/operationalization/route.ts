import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession, hasAdminPermission } from "@/lib/admin-auth";
import {
  getOperationalReadiness,
  normalizeOperationalState,
  readOperationalState,
  validateRedirectDestination,
  writeOperationalState,
  type OperationalState
} from "@/lib/admin-operationalization";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { getEmailProvider } from "@/lib/email/provider";
import { runDepositWorker } from "@/lib/deposit-worker";
import { extractClientIp } from "@/lib/security";

export const dynamic = "force-dynamic";

async function authorized(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  return admin && hasAdminPermission(admin, "admin.operations.manage") ? admin : null;
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store, private" } });
}

function cleanId(value: unknown, fallback: string) {
  const id = String(value || fallback).trim().slice(0, 80);
  return /^[a-zA-Z0-9:_-]+$/.test(id) ? id : fallback;
}

function applySection(state: OperationalState, section: string, value: unknown): OperationalState | null {
  if (section === "theaterAudio" && value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    return normalizeOperationalState({ ...state, theaterAudio: { ...state.theaterAudio, ...input } });
  }
  if (section === "backgroundMusic" && value && typeof value === "object") {
    return normalizeOperationalState({ ...state, backgroundMusic: { ...state.backgroundMusic, ...value } });
  }
  if (section === "coinPolicy" && value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    return normalizeOperationalState({ ...state, coinPolicy: { ...state.coinPolicy, ...input, immutableCoinValueCents: 50 } });
  }
  if (section === "coinPackages" && Array.isArray(value)) {
    return normalizeOperationalState({ ...state, coinPackages: value });
  }
  if (section === "notifications" && value && typeof value === "object") {
    return normalizeOperationalState({ ...state, notifications: { ...state.notifications, ...value } });
  }
  if (section === "depositSchedule" && value && typeof value === "object") {
    return normalizeOperationalState({ ...state, depositSchedule: { ...state.depositSchedule, ...value } });
  }
  if (section === "performance" && value && typeof value === "object") {
    return normalizeOperationalState({ ...state, performance: { ...state.performance, ...value } });
  }
  if (section === "redirects" && Array.isArray(value)) {
    const rules = value.flatMap((item, index) => {
      if (!item || typeof item !== "object") return [];
      const rule = item as Record<string, unknown>;
      const destination = String(rule.destination || "");
      if (!destination || !["live", "clips4sale", "fansly"].includes(destination)) return [];
      const source = String(rule.source || "/go").trim();
      if (!source.startsWith("/") || source.startsWith("//")) return [];
      return [{ ...rule, id: cleanId(rule.id, `redirect-${index + 1}`), source, destination }];
    });
    return normalizeOperationalState({ ...state, redirects: rules });
  }
  if (section === "campaigns" && Array.isArray(value)) {
    const campaigns = value.flatMap((item, index) => {
      if (!item || typeof item !== "object") return [];
      const campaign = item as Record<string, unknown>;
      const destination = validateRedirectDestination(campaign.destination || "/");
      if (!destination.ok) return [];
      return [{ ...campaign, id: cleanId(campaign.id, `campaign-${index + 1}`), destination: destination.destination }];
    });
    return normalizeOperationalState({ ...state, campaigns });
  }
  if (section === "faq" && Array.isArray(value)) return normalizeOperationalState({ ...state, faq: value });
  if (section === "appeals" && Array.isArray(value)) return normalizeOperationalState({ ...state, appeals: value });
  return null;
}

async function readRecentEvents() {
  const service = serviceCredentials();
  if (!service) return [];
  const response = await fetch(`${service.url}/rest/v1/admin_operational_events?select=id,event_type,payload,created_at&order=created_at.desc&limit=100`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null);
  return response?.ok ? await response.json().catch(() => []) : [];
}

async function readSupportCases() {
  const service = serviceCredentials();
  if (!service) return [];
  const response = await fetch(`${service.url}/rest/v1/support_cases?select=id,customer_id,guest_reference,category,priority,status,subject,related_order_id,related_payment_id,related_entitlement_id,updated_at&order=updated_at.desc&limit=100`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null);
  return response?.ok ? await response.json().catch(() => []) : [];
}

export async function GET(request: NextRequest) {
  const admin = await authorized(request);
  if (!admin) return json({ error: "Not found." }, 404);
  const [readiness, events, supportCases] = await Promise.all([getOperationalReadiness(), readRecentEvents(), readSupportCases()]);
  return json({ ok: true, ...readiness, events, supportCases });
}

export async function POST(request: NextRequest) {
  const admin = await authorized(request);
  if (!admin) return json({ error: "Not found." }, 404);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || "");
  const ipAddress = extractClientIp(request.headers);
  const userAgent = request.headers.get("user-agent") || "unknown";
  const current = (await readOperationalState()).state;
  let next = current;
  let eventType = "admin_operational_state_updated";
  let eventPayload: Record<string, unknown> = { action };

  if (action === "save-section") {
    const section = String(body.section || "");
    const changed = applySection(current, section, body.value);
    if (!changed) return json({ error: "The operational settings payload is invalid." }, 400);
    next = changed;
    eventType = `admin_${section}_updated`;
    eventPayload = { action, section };
  } else if (action === "save-playlist") {
    const changed = applySection(current, "backgroundMusic", body.value);
    if (!changed) return json({ error: "The playlist payload is invalid." }, 400);
    next = changed;
    eventType = "admin_background_music_playlist_updated";
    eventPayload = { action, trackCount: next.backgroundMusic.tracks.length };
  } else if (action === "record-sandbox-scenario") {
    const scenario = String(body.scenario || "").trim();
    const allowed = new Set(["guest", "logged-in-user", "coin-purchase", "wallet-spend", "direct-live-tip", "product-purchase", "digital-entitlement", "physical-order", "live-contribution", "chat-comment", "chat-block", "provider-failure", "payment-confirmed", "payment-failed", "webhook-retry", "provider-unavailable"]);
    if (!allowed.has(scenario)) return json({ error: "Unknown Sandbox scenario." }, 400);
    next = normalizeOperationalState({ ...current, sandbox: { lastScenario: scenario, lastRunAt: new Date().toISOString(), lastResult: "SIMULATED · production state unchanged" } });
    eventType = "admin_sandbox_scenario_run";
    eventPayload = { action, scenario, environment: "SANDBOX", productionStateChanged: false };
  } else if (action === "save-appeal") {
    const subjectRef = String(body.subjectRef || "").trim().slice(0, 200);
    const status = String(body.status || "OPEN");
    if (!subjectRef || !["OPEN", "REVIEWING", "APPROVED", "DENIED", "CLOSED"].includes(status)) return json({ error: "A subject and valid appeal status are required." }, 400);
    const appeals = current.appeals.filter((appeal) => appeal.id !== String(body.id || ""));
    appeals.push({ id: cleanId(body.id, `appeal-${Date.now()}`), subjectRef, status: status as OperationalState["appeals"][number]["status"], note: String(body.note || "").slice(0, 1000), updatedAt: new Date().toISOString() });
    next = normalizeOperationalState({ ...current, appeals });
    eventType = "admin_moderation_appeal_updated";
    eventPayload = { action, subjectRef, status };
  } else if (action === "test-email") {
    if (body.confirm !== true) return json({ error: "A deliberate confirmation is required before sending a one-recipient test." }, 400);
    const recipient = String(body.recipientEmail || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return json({ error: "A valid test recipient is required." }, 400);
    const service = serviceCredentials();
    const provider = getEmailProvider();
    if (!service || provider.name !== "resend" || !provider.configured()) return json({ ok: false, status: "NOT CONFIGURED", error: "Resend is not configured. No test email was sent." }, 503);
    const idempotencyKey = String(body.idempotencyKey || `admin-test-email:${admin.id}:${randomUUID()}`).replace(/[^a-zA-Z0-9:_-]/g, "-").slice(0, 180);
    const queued = await fetch(`${service.url}/rest/v1/email_delivery_jobs`, {
      method: "POST",
      headers: serviceHeaders(service, "resolution=ignore-duplicates,return=representation"),
      body: JSON.stringify({ recipient_email: recipient, template_key: "security_alert", payload: { nickname: admin.display_name || admin.username, test: true }, related_entity_type: "admin_email_test", related_entity_id: admin.id, idempotency_key: idempotencyKey, delivery_state: "QUEUED" })
    }).catch(() => null);
    if (!queued?.ok) return json({ ok: false, status: "QUEUE_FAILED", error: "The test email could not be recorded. No provider request was sent." }, 502);
    const queuedRows = await queued.json().catch(() => []) as Array<Record<string, unknown>>;
    let job = queuedRows[0] || null;
    if (!job) {
      const existing = await fetch(`${service.url}/rest/v1/email_delivery_jobs?idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=id,status,delivery_state,provider_reference&limit=1`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null);
      const existingRows = existing?.ok ? await existing.json().catch(() => []) as Array<Record<string, unknown>> : [];
      job = existingRows[0] || null;
      if (job && ["PROVIDER_ACCEPTED", "DELIVERED"].includes(String(job.delivery_state))) return json({ ok: true, duplicate: true, status: String(job.status), deliveryState: String(job.delivery_state), providerReference: job.provider_reference || null });
    }
    if (!job?.id) return json({ ok: false, status: "QUEUE_FAILED", error: "The test email job could not be identified. No provider request was sent." }, 502);
    const result = await provider.send({ to: recipient, subject: "XMASKEDFREAKS Admin Test Email", text: "This is a deliberate one-recipient delivery test for XMASKEDFREAKS.", idempotencyKey });
    const now = new Date().toISOString();
    const jobStatus = result.accepted ? "sent" : result.temporaryFailure ? "retry" : "failed";
    await fetch(`${service.url}/rest/v1/email_delivery_jobs?id=eq.${encodeURIComponent(String(job.id))}`, {
      method: "PATCH",
      headers: serviceHeaders(service),
      body: JSON.stringify({ status: jobStatus, retry_count: result.accepted ? 0 : 1, sent_at: result.accepted ? now : null, provider_accepted_at: result.accepted ? now : null, delivered_at: result.delivered ? now : null, provider_reference: result.providerReference || null, delivery_state: result.state, failure_reason: result.error || null, next_attempt_at: result.temporaryFailure ? new Date(Date.now() + 60_000).toISOString() : now })
    }).catch(() => undefined);
    next = normalizeOperationalState({ ...current, notifications: { ...current.notifications, lastStatus: result.accepted ? "sent" : "failed", lastDeliveryState: result.state, lastFailure: result.accepted ? null : result.error || result.status } });
    eventType = result.accepted ? "admin_email_test_provider_accepted" : "admin_email_test_failed";
    eventPayload = { action, recipient: "redacted", provider: "RESEND", deliveryState: result.state, providerAccepted: result.accepted, delivered: result.delivered };
    const saved = await writeOperationalState(next, admin.id, eventType, eventPayload);
    await auditAdminEvent({ adminUserId: admin.id, eventType, ipAddress, userAgent, metadata: eventPayload });
    return json({ ok: result.accepted, status: result.status, deliveryState: result.state, delivered: result.delivered, providerReference: result.providerReference || null, persisted: saved.persisted, note: result.accepted ? "Resend accepted the message. Delivery is not claimed until a provider delivery event exists." : "The provider did not accept the message; the job remains recorded for review." }, result.accepted ? 200 : 502);
  } else if (action === "run-deposit-worker") {
    const retryRunKey = typeof body.retryRunKey === "string" ? body.retryRunKey.slice(0, 180) : undefined;
    const result = await runDepositWorker({ force: body.force === true, retryRunKey });
    const workerEvent = { action, status: result.status, runKey: result.runKey || null, recordsProcessed: result.recordsProcessed || 0, eligibleAmountMinor: result.eligibleAmountMinor || 0, providerActionRequired: result.status === "BLOCKED_PROVIDER" };
    await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_deposit_worker_run_requested", ipAddress, userAgent, metadata: workerEvent });
    return json({ ...result, note: result.status === "BLOCKED_PROVIDER" ? "Internal payout preparation completed; approved settlement provider connection is still required." : undefined }, result.ok ? 200 : 503);
  } else if (action === "queue-live-notification") {
    const recipient = String(body.recipientEmail || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return json({ error: "A valid test recipient is required. Broadcast audience delivery is queued separately." }, 400);
    const previous = current.notifications.lastQueuedAt ? Date.parse(current.notifications.lastQueuedAt) : 0;
    const cooldownMs = current.notifications.cooldownMinutes * 60_000;
    if (!body.forceSend && previous && Date.now() - previous < cooldownMs) return json({ error: `Live notification cooldown is active for ${Math.ceil((cooldownMs - (Date.now() - previous)) / 60_000)} more minute(s).` }, 429);
    const service = serviceCredentials();
    const provider = getEmailProvider();
    if (!service || provider.name !== "resend" || !provider.configured()) {
      next = normalizeOperationalState({ ...current, notifications: { ...current.notifications, lastStatus: "blocked", lastFailure: "RESEND_NOT_CONFIGURED" } });
      await writeOperationalState(next, admin.id, "admin_live_notification_blocked", { reason: "RESEND_NOT_CONFIGURED" });
      await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_live_notification_blocked", ipAddress, userAgent, metadata: { reason: "RESEND_NOT_CONFIGURED" } });
      return json({ ok: false, status: "NOT CONFIGURED", error: "Resend is not configured. No email was queued or sent." }, 503);
    }
    const now = new Date().toISOString();
    const job = await fetch(`${service.url}/rest/v1/email_delivery_jobs`, {
      method: "POST",
      headers: serviceHeaders(service, "resolution=ignore-duplicates,return=minimal"),
      body: JSON.stringify({ recipient_email: recipient, template_key: "live_alert", payload: { message: String(body.message || "XMASKEDFREAKS is live").slice(0, 1000), liveUrl: "/#live" }, related_entity_type: "live_notification", related_entity_id: "daily-live", idempotency_key: String(body.idempotencyKey || `live-alert:${now.slice(0, 13)}:${recipient}`) })
    }).catch(() => null);
    if (!job?.ok) return json({ ok: false, error: "The Resend delivery job could not be queued." }, 502);
    next = normalizeOperationalState({ ...current, notifications: { ...current.notifications, lastQueuedAt: now, lastStatus: "queued", lastDeliveryState: "QUEUED", lastFailure: null } });
    eventType = "admin_live_notification_queued";
    eventPayload = { action, recipient: "redacted", provider: "RESEND" };
  } else {
    return json({ error: "Unknown operationalization action." }, 400);
  }

  const result = await writeOperationalState(next, admin.id, eventType, eventPayload);
  await auditAdminEvent({ adminUserId: admin.id, eventType, ipAddress, userAgent, metadata: eventPayload });
  return json({ ok: true, persisted: result.persisted, state: result.state, note: result.persisted ? "Saved to the shared Admin operational state store." : "Validated and audit logged; Supabase persistence is not configured." });
}
