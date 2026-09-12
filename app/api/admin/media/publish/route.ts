import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession } from "@/lib/admin-auth";
import { publishPublicMediaAsset } from "@/lib/media/publication";
import { extractClientIp } from "@/lib/security";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  if (!admin || admin.role !== "ADMIN" && admin.role !== "SUPER_ADMIN" || !admin.two_factor_required) {
    return NextResponse.json({ ok: false, error: "Authenticated ADMIN account with 2FA is required." }, { status: 401 });
  }
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const mediaId = String(body.mediaId || "").trim();
  if (!mediaId) return NextResponse.json({ ok: false, error: "A media asset is required." }, { status: 400 });
  const result = await publishPublicMediaAsset(mediaId, admin.id);
  await auditAdminEvent({
    adminUserId: admin.id,
    eventType: result.ok ? "admin_media_publication_completed" : "admin_media_publication_failed",
    ipAddress: extractClientIp(request.headers),
    userAgent: request.headers.get("user-agent") || "unknown",
    metadata: { mediaId, status: result.status, code: result.code || null }
  });
  return NextResponse.json(result, { status: result.ok ? 200 : result.code === "MEDIA_NOT_FOUND" ? 404 : 409 });
}
