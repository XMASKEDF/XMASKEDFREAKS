import { randomUUID } from "crypto";
import type { MediaAsset, MediaCategory, MediaFolder, MediaStatus, MediaUsage, MediaVariant } from "@/lib/media/types";

export function mediaCredentials() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

export function mediaHeaders(service: { key: string }, extra: Record<string, string> = {}) {
  return { apikey: service.key, authorization: `Bearer ${service.key}`, "content-type": "application/json", ...extra };
}

export function safeMediaSlug(value: string, fallback = "media") {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || fallback;
}

export function safeStoragePath(categorySlug: string, extension: string) {
  const now = new Date();
  return `${safeMediaSlug(categorySlug)}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${Date.now()}-${randomUUID()}.${extension}`;
}

function categoryFromRow(row: Record<string, unknown>): MediaCategory {
  return { id: String(row.id), name: String(row.name), slug: String(row.slug), description: String(row.description || ""), icon: String(row.icon || "○"), enabled: Boolean(row.enabled), archived: Boolean(row.archived), displayOrder: Number(row.display_order || 0), imageCount: Number(row.image_count || 0), createdAt: String(row.created_at || "") };
}

function folderFromRow(row: Record<string, unknown>): MediaFolder {
  return { id: String(row.id), name: String(row.name), slug: String(row.slug), parentId: row.parent_id ? String(row.parent_id) : null, path: String(row.path), archived: Boolean(row.archived), imageCount: Number(row.image_count || 0), createdAt: String(row.created_at || "") };
}

function variantFromRow(row: Record<string, unknown>): MediaVariant {
  return { id: String(row.id), mediaId: String(row.media_id), storageBucket: String(row.storage_bucket || "media"), name: String(row.variant_name) as MediaVariant["name"], url: String(row.public_url), width: Number(row.width), height: Number(row.height), format: String(row.format), fileSize: row.file_size == null ? null : Number(row.file_size) };
}

function usageFromRow(row: Record<string, unknown>): MediaUsage {
  return { id: String(row.id), mediaId: String(row.media_id), usageType: String(row.usage_type), resourceId: row.resource_id ? String(row.resource_id) : null, route: row.route ? String(row.route) : null, fieldName: row.field_name ? String(row.field_name) : null, createdAt: String(row.created_at) };
}

function assetFromRow(row: Record<string, unknown>, usages: MediaUsage[], variants: MediaVariant[]): MediaAsset {
  const assetUsages = usages.filter((item) => item.mediaId === row.id);
  return {
    id: String(row.id), displayName: String(row.display_name), originalFilename: String(row.original_filename), storageBucket: String(row.storage_bucket || "media"), storagePath: String(row.storage_path), publicUrl: String(row.public_url), thumbnailUrl: String(row.thumbnail_url || "").startsWith("/_next/image?") ? String(row.public_url) : String(row.thumbnail_url || row.public_url), mimeType: String(row.mime_type), extension: String(row.extension), width: Number(row.width), height: Number(row.height), aspectRatio: Number(row.aspect_ratio), fileSize: Number(row.file_size), categoryId: row.category_id ? String(row.category_id) : null, folderId: row.folder_id ? String(row.folder_id) : null, categoryName: String(row.category_name || ""), folderName: String(row.folder_name || ""), altText: String(row.alt_text || ""), description: String(row.description || ""), tags: Array.isArray(row.tags) ? row.tags.map(String) : [], status: String(row.status) as MediaStatus, focalPointX: Number(row.focal_point_x ?? 0.5), focalPointY: Number(row.focal_point_y ?? 0.5), cropPreference: String(row.crop_preference || "original"), animated: Boolean(row.is_animated), public: Boolean(row.is_public), contentHash: String(row.content_hash), uploadedBy: row.uploaded_by ? String(row.uploaded_by) : null, uploadedByName: String(row.uploaded_by_name || ""), createdAt: String(row.created_at), updatedAt: String(row.updated_at), archivedAt: row.archived_at ? String(row.archived_at) : null, usageCount: assetUsages.length, mediaClass: ["IMAGE", "AUDIO", "VIDEO"].includes(String(row.media_class)) ? String(row.media_class) as "IMAGE" | "AUDIO" | "VIDEO" : "IMAGE", processingStatus: String(row.processing_status || "READY") as MediaAsset["processingStatus"], processingMetadata: row.processing_metadata && typeof row.processing_metadata === "object" ? row.processing_metadata as Record<string, unknown> : {}, durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds), container: row.container ? String(row.container) : null, videoCodec: row.video_codec ? String(row.video_codec) : null, audioCodec: row.audio_codec ? String(row.audio_codec) : null, bitrate: row.bitrate == null ? null : Number(row.bitrate), sourceStorageBucket: row.source_storage_bucket ? String(row.source_storage_bucket) : null, sourceStoragePath: row.source_storage_path ? String(row.source_storage_path) : null, readyStorageBucket: row.ready_storage_bucket ? String(row.ready_storage_bucket) : null, readyStoragePath: row.ready_storage_path ? String(row.ready_storage_path) : null, usages: assetUsages, variants: variants.filter((item) => item.mediaId === row.id)
  };
}

export async function fetchMediaLibrary() {
  const service = mediaCredentials();
  if (!service) return { configured: false, assets: [] as MediaAsset[], categories: [] as MediaCategory[], folders: [] as MediaFolder[], usages: [] as MediaUsage[] };
  const get = async (path: string) => { const response = await fetch(`${service.url}/rest/v1/${path}`, { cache: "no-store", headers: mediaHeaders(service) }).catch(() => null); return response?.ok ? response.json() : []; };
  const [assetRows, categoryRows, folderRows, usageRows, variantRows] = await Promise.all([
    get("media_assets?select=*&order=created_at.desc"), get("media_categories?select=*&order=display_order.asc"), get("media_folders?select=*&order=path.asc"), get("media_usage?select=*&order=created_at.desc"), get("media_variants?select=*&order=width.asc")
  ]);
  const usages = (usageRows as Record<string, unknown>[]).map(usageFromRow); const variants = (variantRows as Record<string, unknown>[]).map(variantFromRow);
  const categories = (categoryRows as Record<string, unknown>[]).map(categoryFromRow); const folders = (folderRows as Record<string, unknown>[]).map(folderFromRow);
  const assets = (assetRows as Record<string, unknown>[]).map((row) => { const asset = assetFromRow(row, usages, variants); return { ...asset, categoryName: categories.find((item) => item.id === asset.categoryId)?.name || "", folderName: folders.find((item) => item.id === asset.folderId)?.path || "" }; });
  return { configured: true, assets, categories, folders, usages };
}

export async function findMediaAsset(id: string) {
  const service = mediaCredentials(); if (!service) return null;
  const response = await fetch(`${service.url}/rest/v1/media_assets?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, { cache: "no-store", headers: mediaHeaders(service) });
  if (!response.ok) return null; const rows = await response.json(); return rows[0] || null;
}

export async function replaceMediaUsage(input: { mediaId: string; usageType: string; resourceId: string; route?: string; fieldName?: string }) {
  const service = mediaCredentials(); if (!service) throw new Error("Supabase service credentials are required.");
  const filter = `usage_type=eq.${encodeURIComponent(input.usageType)}&resource_id=eq.${encodeURIComponent(input.resourceId)}&field_name=eq.${encodeURIComponent(input.fieldName || "image")}`;
  await fetch(`${service.url}/rest/v1/media_usage?${filter}`, { method: "DELETE", headers: mediaHeaders(service) });
  const response = await fetch(`${service.url}/rest/v1/media_usage`, { method: "POST", headers: mediaHeaders(service, { prefer: "return=minimal" }), body: JSON.stringify({ media_id: input.mediaId, usage_type: input.usageType, resource_id: input.resourceId, route: input.route || null, field_name: input.fieldName || "image" }) });
  if (!response.ok) throw new Error("Unable to record image usage.");
}
