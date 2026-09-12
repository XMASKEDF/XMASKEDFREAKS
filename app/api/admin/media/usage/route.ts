import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession } from "@/lib/admin-auth";
import { findMediaAsset, replaceMediaUsage } from "@/lib/media/server";
import { extractClientIp } from "@/lib/security";

export async function POST(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  if (!admin || admin.role !== "ADMIN" || !admin.two_factor_required) return NextResponse.json({ ok: false, error: "ADMIN access with 2FA is required." }, { status: 401 });
  const body = await request.json().catch(() => ({})); const asset = await findMediaAsset(String(body.mediaId || ""));
  if (!asset) return NextResponse.json({ ok: false, error: "Library image not found." }, { status: 404 });
  try {
    await replaceMediaUsage({ mediaId: String(asset.id), usageType: String(body.usageType || "Admin Preview").slice(0, 80), resourceId: String(body.resourceId || "default").slice(0, 120), route: String(body.route || "").slice(0, 240), fieldName: String(body.fieldName || "image").slice(0, 80) });
    await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_media_assigned", ipAddress: extractClientIp(request.headers), userAgent: request.headers.get("user-agent") || "unknown", metadata: { mediaId: asset.id, usageType: body.usageType, resourceId: body.resourceId } });
    return NextResponse.json({ ok: true, asset: { id: asset.id, url: asset.public_url, thumbnailUrl: asset.thumbnail_url } });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to assign image." }, { status: 400 }); }
}
