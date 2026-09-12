import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession, hasAdminPermission } from "@/lib/admin-auth";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { buildCostSummary, getCostRecords } from "@/lib/cost-control";
import { getAccountingSummary } from "@/lib/accounting";
import { runLaunchReadiness } from "@/lib/launch/readiness";
import { setEntitlementStatus, type EntitlementStatus } from "@/lib/entitlements";
import { extractClientIp } from "@/lib/security";

export const dynamic = "force-dynamic";

const reviewStatuses = new Set(["APPROVED", "DENIED", "MONITORING", "RESTRICTED", "UNRESTRICTED"]);
const entitlementStatuses = new Set<EntitlementStatus>(["EXPIRED", "REVOKED", "REFUNDED", "CHARGEBACK_HOLD", "ADMIN_HOLD"]);

async function authorized(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  return admin && hasAdminPermission(admin, "admin.operations.manage") ? admin : null;
}

async function rows(path: string) {
  const service = serviceCredentials();
  if (!service) return [] as Array<Record<string, unknown>>;
  const response = await fetch(`${service.url}/rest/v1/${path}`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null);
  return response?.ok ? await response.json() as Array<Record<string, unknown>> : [];
}

async function recordLaunchRun(adminId: string, report: Awaited<ReturnType<typeof runLaunchReadiness>>) {
  const service = serviceCredentials();
  if (!service) return;
  await fetch(`${service.url}/rest/v1/launch_readiness_runs`, {
    method: "POST",
    headers: serviceHeaders(service, "return=minimal"),
    body: JSON.stringify({
      environment: report.environment,
      release_version: report.release,
      overall_status: report.overall,
      green_count: report.green,
      yellow_count: report.yellow,
      red_count: report.red,
      blockers: report.blockers,
      checks: report.checks,
      run_by: adminId
    })
  }).catch(() => undefined);
}

export async function GET(request: NextRequest) {
  const admin = await authorized(request);
  if (!admin) return NextResponse.json({ message: "Not found." }, { status: 404 });

  const service = serviceCredentials();
  const [riskEvents, entitlements, supportCases, rights, accounting, costRecords, launch, budgets] = await Promise.all([
    rows("risk_events?select=id,action_type,environment,user_id,order_id,transaction_id,risk_score,risk_level,reasons,decision,requires_review,review_status,review_reason,reviewed_at,created_at&order=created_at.desc&limit=100"),
    rows("platform_entitlements?select=id,customer_id,resource_type,resource_id,source_order_id,source_transaction_id,status,granted_at,expires_at,revoked_at,environment,created_at,updated_at&order=updated_at.desc&limit=100"),
    rows("support_cases?select=id,customer_id,guest_reference,category,priority,status,subject,related_order_id,related_payment_id,related_product_id,related_entitlement_id,assigned_admin_id,created_at,updated_at,first_response_at,resolved_at&order=updated_at.desc&limit=100"),
    rows("media_rights?select=media_id,title,rights_type,status,commercial_use_allowed,expires_at,documentation_reference,updated_at&order=updated_at.desc&limit=100"),
    getAccountingSummary(),
    getCostRecords(),
    runLaunchReadiness(),
    rows("cost_budgets?select=monthly_budget,warning_threshold_percent,updated_at&limit=1")
  ]);
  const budget = budgets[0] ? Number(budgets[0].monthly_budget || 0) : null;
  const costs = buildCostSummary(costRecords, { budget: budget && budget > 0 ? budget : null });

  return NextResponse.json({
    ok: true,
    configured: Boolean(service),
    environment: process.env.XMF_ENVIRONMENT || process.env.APP_ENV || "LOCAL",
    riskEvents: riskEvents.filter((row) => row.requires_review === true || ["HIGH", "CRITICAL"].includes(String(row.risk_level))),
    entitlements,
    supportCases,
    rights,
    accounting,
    costs,
    costRecords,
    budget: budgets[0] || null,
    launch,
    generatedAt: new Date().toISOString()
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const admin = await authorized(request);
  if (!admin) return NextResponse.json({ message: "Not found." }, { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || "");
  const reason = String(body.reason || "").trim().slice(0, 1000);
  const service = serviceCredentials();
  let ok = false;

  if (action === "run-launch") {
    const report = await runLaunchReadiness();
    await recordLaunchRun(admin.id, report);
    await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_launch_readiness_run", ipAddress: extractClientIp(request.headers), userAgent: request.headers.get("user-agent") || "unknown", metadata: { overall: report.overall, red: report.red, yellow: report.yellow, environment: report.environment } });
    return NextResponse.json({ ok: true, launch: report });
  }

  if (!service) return NextResponse.json({ message: "Supabase service credentials are not configured." }, { status: 503 });
  if (reason.length < 5) return NextResponse.json({ message: "A clear reason is required for an administrative change." }, { status: 400 });

  if (action === "risk-review") {
    const eventId = String(body.eventId || "");
    const reviewStatus = String(body.reviewStatus || "");
    if (!eventId || !reviewStatuses.has(reviewStatus)) return NextResponse.json({ message: "Unsupported risk review status." }, { status: 400 });
    const response = await fetch(`${service.url}/rest/v1/risk_events?id=eq.${encodeURIComponent(eventId)}`, { method: "PATCH", headers: serviceHeaders(service, "return=minimal"), body: JSON.stringify({ review_status: reviewStatus, review_reason: reason, reviewed_by: admin.id, reviewed_at: new Date().toISOString() }) });
    ok = response.ok;
  } else if (action === "entitlement-status") {
    const entitlementId = String(body.entitlementId || "");
    const status = String(body.status || "") as EntitlementStatus;
    if (!entitlementId || !entitlementStatuses.has(status)) return NextResponse.json({ message: "Unsupported entitlement status." }, { status: 400 });
    ok = await setEntitlementStatus(entitlementId, status as Exclude<EntitlementStatus, "PENDING" | "ACTIVE">, reason);
  } else if (action === "support-status") {
    const caseId = String(body.caseId || "");
    const status = String(body.status || "");
    if (!caseId || !["NEW", "OPEN", "WAITING FOR CUSTOMER", "WAITING FOR PROVIDER", "IN REVIEW", "RESOLVED", "CLOSED"].includes(status)) return NextResponse.json({ message: "Unsupported support case status." }, { status: 400 });
    const response = await fetch(`${service.url}/rest/v1/support_cases?id=eq.${encodeURIComponent(caseId)}`, { method: "PATCH", headers: serviceHeaders(service, "return=minimal"), body: JSON.stringify({ status, internal_notes: reason, updated_at: new Date().toISOString(), resolved_at: ["RESOLVED", "CLOSED"].includes(status) ? new Date().toISOString() : null }) });
    ok = response.ok;
  } else if (action === "rights-status") {
    const mediaId = String(body.mediaId || "");
    const status = String(body.status || "");
    if (!mediaId || !["CLEARED", "RESTRICTED", "EXPIRING", "EXPIRED", "REVIEW REQUIRED"].includes(status)) return NextResponse.json({ message: "Unsupported media rights status." }, { status: 400 });
    const response = await fetch(`${service.url}/rest/v1/media_rights?media_id=eq.${encodeURIComponent(mediaId)}`, { method: "PATCH", headers: serviceHeaders(service, "return=minimal"), body: JSON.stringify({ status, notes: reason, updated_by: admin.id, updated_at: new Date().toISOString() }) });
    ok = response.ok;
  } else {
    return NextResponse.json({ message: "Unsupported backbone action." }, { status: 400 });
  }

  await auditAdminEvent({ adminUserId: admin.id, eventType: `admin_backbone_${action}`, ipAddress: extractClientIp(request.headers), userAgent: request.headers.get("user-agent") || "unknown", metadata: { reason, outcome: ok ? "success" : "failed" } });
  if (!ok) return NextResponse.json({ message: "The requested change could not be saved." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
