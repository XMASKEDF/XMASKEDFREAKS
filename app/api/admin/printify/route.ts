import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession, hasAdminPermission } from "@/lib/admin-auth";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import {
  getPrintifyManagementData,
  runPrintifyHealthProbe,
  syncPrintifyOrdersAndReconcile,
  syncPrintifyProducts,
  syncPrintifyProviders,
  syncPrintifyShipping
} from "@/lib/commerce/pod/management";
import { extractClientIp } from "@/lib/security";

export const dynamic = "force-dynamic";

const attempts = new Map<string, { count: number; resetAt: number }>();

function limited(key: string) {
  const now = Date.now();
  const existing = attempts.get(key);
  if (!existing || existing.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  existing.count += 1;
  return existing.count > 20;
}

async function authorized(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  return admin && hasAdminPermission(admin, "admin.commerce.manage") ? admin : null;
}

async function audit(request: NextRequest, adminId: string, action: string, metadata: Record<string, unknown> = {}) {
  await auditAdminEvent({
    adminUserId: adminId,
    eventType: `printify_${action}`,
    ipAddress: extractClientIp(request.headers),
    userAgent: request.headers.get("user-agent") || "unknown",
    metadata
  });
}

export async function GET(request: NextRequest) {
  const admin = await authorized(request);
  if (!admin) return NextResponse.json({ message: "Not found." }, { status: 404 });
  return NextResponse.json(await getPrintifyManagementData(), { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const admin = await authorized(request);
  if (!admin) return NextResponse.json({ message: "Not found." }, { status: 404 });
  const ip = extractClientIp(request.headers);
  if (limited(`${admin.id}:${ip}`)) return NextResponse.json({ error: "Too many management actions. Wait one minute." }, { status: 429 });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ error: "Supabase service storage is not configured." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || "");
  let result: unknown;

  if (action === "health") result = await runPrintifyHealthProbe("admin", admin.id);
  else if (action === "sync-products" || action === "sync-inventory") result = await syncPrintifyProducts("admin", admin.id);
  else if (action === "sync-providers") result = await syncPrintifyProviders("admin", admin.id);
  else if (action === "sync-shipping") result = await syncPrintifyShipping("admin", admin.id);
  else if (action === "reconcile") result = await syncPrintifyOrdersAndReconcile("admin", admin.id);
  else if (action === "sync-all") {
    const products = await syncPrintifyProducts("admin", admin.id);
    const providers = await syncPrintifyProviders("admin", admin.id);
    const shipping = await syncPrintifyShipping("admin", admin.id);
    const reconciliation = await syncPrintifyOrdersAndReconcile("admin", admin.id);
    result = { ok: [products, providers, shipping, reconciliation].every((item) => item.ok), products, providers, shipping, reconciliation };
  } else if (action === "settings") {
    const settings = body.settings && typeof body.settings === "object" ? body.settings as Record<string, unknown> : {};
    const payload = {
      enabled: settings.enabled === true,
      product_sync_enabled: settings.product_sync_enabled !== false,
      inventory_sync_enabled: settings.inventory_sync_enabled !== false,
      provider_sync_enabled: settings.provider_sync_enabled !== false,
      shipping_sync_enabled: settings.shipping_sync_enabled !== false,
      reconciliation_enabled: settings.reconciliation_enabled !== false,
      automatic_retry_enabled: settings.automatic_retry_enabled !== false,
      preferred_provider_id: Number(settings.preferred_provider_id) > 0 ? Number(settings.preferred_provider_id) : null,
      shipping_cache_minutes: Math.max(15, Math.min(10080, Number(settings.shipping_cache_minutes) || 360)),
      product_sync_minutes: Math.max(15, Math.min(10080, Number(settings.product_sync_minutes) || 60)),
      reconciliation_minutes: Math.max(15, Math.min(1440, Number(settings.reconciliation_minutes) || 30)),
      max_retry_attempts: Math.max(1, Math.min(10, Number(settings.max_retry_attempts) || 5)),
      last_changed_by: admin.id,
      last_changed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const response = await fetch(`${service.url}/rest/v1/pod_provider_settings?provider=eq.printify`, { method: "PATCH", headers: serviceHeaders(service), body: JSON.stringify(payload) });
    if (!response.ok) return NextResponse.json({ error: "Provider settings could not be saved." }, { status: 422 });
    result = { ok: true };
  } else if (action === "retry-job") {
    if (body.confirmed !== true) return NextResponse.json({ error: "Confirmation is required before retrying fulfillment." }, { status: 400 });
    const jobId = String(body.jobId || "");
    const response = await fetch(`${service.url}/rest/v1/printify_fulfillment_jobs?id=eq.${encodeURIComponent(jobId)}&status=in.(retry,failed,manual_approval)&printify_order_id=is.null&select=id,order_id,status`, { cache: "no-store", headers: serviceHeaders(service) });
    const [job] = response.ok ? await response.json() as Array<{ id: string; order_id: string }> : [];
    if (!job) return NextResponse.json({ error: "This job is not eligible for a safe retry." }, { status: 409 });
    const fulfillmentResponse = await fetch(`${service.url}/rest/v1/commerce_fulfillments?order_id=eq.${job.order_id}&printify_order_id=is.null&select=order_id&limit=1`, { cache: "no-store", headers: serviceHeaders(service) });
    const [fulfillment] = fulfillmentResponse.ok ? await fulfillmentResponse.json() as Array<{ order_id: string }> : [];
    if (!fulfillment) return NextResponse.json({ error: "A provider order may already exist. Reconcile before retrying." }, { status: 409 });
    const update = await fetch(`${service.url}/rest/v1/printify_fulfillment_jobs?id=eq.${job.id}`, { method: "PATCH", headers: serviceHeaders(service), body: JSON.stringify({ status: "retry", next_attempt_at: new Date().toISOString(), last_error_code: null, updated_at: new Date().toISOString() }) });
    if (!update.ok) return NextResponse.json({ error: "The retry could not be queued." }, { status: 422 });
    result = { ok: true };
  } else if (action === "cancel-pending") {
    if (body.confirmed !== true) return NextResponse.json({ error: "Confirmation is required before canceling a queued submission." }, { status: 400 });
    const jobId = String(body.jobId || "");
    const update = await fetch(`${service.url}/rest/v1/printify_fulfillment_jobs?id=eq.${encodeURIComponent(jobId)}&status=in.(pending,retry)&printify_order_id=is.null`, {
      method: "PATCH",
      headers: serviceHeaders(service, "return=representation"),
      body: JSON.stringify({ status: "disabled", cancellation_requested_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    });
    const changed = update.ok ? await update.json() as unknown[] : [];
    if (!changed.length) return NextResponse.json({ error: "Only unsent pending jobs can be canceled here." }, { status: 409 });
    result = { ok: true };
  } else if (action === "finding-status") {
    const findingId = String(body.findingId || "");
    const status = String(body.status || "");
    if (!["investigating", "resolved", "ignored"].includes(status)) return NextResponse.json({ error: "Invalid finding status." }, { status: 400 });
    const update = await fetch(`${service.url}/rest/v1/pod_reconciliation_findings?id=eq.${encodeURIComponent(findingId)}`, {
      method: "PATCH",
      headers: serviceHeaders(service),
      body: JSON.stringify({ status, reviewed_by: admin.id, resolved_at: status === "resolved" ? new Date().toISOString() : null })
    });
    if (!update.ok) return NextResponse.json({ error: "Finding status could not be changed." }, { status: 422 });
    result = { ok: true };
  } else return NextResponse.json({ error: "Unsupported Printify management action." }, { status: 400 });

  await audit(request, admin.id, action, { targetId: body.jobId || body.findingId || null });
  return NextResponse.json({ result, data: await getPrintifyManagementData() });
}
