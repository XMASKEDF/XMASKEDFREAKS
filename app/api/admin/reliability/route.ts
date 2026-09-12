import { NextRequest, NextResponse } from "next/server";
import {
  adminSessionCookie,
  auditAdminEvent,
  getAdminBySession,
  hasAdminPermission
} from "@/lib/admin-auth";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { resetCircuit } from "@/lib/reliability/circuit-breaker";
import { getReliabilityCenterData } from "@/lib/reliability/health";
import { cleanReliabilityText } from "@/lib/reliability/sanitize";
import { extractClientIp } from "@/lib/security";

const statuses = new Set(["Detected", "Investigating", "Contained", "Monitoring", "Resolved", "False Positive", "Requires Vendor", "Requires Admin Action"]);

async function authorized(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  return admin && hasAdminPermission(admin, "admin.operations.manage") ? admin : null;
}

export async function GET(request: NextRequest) {
  if (!await authorized(request)) return NextResponse.json({ message: "Not found." }, { status: 404 });
  return NextResponse.json(await getReliabilityCenterData(), { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: NextRequest) {
  const admin = await authorized(request);
  if (!admin) return NextResponse.json({ message: "Not found." }, { status: 404 });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ message: "Reliability storage is not connected." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const incidentId = String(body.incidentId || "");
  const nextStatus = String(body.status || "");
  if (!/^[0-9a-f-]{36}$/i.test(incidentId) || !statuses.has(nextStatus)) return NextResponse.json({ message: "Valid incident and status are required." }, { status: 400 });
  const currentResponse = await fetch(`${service.url}/rest/v1/reliability_incidents?id=eq.${incidentId}&select=*&limit=1`, { cache: "no-store", headers: serviceHeaders(service) });
  const [current] = currentResponse.ok ? await currentResponse.json() as Array<Record<string, unknown>> : [];
  if (!current) return NextResponse.json({ message: "Incident not found." }, { status: 404 });
  if (Number(current.severity) >= 4 && nextStatus === "Resolved" && !cleanReliabilityText(body.notes, 4000)) {
    return NextResponse.json({ message: "Critical incidents require closure notes describing the repair or active protection." }, { status: 400 });
  }
  const now = new Date().toISOString();
  const patch = {
    status: nextStatus,
    assigned_admin_id: body.assignToMe === true ? admin.id : current.assigned_admin_id,
    resolution_notes: cleanReliabilityText(body.notes, 4000) || current.resolution_notes,
    resolved_at: ["Resolved", "False Positive"].includes(nextStatus) ? now : null,
    updated_at: now
  };
  const update = await fetch(`${service.url}/rest/v1/reliability_incidents?id=eq.${incidentId}`, { method: "PATCH", headers: serviceHeaders(service, "return=minimal"), body: JSON.stringify(patch) });
  if (!update.ok) return NextResponse.json({ message: "Incident update failed." }, { status: 422 });
  await fetch(`${service.url}/rest/v1/reliability_incident_actions`, {
    method: "POST",
    headers: serviceHeaders(service, "return=minimal"),
    body: JSON.stringify({
      incident_id: incidentId,
      admin_user_id: admin.id,
      action_type: "status_change",
      previous_status: current.status,
      next_status: nextStatus,
      notes: cleanReliabilityText(body.notes, 4000),
      safe_automatic: false,
      approval_required: Number(current.severity) >= 4,
      result: "recorded"
    })
  });
  await auditAdminEvent({
    adminUserId: admin.id,
    eventType: "reliability_incident_updated",
    ipAddress: extractClientIp(request.headers),
    userAgent: request.headers.get("user-agent") || "",
    metadata: { incidentId, previousStatus: current.status, nextStatus }
  });
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  const admin = await authorized(request);
  if (!admin) return NextResponse.json({ message: "Not found." }, { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || "");
  if (action === "run-health") return NextResponse.json(await getReliabilityCenterData());
  if (action === "reset-circuit") {
    if (body.confirmed !== true) return NextResponse.json({ message: "Administrator confirmation is required." }, { status: 400 });
    const provider = cleanReliabilityText(body.provider, 80);
    if (!provider) return NextResponse.json({ message: "Provider is required." }, { status: 400 });
    resetCircuit(provider);
    await auditAdminEvent({ adminUserId: admin.id, eventType: "reliability_circuit_reset", ipAddress: extractClientIp(request.headers), userAgent: request.headers.get("user-agent") || "", metadata: { provider } });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ message: "This recovery action is not approved for automatic execution." }, { status: 400 });
}
