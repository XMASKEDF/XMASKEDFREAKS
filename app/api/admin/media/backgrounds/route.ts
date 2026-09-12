import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession } from "@/lib/admin-auth";
import { DEFAULT_SITE_BACKGROUND, getSiteBackgroundSettings } from "@/lib/media/backgrounds";
import { findMediaAsset, mediaCredentials, mediaHeaders, replaceMediaUsage } from "@/lib/media/server";
import { extractClientIp } from "@/lib/security";
import { sanitizeMatrixSettings } from "@/lib/background/matrix";

export async function GET(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value); if (!admin || admin.role !== "ADMIN") return NextResponse.json({ ok: false, error: "ADMIN access required." }, { status: 401 });
  return NextResponse.json({ ok: true, settings: await getSiteBackgroundSettings() });
}

export async function PATCH(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value); if (!admin || admin.role !== "ADMIN" || !admin.two_factor_required) return NextResponse.json({ ok: false, error: "ADMIN access with 2FA is required." }, { status: 401 });
  const service = mediaCredentials(); if (!service) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  const body = await request.json().catch(() => ({})); const current = await getSiteBackgroundSettings();
  const bound = (value: unknown, fallback: number, minimum: number, maximum: number) => { const parsed = Number(value); return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback; };
  const next = {
    ...DEFAULT_SITE_BACKGROUND,
    ...current,
    ...body,
    backgroundType: ["static", "video", "canvas", "webgl"].includes(body.backgroundType) ? body.backgroundType : current.backgroundType,
    matrixSlim: sanitizeMatrixSettings(body.matrixSlim ?? current.matrixSlim),
    opacity: bound(body.opacity, current.opacity, 0, 1),
    focalPointX: bound(body.focalPointX, current.focalPointX, 0, 1),
    focalPointY: bound(body.focalPointY, current.focalPointY, 0, 1),
    maximumPixelRatio: bound(body.maximumPixelRatio, current.maximumPixelRatio, 1, 3),
    resizeDebounceMs: bound(body.resizeDebounceMs, current.resizeDebounceMs, 50, 250)
  };
  const assignments: Array<["desktopMediaId" | "mobileMediaId" | "fallbackMediaId", "desktopUrl" | "mobileUrl" | "fallbackUrl", string]> = [["desktopMediaId", "desktopUrl", "desktop"], ["mobileMediaId", "mobileUrl", "mobile"], ["fallbackMediaId", "fallbackUrl", "fallback"]];
  for (const [idKey, urlKey, field] of assignments) { const id = next[idKey]; if (!id) { next[urlKey] = ""; continue; } const asset = await findMediaAsset(String(id)); if (!asset || asset.status !== "published" || !asset.is_public) return NextResponse.json({ ok: false, error: `${field} background must be a published public image.` }, { status: 400 }); next[urlKey] = String(asset.public_url); await replaceMediaUsage({ mediaId: String(asset.id), usageType: field === "fallback" ? "Global Background Fallback" : "Global Background", resourceId: field, route: "/", fieldName: field }); }
  const videoUrl = /^\/api\/media\/[0-9a-f-]+\/file$/i.test(String(next.videoUrl || "")) ? String(next.videoUrl) : "";
  if (next.backgroundType === "video" && next.videoUrl && !videoUrl) return NextResponse.json({ ok: false, error: "Video backgrounds must use an approved Media Library asset." }, { status: 400 });
  const scope = ["global", "live", "games", "admin", "landing"].includes(next.scope) ? next.scope : "global";
  const row = { id: "default", enabled: Boolean(next.enabled), background_type: next.backgroundType, matrix_slim_settings: next.matrixSlim, desktop_media_id: next.desktopMediaId, desktop_url: next.desktopUrl, mobile_media_id: next.mobileMediaId, mobile_url: next.mobileUrl, fallback_media_id: next.fallbackMediaId, fallback_url: next.fallbackUrl, video_url: videoUrl, opacity: next.opacity, overlay: String(next.overlay).slice(0, 80), scope, focal_point_x: next.focalPointX, focal_point_y: next.focalPointY, responsive_scaling: Boolean(next.responsiveScaling), maximum_pixel_ratio: next.maximumPixelRatio, resize_debounce_ms: next.resizeDebounceMs, particle_density_scaling: Boolean(next.particleDensityScaling), maintain_aspect_ratio: Boolean(next.maintainAspectRatio), dynamic_resolution: Boolean(next.dynamicResolution), mobile_performance_mode: Boolean(next.mobilePerformanceMode), automatic_gpu_optimization: Boolean(next.automaticGpuOptimization), updated_by: admin.id, updated_at: new Date().toISOString() };
  const response = await fetch(`${service.url}/rest/v1/site_background_settings?on_conflict=id`, { method: "POST", headers: mediaHeaders(service, { prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(row) });
  if (!response.ok) return NextResponse.json({ ok: false, error: "Unable to save background settings." }, { status: 400 });
  await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_media_background_saved", ipAddress: extractClientIp(request.headers), userAgent: request.headers.get("user-agent") || "unknown", metadata: { enabled: row.enabled, scope: row.scope, desktopMediaId: row.desktop_media_id, mobileMediaId: row.mobile_media_id } });
  return NextResponse.json({ ok: true, settings: { ...next, videoUrl, scope } });
}
