import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession } from "@/lib/admin-auth";
import { validateMediaImage } from "@/lib/media/image-validation";
import { fetchMediaLibrary, findMediaAsset, mediaCredentials, mediaHeaders, safeMediaSlug, safeStoragePath } from "@/lib/media/server";
import { MEDIA_STATUSES } from "@/lib/media/types";
import { extractClientIp } from "@/lib/security";
import { getObjectStorageProvider, storageAvailableForProduction, storageBuckets } from "@/lib/infrastructure/storage";

export const runtime = "nodejs";
const requestLimits = new Map<string, { count: number; resetAt: number }>();

async function authorize(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  return admin?.role === "ADMIN" && admin.two_factor_required ? admin : null;
}

function limited(key: string, maximum = 40) {
  const now = Date.now(); const current = requestLimits.get(key);
  if (!current || current.resetAt < now) { requestLimits.set(key, { count: 1, resetAt: now + 60_000 }); return false; }
  current.count += 1; return current.count > maximum;
}

function cleanTags(value: FormDataEntryValue | null) {
  return String(value || "").split(",").map((tag) => safeMediaSlug(tag, "")).filter(Boolean).slice(0, 30);
}

function cleanGameMetadata(value: FormDataEntryValue | null) {
  if (!value) return {};
  try { const input = JSON.parse(String(value)) as Record<string, unknown>; return { game: safeMediaSlug(String(input.game || ""), ""), entityType: safeMediaSlug(String(input.entityType || ""), ""), skin: safeMediaSlug(String(input.skin || "default"), "default"), animationState: safeMediaSlug(String(input.animationState || "idle"), "idle"), frameOrder: Math.max(0, Math.min(10000, Math.floor(Number(input.frameOrder) || 0))), scale: Math.max(0.01, Math.min(20, Number(input.scale) || 1)), collisionProfile: safeMediaSlug(String(input.collisionProfile || "default"), "default") }; } catch { throw new Error("Game asset metadata is invalid."); }
}

async function mediaLog(adminId: string, action: string, mediaId: string | null, previousValues: unknown, newValues: unknown) {
  const service = mediaCredentials(); if (!service) return;
  await fetch(`${service.url}/rest/v1/media_action_logs`, { method: "POST", headers: mediaHeaders(service, { prefer: "return=minimal" }), body: JSON.stringify({ admin_user_id: adminId, action, media_id: mediaId, previous_values: previousValues || {}, new_values: newValues || {} }) }).catch(() => undefined);
}

export async function GET(request: NextRequest) {
  const admin = await authorize(request);
  if (!admin) return NextResponse.json({ ok: false, error: "Authenticated ADMIN account with 2FA is required." }, { status: 401 });
  const library = await fetchMediaLibrary();
  return NextResponse.json({ ok: true, ...library });
}

export async function POST(request: NextRequest) {
  const admin = await authorize(request); const ipAddress = extractClientIp(request.headers); const userAgent = request.headers.get("user-agent") || "unknown";
  if (!admin) return NextResponse.json({ ok: false, error: "Authenticated ADMIN account with 2FA is required." }, { status: 401 });
  if (!storageAvailableForProduction()) return NextResponse.json({ ok: false, code: "STORAGE_NOT_CONFIGURED", error: "An approved production storage provider is required for media uploads." }, { status: 503 });
  if (limited(`${admin.id}:${ipAddress}`)) return NextResponse.json({ ok: false, error: "Too many media operations. Wait one minute and retry." }, { status: 429 });
  const service = mediaCredentials();
  if (!service) return NextResponse.json({ ok: false, error: "Supabase service credentials are required for media uploads." }, { status: 503 });
  const form = await request.formData(); const file = form.get("image");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Choose an image to upload." }, { status: 400 });
  try {
    const validated = await validateMediaImage(file);
    const replaceMediaId = String(form.get("replaceMediaId") || ""); const replaced = replaceMediaId ? await findMediaAsset(replaceMediaId) : null;
    if (replaceMediaId && !replaced) return NextResponse.json({ ok: false, error: "The image selected for replacement no longer exists." }, { status: 404 });
    const duplicateResponse = await fetch(`${service.url}/rest/v1/media_assets?content_hash=eq.${validated.contentHash}&status=neq.archived&select=id,display_name,public_url,thumbnail_url&limit=1`, { headers: mediaHeaders(service) });
    const duplicates = duplicateResponse.ok ? await duplicateResponse.json() : [];
    if (duplicates.some((item: { id: string }) => item.id !== replaceMediaId) && form.get("allowDuplicate") !== "true") return NextResponse.json({ ok: false, code: "DUPLICATE", error: "This image already exists in the library.", existing: duplicates.find((item: { id: string }) => item.id !== replaceMediaId) }, { status: 409 });
    const categoryId = safeMediaSlug(String(form.get("categoryId") || replaced?.category_id || "other"), "other");
    const mediaId = replaceMediaId || randomUUID(); const storagePath = safeStoragePath(categoryId, validated.extension);
    const requestedStatus = String(form.get("status") || replaced?.status || "draft"); const status = MEDIA_STATUSES.includes(requestedStatus as typeof MEDIA_STATUSES[number]) ? requestedStatus : "draft";
    const storageBucket = status === "published" ? storageBuckets().publicMedia : storageBuckets().privateMedia;
    const object = await getObjectStorageProvider().upload({ bucket: storageBucket, key: storagePath, body: validated.bytes, originalFilename: file.name, mimeType: validated.mimeType, visibility: status === "published" ? "PUBLIC" : "PRIVATE", ownerId: admin.id, reference: `media_asset:${mediaId}` }).catch(() => null);
    if (!object) throw new Error("Image storage failed. Configure an approved storage provider and confirm the private media bucket exists.");
    const publicUrl = status === "published" ? getObjectStorageProvider().publicUrl?.(storagePath, storageBucket) || `/api/media/${mediaId}/file` : `/api/media/${mediaId}/file`; const thumbnailUrl = publicUrl;
    const record = {
      id: mediaId, display_name: String(form.get("displayName") || replaced?.display_name || file.name.replace(/\.[^.]+$/, "")).trim().slice(0, 140), original_filename: file.name.slice(0, 220), storage_bucket: storageBucket, storage_path: storagePath,
      public_url: publicUrl, thumbnail_url: thumbnailUrl, mime_type: validated.mimeType, extension: validated.extension, width: validated.width, height: validated.height,
      aspect_ratio: validated.width / validated.height, file_size: validated.fileSize, content_hash: validated.contentHash, category_id: categoryId,
      folder_id: form.get("folderId") || replaced?.folder_id || null, alt_text: String(form.get("altText") || replaced?.alt_text || "").trim().slice(0, 500), description: String(form.get("description") || replaced?.description || "").trim().slice(0, 2000),
      tags: form.has("tags") ? cleanTags(form.get("tags")) : replaced?.tags || [], status, is_animated: validated.animated, is_public: status === "published", game_metadata: form.get("gameMetadata") ? cleanGameMetadata(form.get("gameMetadata")) : replaced?.game_metadata || {}, watermark_settings: replaced?.watermark_settings || { enabled: false }, uploaded_by: admin.id, updated_at: new Date().toISOString()
    };
    const save = await fetch(`${service.url}/rest/v1/media_assets${replaced ? `?id=eq.${mediaId}` : ""}`, { method: replaced ? "PATCH" : "POST", headers: mediaHeaders(service, { prefer: "return=minimal" }), body: JSON.stringify(record) });
    if (!save.ok) { await getObjectStorageProvider().delete(storagePath, storageBucket).catch(() => false); throw new Error("The image uploaded, but its library record could not be saved."); }
    const widths = [["thumbnail", 320], ["small", 640], ["medium", 1280], ["large", 1920], ["original", validated.width]] as const;
    const variants = widths.filter(([, width]) => width <= validated.width || width === validated.width).map(([name, width]) => ({ media_id: mediaId, storage_bucket: storageBucket, variant_name: name, storage_path: storagePath, public_url: name === "original" ? publicUrl : `/_next/image?url=${encodeURIComponent(publicUrl)}&w=${width}&q=82`, width: Math.min(width, validated.width), height: Math.round(validated.height * Math.min(width, validated.width) / validated.width), file_size: name === "original" ? validated.fileSize : null, format: name === "original" ? validated.extension : "auto" }));
    if (replaced) await fetch(`${service.url}/rest/v1/media_variants?media_id=eq.${mediaId}`, { method: "DELETE", headers: mediaHeaders(service) });
    await fetch(`${service.url}/rest/v1/media_variants`, { method: "POST", headers: mediaHeaders(service, { prefer: "return=minimal" }), body: JSON.stringify(variants) });
    // Replaced objects remain available for historical references; cleanup removes only unreferenced objects.
    await mediaLog(admin.id, replaced ? "image_replaced" : "image_uploaded", mediaId, replaced || {}, { displayName: record.display_name, categoryId, status, width: validated.width, height: validated.height, fileSize: validated.fileSize });
    await auditAdminEvent({ adminUserId: admin.id, eventType: replaced ? "admin_media_replaced" : "admin_media_uploaded", ipAddress, userAgent, metadata: { mediaId, categoryId, mimeType: validated.mimeType, fileSize: validated.fileSize } });
    return NextResponse.json({ ok: true, mediaId, publicUrl, thumbnailUrl, message: `${record.display_name} ${replaced ? "replaced" : "uploaded"} successfully.` });
  } catch (error) {
    await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_media_upload_failed", ipAddress, userAgent, metadata: { fileName: file.name.slice(0, 120), reason: error instanceof Error ? error.message : "unknown" } });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Image upload failed." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const admin = await authorize(request); const ipAddress = extractClientIp(request.headers); const userAgent = request.headers.get("user-agent") || "unknown";
  if (!admin) return NextResponse.json({ ok: false, error: "Authenticated ADMIN account with 2FA is required." }, { status: 401 });
  if (limited(`${admin.id}:${ipAddress}`)) return NextResponse.json({ ok: false, error: "Too many media operations." }, { status: 429 });
  const service = mediaCredentials(); if (!service) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { ids?: unknown[]; id?: unknown; patch?: Record<string, unknown>; action?: string }; const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 100) : [String(body.id || "")];
  if (!ids.length || ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) return NextResponse.json({ ok: false, error: "Choose valid library images." }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const input = body.patch || {};
  if (typeof input.displayName === "string") patch.display_name = input.displayName.trim().slice(0, 140);
  if (typeof input.originalFilename === "string") patch.original_filename = input.originalFilename.replace(/[\\/\u0000-\u001f]/g, "-").trim().slice(0, 220);
  if (typeof input.altText === "string") patch.alt_text = input.altText.trim().slice(0, 500);
  if (typeof input.description === "string") patch.description = input.description.trim().slice(0, 2000);
  if (Array.isArray(input.tags)) patch.tags = input.tags.map((tag: unknown) => safeMediaSlug(String(tag), "")).filter(Boolean).slice(0, 30);
  if (typeof input.categoryId === "string") patch.category_id = safeMediaSlug(input.categoryId, "other");
  if (typeof input.folderId === "string" || input.folderId === null) patch.folder_id = input.folderId || null;
  if (input.status === "published") return NextResponse.json({ ok: false, code: "PUBLICATION_REQUIRED", error: "Use the protected publication action so storage and public visibility are verified together." }, { status: 409 });
  if (typeof input.status === "string" && MEDIA_STATUSES.includes(input.status as typeof MEDIA_STATUSES[number])) { patch.status = input.status; patch.is_public = false; patch.archived_at = input.status === "archived" ? new Date().toISOString() : null; }
  if (typeof input.cropPreference === "string" && ["original", "16:9", "4:3", "1:1", "9:16"].includes(input.cropPreference)) patch.crop_preference = input.cropPreference;
  if (typeof input.focalPointX === "number" && Number.isFinite(input.focalPointX)) patch.focal_point_x = Math.min(1, Math.max(0, input.focalPointX));
  if (typeof input.focalPointY === "number" && Number.isFinite(input.focalPointY)) patch.focal_point_y = Math.min(1, Math.max(0, input.focalPointY));
  const before = await Promise.all(ids.map((id) => findMediaAsset(id)));
  const response = await fetch(`${service.url}/rest/v1/media_assets?id=in.(${ids.join(",")})`, { method: "PATCH", headers: mediaHeaders(service, { prefer: "return=minimal" }), body: JSON.stringify(patch) });
  if (!response.ok) return NextResponse.json({ ok: false, error: "Unable to update the selected images." }, { status: 400 });
  await Promise.all(ids.map((id, index) => mediaLog(admin.id, body.action || "image_updated", id, before[index], patch)));
  await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_media_updated", ipAddress, userAgent, metadata: { ids, fields: Object.keys(patch), action: body.action || "update" } });
  return NextResponse.json({ ok: true, updated: ids.length });
}

export async function DELETE(request: NextRequest) {
  const admin = await authorize(request); const ipAddress = extractClientIp(request.headers); const userAgent = request.headers.get("user-agent") || "unknown";
  if (!admin) return NextResponse.json({ ok: false, error: "Authenticated ADMIN account with 2FA is required." }, { status: 401 });
  const service = mediaCredentials(); if (!service) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  const id = request.nextUrl.searchParams.get("id") || ""; const force = request.nextUrl.searchParams.get("force") === "true";
  const asset = await findMediaAsset(id); if (!asset) return NextResponse.json({ ok: false, error: "Image not found." }, { status: 404 });
  const usageResponse = await fetch(`${service.url}/rest/v1/media_usage?media_id=eq.${encodeURIComponent(id)}&select=id`, { headers: mediaHeaders(service) }); const usages = usageResponse.ok ? await usageResponse.json() : [];
  if (usages.length && !force) return NextResponse.json({ ok: false, code: "IN_USE", error: `This image is currently used in ${usages.length} location${usages.length === 1 ? "" : "s"}.`, usageCount: usages.length }, { status: 409 });
  await fetch(`${service.url}/rest/v1/media_usage?media_id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: mediaHeaders(service) });
  const remove = await fetch(`${service.url}/rest/v1/media_assets?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: mediaHeaders(service) });
  if (!remove.ok) return NextResponse.json({ ok: false, error: "The image record could not be deleted." }, { status: 400 });
  await getObjectStorageProvider().delete(String(asset.storage_path), String(asset.storage_bucket || storageBuckets().privateMedia)).catch(() => false);
  await mediaLog(admin.id, "image_deleted", null, asset, { forced: force });
  await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_media_deleted", ipAddress, userAgent, metadata: { mediaId: id, forced: force, priorUsageCount: usages.length } });
  return NextResponse.json({ ok: true });
}
