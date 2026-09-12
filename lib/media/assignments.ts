import { mediaCredentials, mediaHeaders } from "@/lib/media/server";

export type MediaAssignment = {
  resourceType: "audio_product" | "feet_preset";
  resourceId: string;
  role: "product" | "preview" | "thumbnail" | "download";
};

const assignmentTypes = new Set<MediaAssignment["resourceType"]>(["audio_product", "feet_preset"]);
const assignmentRoles = new Set<MediaAssignment["role"]>(["product", "preview", "thumbnail", "download"]);

export function normalizeMediaAssignment(value: unknown): MediaAssignment | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const resourceType = String(source.resourceType || "") as MediaAssignment["resourceType"];
  const role = String(source.role || "") as MediaAssignment["role"];
  const resourceId = String(source.resourceId || "");
  if (!assignmentTypes.has(resourceType) || !assignmentRoles.has(role) || !/^[a-zA-Z0-9_-]{8,100}$/.test(resourceId)) return null;
  if (resourceType === "audio_product" && role === "download") return null;
  if (resourceType === "feet_preset" && !["download", "thumbnail"].includes(role)) return null;
  return { resourceType, resourceId, role };
}

function columnsFor(assignment: MediaAssignment, pending: boolean) {
  if (assignment.resourceType === "audio_product") {
    if (assignment.role === "product") return pending ? "pending_media_asset_id" : "media_asset_id";
    if (assignment.role === "preview") return pending ? "pending_preview_media_asset_id" : "preview_media_asset_id";
    return pending ? "pending_thumbnail_media_asset_id" : "thumbnail_media_asset_id";
  }
  if (assignment.role === "download") return pending ? "pending_download_media_asset_id" : "download_media_asset_id";
  return pending ? "pending_thumbnail_media_asset_id" : "thumbnail_media_asset_id";
}

async function patchResource(assignment: MediaAssignment, patch: Record<string, unknown>) {
  const service = mediaCredentials();
  if (!service) throw new Error("Media assignment storage is not configured.");
  const table = assignment.resourceType === "audio_product" ? "audio_products" : "feet_request_presets";
  const response = await fetch(`${service.url}/rest/v1/${table}?id=eq.${encodeURIComponent(assignment.resourceId)}`, { method: "PATCH", headers: mediaHeaders(service, { prefer: "return=minimal" }), body: JSON.stringify(patch) });
  if (!response.ok) throw new Error("The uploaded media could not be assigned to its product.");
}

export async function assignPendingMediaAsset(assignment: MediaAssignment, mediaAssetId: string) {
  await patchResource(assignment, { [columnsFor(assignment, true)]: mediaAssetId, updated_at: new Date().toISOString() });
}

export async function activateMediaAssignment(assignment: MediaAssignment, mediaAssetId: string, asset: Record<string, unknown>) {
  const path = String(asset.ready_storage_path || asset.storage_path || "");
  const bucket = String(asset.ready_storage_bucket || asset.storage_bucket || "private-digital");
  const mimeType = String(asset.mime_type || "application/octet-stream");
  const extension = String(asset.extension || "bin");
  const size = Number(asset.file_size || 0);
  const base = { [columnsFor(assignment, false)]: mediaAssetId, [columnsFor(assignment, true)]: null, updated_at: new Date().toISOString() };
  if (assignment.resourceType === "audio_product") {
    if (assignment.role === "product") Object.assign(base, { product_file_path: path, mime_type: mimeType, file_extension: extension, file_size: size, original_filename: String(asset.original_filename || "") , media_type: mimeType.startsWith("video/") ? "video" : "audio" });
    if (assignment.role === "preview") Object.assign(base, { preview_file_path: path, preview_mime_type: mimeType, preview_extension: extension, preview_file_size: size });
    if (assignment.role === "thumbnail") Object.assign(base, { thumbnail_path: String(asset.public_url || `/api/media/${mediaAssetId}/file`) });
  } else if (assignment.role === "download") {
    Object.assign(base, { download_file_path: path, download_mime_type: mimeType, download_extension: extension, download_file_size: size });
  } else {
    Object.assign(base, { thumbnail_url: String(asset.public_url || `/api/media/${mediaAssetId}/file`) });
  }
  await patchResource(assignment, base);
  return { bucket, path };
}
