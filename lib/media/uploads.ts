import { randomUUID } from "node:crypto";
import { getObjectStorageProvider } from "@/lib/infrastructure/storage";
import { mediaCredentials, mediaHeaders } from "@/lib/media/server";
import type { MediaUploadClass } from "@/lib/media/storage";

export type MediaUploadSession = {
  id: string;
  storage_bucket: string;
  storage_path: string;
  media_class: MediaUploadClass;
  original_filename: string;
  mime_type: string;
  file_size: number;
  category_id: string | null;
  folder_id: string | null;
  requested_by: string;
  media_asset_id: string | null;
  status: "UPLOADING" | "UPLOADED" | "PROCESSING" | "READY" | "FAILED" | "QUARANTINED" | "DELETED";
  expires_at: string;
  uploaded_at: string | null;
  completed_at: string | null;
  last_error: string | null;
  metadata: Record<string, unknown>;
};

function sessionRow(row: Record<string, unknown>): MediaUploadSession {
  return {
    id: String(row.id), storage_bucket: String(row.storage_bucket), storage_path: String(row.storage_path), media_class: String(row.media_class) as MediaUploadClass,
    original_filename: String(row.original_filename), mime_type: String(row.mime_type), file_size: Number(row.file_size), category_id: row.category_id ? String(row.category_id) : null,
    folder_id: row.folder_id ? String(row.folder_id) : null, requested_by: String(row.requested_by), media_asset_id: row.media_asset_id ? String(row.media_asset_id) : null,
    status: String(row.status) as MediaUploadSession["status"], expires_at: String(row.expires_at), uploaded_at: row.uploaded_at ? String(row.uploaded_at) : null,
    completed_at: row.completed_at ? String(row.completed_at) : null, last_error: row.last_error ? String(row.last_error) : null, metadata: row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {}
  };
}

export async function createMediaUploadSession(input: { bucket: string; key: string; mediaClass: MediaUploadClass; filename: string; mimeType: string; size: number; categoryId?: string | null; folderId?: string | null; adminId: string; metadata?: Record<string, unknown>; expiresAt: string }) {
  const service = mediaCredentials();
  if (!service) throw new Error("Supabase service credentials are required for upload registration.");
  const id = randomUUID();
  const response = await fetch(`${service.url}/rest/v1/media_upload_sessions`, { method: "POST", headers: mediaHeaders(service, { prefer: "return=representation" }), body: JSON.stringify({ id, storage_bucket: input.bucket, storage_path: input.key, media_class: input.mediaClass, original_filename: input.filename, mime_type: input.mimeType, file_size: input.size, category_id: input.categoryId || null, folder_id: input.folderId || null, requested_by: input.adminId, metadata: input.metadata || {}, expires_at: input.expiresAt }) });
  if (!response.ok) throw new Error("Upload authorization could not be registered.");
  const [row] = await response.json() as Array<Record<string, unknown>>;
  return sessionRow(row || { id, storage_bucket: input.bucket, storage_path: input.key, media_class: input.mediaClass, original_filename: input.filename, mime_type: input.mimeType, file_size: input.size, requested_by: input.adminId, status: "UPLOADING", expires_at: input.expiresAt });
}

export async function findMediaUploadSession(id: string, adminId: string) {
  const service = mediaCredentials();
  if (!service) return null;
  const response = await fetch(`${service.url}/rest/v1/media_upload_sessions?id=eq.${encodeURIComponent(id)}&requested_by=eq.${encodeURIComponent(adminId)}&select=*&limit=1`, { cache: "no-store", headers: mediaHeaders(service) }).catch(() => null);
  if (!response?.ok) return null;
  const [row] = await response.json() as Array<Record<string, unknown>>;
  return row ? sessionRow(row) : null;
}

export async function findMediaProcessingSession(id: string) {
  const service = mediaCredentials();
  if (!service) return null;
  const response = await fetch(`${service.url}/rest/v1/media_upload_sessions?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, { cache: "no-store", headers: mediaHeaders(service) }).catch(() => null);
  if (!response?.ok) return null;
  const [row] = await response.json() as Array<Record<string, unknown>>;
  return row ? sessionRow(row) : null;
}

export async function updateMediaUploadSession(id: string, patch: Record<string, unknown>) {
  const service = mediaCredentials();
  if (!service) throw new Error("Supabase service credentials are required.");
  const response = await fetch(`${service.url}/rest/v1/media_upload_sessions?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: mediaHeaders(service, { prefer: "return=minimal" }), body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
  if (!response.ok) throw new Error("Upload session could not be updated.");
}

export async function queueMediaProcessing(session: MediaUploadSession) {
  const service = mediaCredentials();
  if (!service) throw new Error("Supabase service credentials are required.");
  const jobType = session.media_class === "IMAGE" ? "IMAGE_PROCESSING" : session.media_class === "AUDIO" ? "AUDIO_PROCESSING" : "VIDEO_PROCESSING";
  const response = await fetch(`${service.url}/rest/v1/media_processing_jobs?on_conflict=upload_session_id`, { method: "POST", headers: mediaHeaders(service, { prefer: "resolution=ignore-duplicates,return=representation" }), body: JSON.stringify({ upload_session_id: session.id, job_type: jobType, status: "QUEUED", next_attempt_at: new Date().toISOString() }) });
  if (!response.ok && response.status !== 409) throw new Error("Media processing job could not be queued.");
  const rows = response.ok ? await response.json() as Array<Record<string, unknown>> : [];
  return rows[0] ? String(rows[0].id) : null;
}

export async function recordMediaStorageEvent(input: { eventType: string; mediaId?: string | null; uploadSessionId?: string | null; bucket?: string | null; key?: string | null; adminId?: string | null; userId?: string | null; metadata?: Record<string, unknown> }) {
  const service = mediaCredentials();
  if (!service) return false;
  const response = await fetch(`${service.url}/rest/v1/media_storage_events`, { method: "POST", headers: mediaHeaders(service, { prefer: "return=minimal" }), body: JSON.stringify({ event_type: input.eventType, media_id: input.mediaId || null, upload_session_id: input.uploadSessionId || null, storage_bucket: input.bucket || null, storage_path: input.key || null, actor_admin_id: input.adminId || null, user_id: input.userId || null, metadata: input.metadata || {} }) }).catch(() => null);
  return Boolean(response?.ok);
}

export async function cleanupExpiredMediaUploads(now = new Date()) {
  const service = mediaCredentials();
  if (!service) return { configured: false, removed: 0, retained: 0 };
  const response = await fetch(`${service.url}/rest/v1/media_upload_sessions?status=in.(UPLOADING,UPLOADED,PROCESSING)&expires_at=lt.${encodeURIComponent(now.toISOString())}&select=*`, { cache: "no-store", headers: mediaHeaders(service) }).catch(() => null);
  if (!response?.ok) return { configured: true, removed: 0, retained: 0 };
  const rows = await response.json() as Array<Record<string, unknown>>;
  let removed = 0; let retained = 0;
  for (const raw of rows) {
    const session = sessionRow(raw);
    if (session.media_asset_id) { retained += 1; continue; }
    const deleted = await getObjectStorageProvider().delete(session.storage_path, session.storage_bucket).catch(() => false);
    if (!deleted) { retained += 1; continue; }
    await updateMediaUploadSession(session.id, { status: "DELETED", completed_at: now.toISOString(), last_error: "Expired upload cleaned up." }).catch(() => undefined);
    await recordMediaStorageEvent({ eventType: "CLEANUP_RUN", uploadSessionId: session.id, bucket: session.storage_bucket, key: session.storage_path, metadata: { reason: "expired_unreferenced_upload" } });
    removed += 1;
  }
  return { configured: true, removed, retained };
}
