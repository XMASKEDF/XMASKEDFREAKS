import { NextRequest, NextResponse } from "next/server";
import {
  adminSessionCookie,
  auditAdminEvent,
  getAdminBySession,
  hasAdminPermission,
  hasRecentAdminReauthentication,
  isSuperAdmin
} from "@/lib/admin-auth";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import {
  getMaintenanceSettings
} from "@/lib/maintenance";
import { runReliabilityHealthChecks } from "@/lib/reliability/health";
import { extractClientIp } from "@/lib/security";

export const dynamic = "force-dynamic";
const allowedRoutes = ["/kill-switch", "/maintenance", "/policies", "/api/health", "/api/kill-switch", "/api/maintenance", "/api/webhooks/payments", "/api/webhooks/printify", "/api/jobs/payment-reconciliation", "/api/jobs/printify", "/api/jobs/reliability"];

async function authorize(request: NextRequest) {
  const token = request.cookies.get(adminSessionCookie)?.value;
  const admin = await getAdminBySession(token);
  if (!admin || !isSuperAdmin(admin) || !hasAdminPermission(admin, "admin.security.manage")) return null;
  return { admin, token };
}

function adminError(message: string, status: number) {
  return NextResponse.json({ message }, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth) return adminError("Not found.", 404);
  const service = serviceCredentials();
  const historyResponse = service ? await fetch(`${service.url}/rest/v1/maintenance_history?select=id,action,scope,reason,success,security_classification,state_version,created_at&order=created_at.desc&limit=50`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null) : null;
  const history = historyResponse?.ok ? await historyResponse.json() : [];
  const settings = await getMaintenanceSettings();
  return NextResponse.json({
    settings,
    history,
    reauthenticationRequired: !await hasRecentAdminReauthentication(auth.token),
    propagation: {
      stateVersion: settings.stateVersion,
      cacheWindowSeconds: 2,
      confirmedInstances: 0,
      status: "UNVERIFIED",
      message: "Edge and multi-instance acknowledgement requires production deployment telemetry."
    }
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  const context = { ipAddress: extractClientIp(request.headers), userAgent: request.headers.get("user-agent") || "unknown" };
  if (!auth) return adminError("Not found.", 404);
  if (!await hasRecentAdminReauthentication(auth.token)) {
    await auditAdminEvent({ adminUserId: auth.admin.id, eventType: "SITE_KILL_SWITCH_CHANGE_DENIED", ...context, metadata: { reason: "recent_reauthentication_required", success: false, security_classification: "critical" } });
    return adminError("Recent reauthentication is required.", 428);
  }
  const service = serviceCredentials();
  if (!service) return adminError("The production database is required for Kill Switch controls.", 503);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = body.action === "restore" ? "restore" : body.action === "activate" ? "activate" : null;
  const confirmation = String(body.confirmation || "");
  const reason = String(body.reason || "").trim().slice(0, 1000);
  if (!action || confirmation !== "KILL SWITCH" || reason.length < 8) return adminError("Action, written reason, and exact KILL SWITCH confirmation are required.", 400);

  // A Kill Switch is always a full public shutdown. The legacy scoped fields
  // remain in storage for historical compatibility but cannot weaken this path.
  const scope = "full" as const;
  const disabledSystems: string[] = [];

  let healthReview: Record<string, unknown> = {};
  if (action === "restore") {
    const checks = await runReliabilityHealthChecks();
    const blockingChecks = checks.filter((check) => check.state === "outage" || check.functional === false).map((check) => ({ id: check.id, state: check.state, detail: check.detail }));
    healthReview = { checkedAt: new Date().toISOString(), checks, blockingChecks };
    if (blockingChecks.length && body.override !== true) return NextResponse.json({ message: "Critical health checks require review before restoration.", healthReview }, { status: 409 });
    if (blockingChecks.length && String(body.overrideReason || "").trim().length < 12) return adminError("A detailed override reason is required while health checks are failing.", 400);
  }

  const expected = body.expectedReturnAt ? new Date(String(body.expectedReturnAt)) : null;
  if (expected && Number.isNaN(expected.getTime())) return adminError("Estimated return time is invalid.", 400);
  const rpc = await fetch(`${service.url}/rest/v1/rpc/set_emergency_maintenance`, {
    method: "POST",
    headers: serviceHeaders(service),
    body: JSON.stringify({
      p_enabled: action === "activate",
      p_scope: scope,
      p_public_message: String(body.publicMessage || "XMASKEDFREAKS is temporarily unavailable.").trim().slice(0, 1000),
      p_private_reason: reason,
      p_expected_return_at: expected?.toISOString() || null,
      p_disabled_systems: action === "activate" ? disabledSystems : [],
      p_allowed_routes: allowedRoutes,
      p_admin_user_id: auth.admin.id,
      p_request_reference: crypto.randomUUID(),
      p_override_reason: action === "restore" && body.override === true ? String(body.overrideReason || "").trim().slice(0, 1000) : null,
      p_health_review: healthReview
    })
  }).catch(() => null);
  if (!rpc?.ok) {
    await auditAdminEvent({ adminUserId: auth.admin.id, eventType: `SITE_KILL_SWITCH_${action.toUpperCase()}_FAILED`, ...context, metadata: { scope, success: false, security_classification: "critical", status: rpc?.status || 0 } });
    return adminError("Kill Switch state could not be stored safely.", 503);
  }
  await auditAdminEvent({ adminUserId: auth.admin.id, eventType: action === "activate" ? "SITE_KILL_SWITCH_ACTIVATED" : "SITE_KILL_SWITCH_DEACTIVATED", ...context, metadata: { scope, disabledSystems, reason, success: true, security_classification: "critical", healthReview } });
  return NextResponse.json({ ok: true, message: action === "activate" ? "Kill Switch is active." : "Public access is restored.", settings: await getMaintenanceSettings(), healthReview }, { headers: { "cache-control": "no-store" } });
}
