import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession } from "@/lib/admin-auth";
import { findMediaAsset, mediaCredentials, mediaHeaders, replaceMediaUsage } from "@/lib/media/server";
import { extractClientIp } from "@/lib/security";

export async function PATCH(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value); if (!admin || admin.role !== "ADMIN" || !admin.two_factor_required) return NextResponse.json({ ok: false, error: "ADMIN access with 2FA is required." }, { status: 401 });
  const service = mediaCredentials(); if (!service) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  const body = await request.json().catch(() => ({})); const asset = await findMediaAsset(String(body.mediaId || ""));
  if (!asset || asset.status !== "published" || !asset.is_public) return NextResponse.json({ ok: false, error: "The official logo must be a published public image." }, { status: 400 });
  const response = await fetch(`${service.url}/rest/v1/site_branding_settings?on_conflict=id`, { method: "POST", headers: mediaHeaders(service, { prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify({ id: "default", logo_media_id: asset.id, logo_url: asset.public_url, updated_by: admin.id, updated_at: new Date().toISOString() }) });
  if (!response.ok) return NextResponse.json({ ok: false, error: "Unable to save branding." }, { status: 400 });
  await replaceMediaUsage({ mediaId: String(asset.id), usageType: "Site Logo", resourceId: "official", route: "/", fieldName: "header-logo" });
  await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_media_branding_saved", ipAddress: extractClientIp(request.headers), userAgent: request.headers.get("user-agent") || "unknown", metadata: { mediaId: asset.id } });
  return NextResponse.json({ ok: true, logoUrl: asset.public_url });
}

