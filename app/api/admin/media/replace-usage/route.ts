import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession } from "@/lib/admin-auth";
import { findMediaAsset, mediaCredentials, mediaHeaders } from "@/lib/media/server";
import { extractClientIp } from "@/lib/security";

export async function POST(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value); if (!admin || admin.role !== "ADMIN" || !admin.two_factor_required) return NextResponse.json({ ok: false, error: "ADMIN access with 2FA is required." }, { status: 401 });
  const service = mediaCredentials(); if (!service) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  const body = await request.json().catch(() => ({})); const sourceId = String(body.sourceId || ""); const targetId = String(body.targetId || "");
  const [source, target] = await Promise.all([findMediaAsset(sourceId), findMediaAsset(targetId)]);
  if (!source || !target || target.status !== "published" || !target.is_public) return NextResponse.json({ ok: false, error: "Choose a published replacement image." }, { status: 400 });
  const usageResponse = await fetch(`${service.url}/rest/v1/media_usage?media_id=eq.${sourceId}&select=*`, { headers: mediaHeaders(service) }); const usages = usageResponse.ok ? await usageResponse.json() as Array<Record<string, unknown>> : [];
  try {
    for (const usage of usages) {
      const type = String(usage.usage_type); const resourceId = String(usage.resource_id || ""); const field = String(usage.field_name || "image");
      if (type === "Game Thumbnail") await fetch(`${service.url}/rest/v1/game_catalog?id=eq.${encodeURIComponent(resourceId)}`, { method: "PATCH", headers: mediaHeaders(service), body: JSON.stringify({ thumbnail_url: target.public_url, thumbnail_width: target.width, thumbnail_height: target.height, thumbnail_mime_type: target.mime_type, thumbnail_file_size: target.file_size, thumbnail_updated_by: admin.id, thumbnail_updated_at: new Date().toISOString() }) });
      if (type === "Tip Menu") await fetch(`${service.url}/rest/v1/tip_options?id=eq.${encodeURIComponent(resourceId)}`, { method: "PATCH", headers: mediaHeaders(service), body: JSON.stringify({ media_id: target.id, artwork_url: target.public_url, updated_by: admin.id, updated_at: new Date().toISOString() }) });
      if (type === "Site Logo") await fetch(`${service.url}/rest/v1/site_branding_settings?id=eq.default`, { method: "PATCH", headers: mediaHeaders(service), body: JSON.stringify({ logo_media_id: target.id, logo_url: target.public_url, updated_by: admin.id, updated_at: new Date().toISOString() }) });
      if (type.startsWith("Global Background")) { const idColumn = field === "mobile" ? "mobile_media_id" : field === "fallback" ? "fallback_media_id" : "desktop_media_id"; const urlColumn = field === "mobile" ? "mobile_url" : field === "fallback" ? "fallback_url" : "desktop_url"; await fetch(`${service.url}/rest/v1/site_background_settings?id=eq.default`, { method: "PATCH", headers: mediaHeaders(service), body: JSON.stringify({ [idColumn]: target.id, [urlColumn]: target.public_url, updated_by: admin.id, updated_at: new Date().toISOString() }) }); }
      await fetch(`${service.url}/rest/v1/media_usage?id=eq.${String(usage.id)}`, { method: "PATCH", headers: mediaHeaders(service), body: JSON.stringify({ media_id: target.id }) });
    }
    await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_media_replaced_everywhere", ipAddress: extractClientIp(request.headers), userAgent: request.headers.get("user-agent") || "unknown", metadata: { sourceId, targetId, usageCount: usages.length } });
    return NextResponse.json({ ok: true, replaced: usages.length });
  } catch { return NextResponse.json({ ok: false, error: "One or more usage references could not be replaced." }, { status: 400 }); }
}
