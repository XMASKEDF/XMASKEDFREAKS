import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession, hasAdminPermission } from "@/lib/admin-auth";
import { extractClientIp } from "@/lib/security";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { cleanFeetText, safeFeetPresetStatus, safeFeetStatus, type FeetRequestPreset } from "@/lib/feet/types";
import { getFeetPresets, getFeetRequests } from "@/lib/feet/server";

export const dynamic = "force-dynamic";

async function authorized(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  return admin && hasAdminPermission(admin, "admin.commerce.manage") ? admin : null;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || `feet-request-${Date.now()}`;
}

function safeThumbnail(value: unknown) {
  const thumbnail = String(value || "").trim().slice(0, 1000);
  return !thumbnail || thumbnail.startsWith("/") || /^https:\/\//i.test(thumbnail) ? thumbnail || null : null;
}

async function responseData() {
  const [presets, requests] = await Promise.all([getFeetPresets(true), getFeetRequests()]);
  return { configured: presets.configured && requests.configured, presets: presets.presets, requests: requests.requests };
}

export async function GET(request: NextRequest) {
  const admin = await authorized(request);
  if (!admin) return NextResponse.json({ ok: false, error: "Admin access required." }, { status: 403 });
  return NextResponse.json({ ok: true, ...(await responseData()) });
}

export async function POST(request: NextRequest) {
  const admin = await authorized(request);
  const service = serviceCredentials();
  if (!admin) return NextResponse.json({ ok: false, error: "Admin access required." }, { status: 403 });
  if (!service) return NextResponse.json({ ok: false, error: "Feet Requests database unavailable." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || "");
  const headers = serviceHeaders(service);
  let response: Response | null = null;
  let auditType = `admin_feet_${action}`;
  let targetId = String(body.id || "");

  if (action === "preset-create" || action === "preset-save") {
    const source = (body.preset || {}) as Partial<FeetRequestPreset>;
    const id = action === "preset-create" ? undefined : String(source.id || body.id || "");
    const name = cleanFeetText(source.name, 120);
    const description = cleanFeetText(source.description, 500);
    const coinPrice = Math.floor(Number(source.coinPrice));
    const status = safeFeetPresetStatus(source.status);
    if (!name || !description || !Number.isSafeInteger(coinPrice) || coinPrice < 1 || coinPrice > 100000) return NextResponse.json({ ok: false, error: "Enter a name, description, and whole coin price." }, { status: 400 });
    const row = { name, slug: slugify(String(source.slug || name)), thumbnail_url: safeThumbnail(source.thumbnailUrl), description, coin_price: coinPrice, status, display_order: Math.max(1, Math.floor(Number(source.displayOrder || 1))), updated_by: admin.id, updated_at: new Date().toISOString() };
    response = await fetch(`${service.url}/rest/v1/feet_request_presets${id ? `?id=eq.${encodeURIComponent(id)}` : ""}`, { method: id ? "PATCH" : "POST", headers: serviceHeaders(service, id ? "return=minimal" : "return=representation"), body: JSON.stringify(id ? row : { ...row, created_by: admin.id }) }).catch(() => null);
    targetId = id || "created";
    auditType = action === "preset-create" ? "FEET_REQUEST_PRESET_CREATED" : source.coinPrice !== coinPrice ? "FEET_REQUEST_PRESET_EDITED" : "FEET_REQUEST_PRESET_EDITED";
  } else if (action === "preset-duplicate") {
    const source = (body.preset || {}) as Partial<FeetRequestPreset>;
    const name = cleanFeetText(`${String(source.name || "Feet Request")} Copy`, 120);
    response = await fetch(`${service.url}/rest/v1/feet_request_presets`, { method: "POST", headers: serviceHeaders(service, "return=representation"), body: JSON.stringify({ name, slug: slugify(name), thumbnail_url: safeThumbnail(source.thumbnailUrl), description: cleanFeetText(source.description, 500), coin_price: Math.max(1, Math.floor(Number(source.coinPrice || 1))), status: "DRAFT", display_order: Math.max(1, Math.floor(Number(source.displayOrder || 1)) + 1), created_by: admin.id, updated_by: admin.id }) }).catch(() => null);
    auditType = "FEET_REQUEST_PRESET_CREATED";
  } else if (action === "preset-status") {
    const status = safeFeetPresetStatus(body.status);
    response = await fetch(`${service.url}/rest/v1/feet_request_presets?id=eq.${encodeURIComponent(String(body.id || ""))}`, { method: "PATCH", headers, body: JSON.stringify({ status, updated_by: admin.id, updated_at: new Date().toISOString() }) }).catch(() => null);
    auditType = status === "ARCHIVED" ? "FEET_REQUEST_PRESET_ARCHIVED" : "FEET_REQUEST_PRESET_EDITED";
  } else if (action === "preset-reorder") {
    const presets = (await getFeetPresets(true)).presets;
    const index = presets.findIndex((preset) => preset.id === String(body.id || ""));
    const direction = body.direction === "up" ? -1 : 1;
    const target = index + direction;
    if (index < 0 || !presets[target]) return NextResponse.json({ ok: false, error: "That preset is already at the edge of the list." }, { status: 400 });
    const current = presets[index]; const neighbor = presets[target];
    const first = await fetch(`${service.url}/rest/v1/feet_request_presets?id=eq.${encodeURIComponent(current.id)}`, { method: "PATCH", headers, body: JSON.stringify({ display_order: neighbor.displayOrder, updated_by: admin.id, updated_at: new Date().toISOString() }) });
    const second = await fetch(`${service.url}/rest/v1/feet_request_presets?id=eq.${encodeURIComponent(neighbor.id)}`, { method: "PATCH", headers, body: JSON.stringify({ display_order: current.displayOrder, updated_by: admin.id, updated_at: new Date().toISOString() }) });
    response = first.ok && second.ok ? new Response(null, { status: 204 }) : new Response(null, { status: 422 });
    auditType = "FEET_REQUEST_PRESET_EDITED";
  } else if (action === "request-status" || action === "request-refund") {
    targetId = String(body.requestId || "");
    const rpc = action === "request-refund" ? "refund_feet_request" : "update_feet_request_status";
    const status = safeFeetStatus(body.status);
    response = await fetch(`${service.url}/rest/v1/rpc/${rpc}`, { method: "POST", headers, body: JSON.stringify(action === "request-refund" ? { p_request_id: targetId, p_admin_id: admin.id, p_admin_notes: cleanFeetText(body.adminNotes, 1000) } : { p_request_id: targetId, p_status: status, p_admin_id: admin.id, p_admin_notes: cleanFeetText(body.adminNotes, 1000) }) }).catch(() => null);
    auditType = action === "request-refund" ? "FEET_REQUEST_REFUNDED" : "FEET_REQUEST_STATUS_CHANGED";
  } else return NextResponse.json({ ok: false, error: "Unsupported Feet Request action." }, { status: 400 });

  if (!response?.ok) return NextResponse.json({ ok: false, error: "The Feet Request change was rejected." }, { status: 422 });
  await auditAdminEvent({ adminUserId: admin.id, eventType: auditType, ipAddress: extractClientIp(request.headers), userAgent: request.headers.get("user-agent") || "unknown", metadata: { targetId, action } });
  return NextResponse.json({ ok: true, ...(await responseData()) });
}
