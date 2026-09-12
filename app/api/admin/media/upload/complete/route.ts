import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession } from "@/lib/admin-auth";
import { getObjectStorageProvider } from "@/lib/infrastructure/storage";
import { recordMediaStorageEvent, findMediaUploadSession, queueMediaProcessing, updateMediaUploadSession } from "@/lib/media/uploads";
import { findMediaAsset, mediaCredentials, mediaHeaders } from "@/lib/media/server";
import { validateMediaImage } from "@/lib/media/image-validation";
import { publicMediaBucket } from "@/lib/media/storage";
import { BasicUploadSecurityProvider } from "@/lib/infrastructure/security-edge";
import { extractClientIp } from "@/lib/security";
import { assignPendingMediaAsset, activateMediaAssignment, normalizeMediaAssignment } from "@/lib/media/assignments";

export const runtime = "nodejs";

async function authorize(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  return admin?.role === "ADMIN" && admin.two_factor_required ? admin : null;
}

async function registerDigitalAsset(session: Awaited<ReturnType<typeof findMediaUploadSession>>, adminId: string, service: NonNullable<ReturnType<typeof mediaCredentials>>) {
  if (!session) throw new Error("Upload session is missing.");
  const mediaId = session.media_asset_id || randomUUID();
  const publicUrl = `/api/media/${mediaId}/file`;
  const record = { id: mediaId, display_name: String(session.metadata.displayName || session.original_filename.replace(/\.[^.]+$/, "")).slice(0, 140), original_filename: session.original_filename, storage_bucket: session.storage_bucket, storage_path: session.storage_path, public_url: publicUrl, thumbnail_url: publicUrl, mime_type: session.mime_type, extension: session.original_filename.split(".").pop()?.toLowerCase() || "bin", width: 1, height: 1, aspect_ratio: 1, file_size: session.file_size, content_hash: "UNVERIFIED", category_id: session.category_id || "other", folder_id: session.folder_id, alt_text: String(session.metadata.altText || "").slice(0, 500), description: String(session.metadata.description || "").slice(0, 2000), tags: Array.isArray(session.metadata.tags) ? session.metadata.tags.map(String).slice(0, 30) : [], status: "private", is_animated: false, is_public: false, game_metadata: {}, watermark_settings: { enabled: false }, uploaded_by: adminId, media_class: session.media_class, processing_status: "SECURITY_SCAN_PENDING", processing_metadata: { assignment: session.metadata.assignment || null }, source_storage_bucket: session.storage_bucket, source_storage_path: session.storage_path, updated_at: new Date().toISOString() };
  const response = await fetch(`${service.url}/rest/v1/media_assets`, { method: "POST", headers: mediaHeaders(service, { prefer: "return=minimal,resolution=ignore-duplicates" }), body: JSON.stringify(record) });
  if (!response.ok && response.status !== 409) throw new Error("The uploaded media was verified, but its library record could not be saved.");
  const assignment = normalizeMediaAssignment(session.metadata.assignment);
  if (assignment) await assignPendingMediaAsset(assignment, mediaId);
  return { mediaId, assignment };
}

export async function POST(request: NextRequest) {
  const admin = await authorize(request); const ipAddress = extractClientIp(request.headers); const userAgent = request.headers.get("user-agent") || "unknown";
  if (!admin) return NextResponse.json({ ok: false, code: "ADMIN_REQUIRED", error: "Authenticated ADMIN account with 2FA is required." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { sessionId?: unknown };
  const sessionId = String(body.sessionId || "");
  const session = await findMediaUploadSession(sessionId, admin.id);
  if (!session) return NextResponse.json({ ok: false, code: "UPLOAD_SESSION_NOT_FOUND", error: "The upload session was not found." }, { status: 404 });
  if (session.media_asset_id || ["READY", "QUARANTINED"].includes(session.status)) return NextResponse.json({ ok: true, status: session.status, mediaId: session.media_asset_id });
  if (session.status === "DELETED" || new Date(session.expires_at).getTime() <= Date.now()) return NextResponse.json({ ok: false, code: "UPLOAD_SESSION_EXPIRED", error: "The upload authorization has expired. Start the upload again." }, { status: 410 });
  const provider = getObjectStorageProvider();
  const metadata = await provider.getMetadata(session.storage_path, session.storage_bucket);
  if (!metadata || metadata.size !== session.file_size || metadata.mimeType.toLowerCase() !== session.mime_type.toLowerCase()) return NextResponse.json({ ok: false, code: "UPLOAD_NOT_VERIFIED", error: "The uploaded object could not be verified. Retry the upload." }, { status: 409 });
  const service = mediaCredentials();
  if (!service) return NextResponse.json({ ok: false, code: "DATABASE_NOT_CONFIGURED", error: "Upload registration is not configured." }, { status: 503 });
  try {
    if (session.media_class !== "IMAGE") {
      const registered = await registerDigitalAsset(session, admin.id, service);
      const processingSession = { ...session, media_asset_id: registered.mediaId };
      await updateMediaUploadSession(session.id, { status: "PROCESSING", media_asset_id: registered.mediaId, uploaded_at: new Date().toISOString() });
      const processingJobId = await queueMediaProcessing(processingSession);
      await recordMediaStorageEvent({ eventType: "UPLOAD_COMPLETED", uploadSessionId: session.id, bucket: session.storage_bucket, key: session.storage_path, adminId: admin.id, metadata: { mediaClass: session.media_class, processingJobId } });
      await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_media_direct_upload_completed", ipAddress, userAgent, metadata: { uploadSessionId: session.id, mediaClass: session.media_class, processingJobId } });
      return NextResponse.json({ ok: true, status: "PROCESSING", mediaId: registered.mediaId, processingJobId, message: "Upload verified and queued for media processing." });
    }

    const bytes = await provider.download(session.storage_path, session.storage_bucket);
    if (!bytes || bytes.byteLength !== session.file_size) return NextResponse.json({ ok: false, code: "UPLOAD_NOT_READABLE", error: "The uploaded image could not be read from storage." }, { status: 409 });
    const imageBytes = new Uint8Array(bytes);
    const validated = await validateMediaImage(new File([imageBytes.buffer as ArrayBuffer], session.original_filename, { type: session.mime_type }));
    const security = await new BasicUploadSecurityProvider().inspect({ filename: session.original_filename, mimeType: validated.mimeType, size: validated.fileSize, bytes: validated.bytes });
    const requestedStatus = String(session.metadata.requestedStatus || "draft");
    const finalStatus = security.status === "REJECTED" ? "archived" : security.status === "SAFE" && requestedStatus === "published" && session.storage_bucket === publicMediaBucket() ? "published" : requestedStatus === "private" ? "private" : "draft";
    const mediaId = session.media_asset_id || String(session.metadata.replaceMediaId || randomUUID());
    const mediaRoute = `/api/media/${mediaId}/file`;
    const publicUrl = finalStatus === "published" ? provider.publicUrl?.(session.storage_path, session.storage_bucket) || mediaRoute : mediaRoute;
    const record = { id: mediaId, display_name: String(session.metadata.displayName || session.original_filename.replace(/\.[^.]+$/, "")).slice(0, 140), original_filename: session.original_filename, storage_bucket: session.storage_bucket, storage_path: session.storage_path, public_url: publicUrl, thumbnail_url: publicUrl, mime_type: validated.mimeType, extension: validated.extension, width: validated.width, height: validated.height, aspect_ratio: validated.width / validated.height, file_size: validated.fileSize, content_hash: validated.contentHash, category_id: session.category_id || "other", folder_id: session.folder_id, alt_text: String(session.metadata.altText || "").slice(0, 500), description: String(session.metadata.description || "").slice(0, 2000), tags: Array.isArray(session.metadata.tags) ? session.metadata.tags.map(String).slice(0, 30) : [], status: finalStatus, is_animated: validated.animated, is_public: finalStatus === "published", game_metadata: {}, watermark_settings: { enabled: false }, uploaded_by: admin.id, media_class: "IMAGE", processing_status: security.status === "QUARANTINED" ? "QUARANTINED" : "READY", processing_metadata: {}, updated_at: new Date().toISOString() };
    const previous = session.metadata.replaceMediaId ? await findMediaAsset(String(session.metadata.replaceMediaId)) : null;
    const save = await fetch(`${service.url}/rest/v1/media_assets${previous ? `?id=eq.${encodeURIComponent(mediaId)}` : ""}`, { method: previous ? "PATCH" : "POST", headers: mediaHeaders(service, { prefer: "return=minimal" }), body: JSON.stringify(record) });
    if (!save.ok) throw new Error("The uploaded image was verified, but its library record could not be saved.");
    const widths = [["thumbnail", 320], ["small", 640], ["medium", 1280], ["large", 1920], ["original", validated.width]] as const;
    const variants = widths.filter(([, width]) => width <= validated.width || width === validated.width).map(([name, width]) => ({ media_id: mediaId, storage_bucket: session.storage_bucket, variant_name: name, storage_path: session.storage_path, public_url: publicUrl, width: Math.min(width, validated.width), height: Math.round(validated.height * Math.min(width, validated.width) / validated.width), file_size: name === "original" ? validated.fileSize : null, format: name === "original" ? validated.extension : "proxy" }));
    if (previous) await fetch(`${service.url}/rest/v1/media_variants?media_id=eq.${encodeURIComponent(mediaId)}`, { method: "DELETE", headers: mediaHeaders(service) });
    const variantResponse = await fetch(`${service.url}/rest/v1/media_variants`, { method: "POST", headers: mediaHeaders(service, { prefer: "return=minimal" }), body: JSON.stringify(variants) });
    if (!variantResponse.ok) throw new Error("Image variants could not be registered.");
    const processingJobId = await queueMediaProcessing({ ...session, media_asset_id: mediaId });
    const assignment = normalizeMediaAssignment(session.metadata.assignment);
    if (assignment) {
      await assignPendingMediaAsset(assignment, mediaId);
      if (security.status === "SAFE") await activateMediaAssignment(assignment, mediaId, { ...record, public_url: record.public_url });
    }
    const sessionStatus = security.status === "QUARANTINED" ? "QUARANTINED" : "READY";
    await updateMediaUploadSession(session.id, { status: sessionStatus, media_asset_id: mediaId, uploaded_at: new Date().toISOString(), completed_at: new Date().toISOString(), last_error: security.status === "QUARANTINED" ? security.reason : null });
    await recordMediaStorageEvent({ eventType: security.status === "QUARANTINED" ? "UPLOAD_FAILED" : "UPLOAD_COMPLETED", mediaId, uploadSessionId: session.id, bucket: session.storage_bucket, key: session.storage_path, adminId: admin.id, metadata: { securityStatus: security.status, processingJobId } });
    await auditAdminEvent({ adminUserId: admin.id, eventType: security.status === "QUARANTINED" ? "admin_media_direct_upload_quarantined" : "admin_media_direct_upload_completed", ipAddress, userAgent, metadata: { mediaId, uploadSessionId: session.id, processingJobId, securityStatus: security.status } });
    return NextResponse.json({ ok: true, status: sessionStatus, mediaId, processingJobId, publicUrl: record.public_url, message: security.status === "QUARANTINED" ? "Image uploaded but quarantined until malware scanning is configured or passes." : "Image uploaded and added to the Media Library." });
  } catch (error) {
    await updateMediaUploadSession(session.id, { status: "FAILED", last_error: error instanceof Error ? error.message : "Upload completion failed." }).catch(() => undefined);
    await recordMediaStorageEvent({ eventType: "UPLOAD_FAILED", uploadSessionId: session.id, bucket: session.storage_bucket, key: session.storage_path, adminId: admin.id, metadata: { reason: "completion_failed" } });
    return NextResponse.json({ ok: false, code: "UPLOAD_COMPLETION_FAILED", error: error instanceof Error ? error.message : "Upload completion failed." }, { status: 400 });
  }
}
