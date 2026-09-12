import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession, hasAdminPermission } from "@/lib/admin-auth";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { extractClientIp } from "@/lib/security";

async function authorize(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  return admin && hasAdminPermission(admin, "admin.customers.manage") ? admin : null;
}

export async function GET(request: NextRequest) {
  const admin = await authorize(request); const service = serviceCredentials();
  if (!admin) return NextResponse.json({ ok: false, error: "Admin access required." }, { status: 401 });
  if (!service) return NextResponse.json({ ok: true, feedback: [] });
  const status = request.nextUrl.searchParams.get("status");
  const filter = status ? `&status=eq.${encodeURIComponent(status)}` : "";
  const response = await fetch(`${service.url}/rest/v1/customer_feedback?select=id,category,original_text,original_language,english_translation,translation_status,status,admin_notes,created_at&order=created_at.desc&limit=100${filter}`, { headers: serviceHeaders(service) });
  return NextResponse.json({ ok: response.ok, feedback: response.ok ? await response.json() : [] });
}

export async function PATCH(request: NextRequest) {
  const admin = await authorize(request); const service = serviceCredentials();
  if (!admin || !service) return NextResponse.json({ ok: false, error: "Admin access required." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>; const id = String(body.id || "");
  const status = ["New", "Reviewed", "Responded", "Archived"].includes(String(body.status)) ? String(body.status) : "Reviewed";
  const response = await fetch(`${service.url}/rest/v1/customer_feedback?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: serviceHeaders(service, "return=minimal"), body: JSON.stringify({ status, admin_notes: String(body.adminNotes || "").slice(0, 2000), reviewed_by: admin.id, reviewed_at: new Date().toISOString() }) });
  await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_feedback_updated", ipAddress: extractClientIp(request.headers), userAgent: request.headers.get("user-agent") || "unknown", metadata: { feedbackId: id, status } });
  return NextResponse.json({ ok: response.ok }, { status: response.ok ? 200 : 422 });
}
