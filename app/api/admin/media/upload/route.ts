import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession } from "@/lib/admin-auth";
import { getObjectStorageProvider } from "@/lib/infrastructure/storage";
import { createMediaUploadSession, findMediaUploadSession, recordMediaStorageEvent, updateMediaUploadSession } from "@/lib/media/uploads";
import { normalizeMediaAssignment } from "@/lib/media/assignments";
import { authorizeMediaUpload, safeMediaUploadKey, validateUploadMetadata, type MediaUploadClass } from "@/lib/media/storage";
import { findMediaAsset, safeMediaSlug } from "@/lib/media/server";
import { extractClientIp } from "@/lib/security";

export const runtime = "nodejs";
const requests = new Map<string, { count: number; resetAt: number }>();

async function authorize(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  return admin?.role === "ADMIN" && admin.two_factor_required ? admin : null;
}

function limited(key: string) {
  const now = Date.now(); const current = requests.get(key);
  if (!current || current.resetAt <= now) { requests.set(key, { count: 1, resetAt: now + 60_000 }); return false; }
  current.count += 1; return current.count > 40;
}

export async function POST(request: NextRequest) {
  const admin = await authorize(request); const ipAddress = extractClientIp(request.headers); const userAgent = request.headers.get("user-agent") || "unknown";
  if (!admin) return NextResponse.json({ ok: false, code: "ADMIN_REQUIRED", error: "Authenticated ADMIN account with 2FA is required." }, { status: 401 });
  if (limited(`${admin.id}:${ipAddress}`)) return NextResponse.json({ ok: false, code: "RATE_LIMITED", error: "Too many upload authorization requests." }, { status: 429 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const mediaClass = String(body.mediaClass || "IMAGE").toUpperCase() as MediaUploadClass;
  const filename = String(body.filename || "").replace(/[\\/\u0000-\u001f]/g, "-").trim().slice(0, 220);
  const mimeType = String(body.mimeType || "").toLowerCase().trim(); const size = Number(body.size);
  if (!filename || !Number.isFinite(size)) return NextResponse.json({ ok: false, code: "INVALID_METADATA", error: "Filename, MIME type, and file size are required." }, { status: 400 });
  const requestedStatus = String(body.status || "draft").toLowerCase();
  const visibility = requestedStatus === "published" && mediaClass === "IMAGE" ? "PUBLIC" : "PRIVATE";
  try {
    const validated = validateUploadMetadata({ mediaClass, filename, mimeType, size, visibility });
    const replaceMediaId = body.replaceMediaId ? String(body.replaceMediaId) : null;
    const replaced = replaceMediaId ? await findMediaAsset(replaceMediaId) : null;
    if (replaceMediaId && !replaced) return NextResponse.json({ ok: false, code: "REPLACEMENT_NOT_FOUND", error: "The media selected for replacement no longer exists." }, { status: 404 });
    const categoryId = safeMediaSlug(String(body.categoryId || replaced?.category_id || "other"), "other");
    const key = safeMediaUploadKey(categoryId, validated.extension);
    const authorization = await authorizeMediaUpload({ key, bucket: validated.bucket, mimeType: validated.mimeType, size: validated.size, expiresInSeconds: 600 });
    if (!authorization) return NextResponse.json({ ok: false, code: "DIRECT_UPLOAD_UNAVAILABLE", error: "Secure direct uploads are not configured for this environment." }, { status: 503 });
    const assignment = normalizeMediaAssignment(body.assignment);
    if (body.assignment && !assignment) return NextResponse.json({ ok: false, code: "INVALID_MEDIA_ASSIGNMENT", error: "The product media assignment is invalid." }, { status: 400 });
    const session = await createMediaUploadSession({ bucket: validated.bucket, key, mediaClass: validated.mediaClass, filename, mimeType: validated.mimeType, size: validated.size, categoryId, folderId: body.folderId ? String(body.folderId) : replaced?.folder_id ? String(replaced.folder_id) : null, adminId: admin.id, expiresAt: authorization.expiresAt, metadata: { displayName: String(body.displayName || filename.replace(/\.[^.]+$/, "")).trim().slice(0, 140), altText: String(body.altText || "").trim().slice(0, 500), description: String(body.description || "").trim().slice(0, 2000), tags: Array.isArray(body.tags) ? body.tags.map((tag) => safeMediaSlug(String(tag), "")).filter(Boolean).slice(0, 30) : String(body.tags || "").split(",").map((tag) => safeMediaSlug(tag, "")).filter(Boolean).slice(0, 30), requestedStatus, replaceMediaId, assignment } });
    await recordMediaStorageEvent({ eventType: "UPLOAD_REQUESTED", uploadSessionId: session.id, bucket: validated.bucket, key, adminId: admin.id, metadata: { mediaClass: validated.mediaClass, size: validated.size } });
    await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_media_direct_upload_requested", ipAddress, userAgent, metadata: { uploadSessionId: session.id, mediaClass: validated.mediaClass, bucket: validated.bucket, size: validated.size } });
    return NextResponse.json({ ok: true, upload: { sessionId: session.id, provider: authorization.provider, bucket: authorization.bucket, key: authorization.key, uploadUrl: authorization.uploadUrl, token: authorization.token, expiresAt: authorization.expiresAt, headers: authorization.headers }, message: "Upload authorized. Upload the file directly, then complete the session." });
  } catch (error) {
    return NextResponse.json({ ok: false, code: "UPLOAD_AUTHORIZATION_FAILED", error: error instanceof Error ? error.message : "Upload authorization failed." }, { status: 400 });
  }
}

export async function HEAD() {
  return new NextResponse(null, { status: getObjectStorageProvider().kind === "LOCAL" ? 503 : 200, headers: { "cache-control": "no-store" } });
}

export async function DELETE(request: NextRequest) {
  const admin = await authorize(request);
  if (!admin) return NextResponse.json({ ok: false, code: "ADMIN_REQUIRED" }, { status: 401 });
  const sessionId = request.nextUrl.searchParams.get("sessionId") || "";
  const session = await findMediaUploadSession(sessionId, admin.id);
  if (!session) return NextResponse.json({ ok: false, code: "UPLOAD_SESSION_NOT_FOUND" }, { status: 404 });
  const deleted = await getObjectStorageProvider().delete(session.storage_path, session.storage_bucket).catch(() => false);
  await updateMediaUploadSession(session.id, { status: "DELETED", completed_at: new Date().toISOString(), last_error: "Canceled by administrator." }).catch(() => undefined);
  await recordMediaStorageEvent({ eventType: "UPLOAD_FAILED", uploadSessionId: session.id, bucket: session.storage_bucket, key: session.storage_path, adminId: admin.id, metadata: { reason: "admin_canceled" } });
  return NextResponse.json({ ok: deleted });
}
