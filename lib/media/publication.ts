import "server-only";

import { getObjectStorageProvider, isPublicStorageBucket, storageAvailableForProduction, storageBuckets } from "@/lib/infrastructure/storage";
import { recordMediaStorageEvent } from "@/lib/media/uploads";
import { findMediaAsset, mediaCredentials, mediaHeaders } from "@/lib/media/server";

export type MediaPublicationCode =
  | "MEDIA_NOT_FOUND"
  | "IMAGE_ONLY"
  | "PRIVATE_MEDIA"
  | "MEDIA_ARCHIVED"
  | "MEDIA_NOT_READY"
  | "STORAGE_NOT_CONFIGURED"
  | "PUBLIC_URL_NOT_CONFIGURED"
  | "PUBLICATION_UNAVAILABLE"
  | "PUBLICATION_FAILED";

export type MediaPublicationResult = {
  ok: boolean;
  code?: MediaPublicationCode;
  mediaId: string;
  publicUrl?: string;
  status: "PUBLISHED" | "FAILED" | "ALREADY_PUBLISHED";
};

function environment() {
  return String(process.env.XMF_ENVIRONMENT || process.env.APP_ENV || "LOCAL").toUpperCase();
}

function safeErrorCode(error: unknown): MediaPublicationCode {
  return error instanceof Error && error.message === "PUBLIC_URL_NOT_CONFIGURED" ? "PUBLIC_URL_NOT_CONFIGURED" : "PUBLICATION_FAILED";
}

export async function publishPublicMediaAsset(mediaId: string, adminId: string): Promise<MediaPublicationResult> {
  const service = mediaCredentials();
  if (!service) return { ok: false, code: "PUBLICATION_UNAVAILABLE", mediaId, status: "FAILED" };
  const asset = await findMediaAsset(mediaId);
  if (!asset) return { ok: false, code: "MEDIA_NOT_FOUND", mediaId, status: "FAILED" };
  const mediaClass = String(asset.media_class || "IMAGE");
  if (mediaClass !== "IMAGE") return { ok: false, code: "IMAGE_ONLY", mediaId, status: "FAILED" };
  if (String(asset.status) === "private") return { ok: false, code: "PRIVATE_MEDIA", mediaId, status: "FAILED" };
  if (String(asset.status) === "archived") return { ok: false, code: "MEDIA_ARCHIVED", mediaId, status: "FAILED" };
  if (String(asset.processing_status || "READY") !== "READY") return { ok: false, code: "MEDIA_NOT_READY", mediaId, status: "FAILED" };
  if (!storageAvailableForProduction() || (environment() === "PRODUCTION" && !isPublicStorageBucket(storageBuckets().publicMedia))) {
    return { ok: false, code: "STORAGE_NOT_CONFIGURED", mediaId, status: "FAILED" };
  }

  const provider = getObjectStorageProvider();
  const publicBucket = storageBuckets().publicMedia;
  const sourceBucket = String(asset.storage_bucket || storageBuckets().privateMedia);
  const sourcePath = String(asset.storage_path || "");
  if (!sourcePath) return { ok: false, code: "PUBLICATION_UNAVAILABLE", mediaId, status: "FAILED" };
  const alreadyPublished = sourceBucket === publicBucket && isPublicStorageBucket(sourceBucket) && Boolean(asset.is_public) && String(asset.status) === "published";
  const stablePublicUrl = () => provider.kind === "LOCAL" ? `/api/media/${mediaId}/file` : provider.publicUrl?.(sourcePath, publicBucket, String(asset.content_hash || "")) || null;
  const existingUrl = alreadyPublished ? stablePublicUrl() : null;
  if (alreadyPublished && existingUrl) return { ok: true, mediaId, publicUrl: existingUrl, status: "ALREADY_PUBLISHED" };
  if (!provider.publicUrl) return { ok: false, code: "PUBLIC_URL_NOT_CONFIGURED", mediaId, status: "FAILED" };

  await recordMediaStorageEvent({ eventType: "PUBLICATION_REQUESTED", mediaId, bucket: sourceBucket, key: sourcePath, adminId, metadata: { destinationBucket: publicBucket } });
  await fetch(`${service.url}/rest/v1/media_assets?id=eq.${encodeURIComponent(mediaId)}`, {
    method: "PATCH",
    headers: mediaHeaders(service, { prefer: "return=minimal" }),
    body: JSON.stringify({ publication_status: "REQUESTED", publication_error: null, updated_at: new Date().toISOString() })
  }).catch(() => undefined);

  let copied = false;
  try {
    if (sourceBucket !== publicBucket) {
      if (!provider.copyToBucket) throw new Error("PUBLICATION_UNAVAILABLE");
      const copiedObject = await provider.copyToBucket(sourcePath, sourcePath, sourceBucket, publicBucket);
      if (!copiedObject) throw new Error("PUBLICATION_FAILED");
      copied = true;
    } else if (!await provider.exists(sourcePath, publicBucket)) {
      throw new Error("PUBLICATION_FAILED");
    }
    const publicUrl = stablePublicUrl();
    if (!publicUrl) throw new Error("PUBLIC_URL_NOT_CONFIGURED");
    const patch = {
      storage_bucket: publicBucket,
      storage_path: sourcePath,
      public_url: publicUrl,
      thumbnail_url: publicUrl,
      status: "published",
      is_public: true,
      publication_status: "PUBLISHED",
      publication_error: null,
      source_storage_bucket: asset.source_storage_bucket || (sourceBucket === publicBucket ? null : sourceBucket),
      source_storage_path: asset.source_storage_path || (sourceBucket === publicBucket ? null : sourcePath),
      updated_at: new Date().toISOString()
    };
    const saved = await fetch(`${service.url}/rest/v1/media_assets?id=eq.${encodeURIComponent(mediaId)}&status=neq.archived`, { method: "PATCH", headers: mediaHeaders(service, { prefer: "return=minimal" }), body: JSON.stringify(patch) });
    if (!saved.ok) throw new Error("PUBLICATION_FAILED");
    await fetch(`${service.url}/rest/v1/media_variants?media_id=eq.${encodeURIComponent(mediaId)}`, { method: "PATCH", headers: mediaHeaders(service, { prefer: "return=minimal" }), body: JSON.stringify({ storage_bucket: publicBucket, public_url: publicUrl }) }).catch(() => undefined);
    await recordMediaStorageEvent({ eventType: "PUBLICATION_COMPLETED", mediaId, bucket: publicBucket, key: sourcePath, adminId, metadata: { publicUrl } });
    return { ok: true, mediaId, publicUrl, status: "PUBLISHED" };
  } catch (error) {
    if (copied) await provider.delete(sourcePath, publicBucket).catch(() => false);
    const code = safeErrorCode(error);
    await fetch(`${service.url}/rest/v1/media_assets?id=eq.${encodeURIComponent(mediaId)}`, { method: "PATCH", headers: mediaHeaders(service, { prefer: "return=minimal" }), body: JSON.stringify({ publication_status: "FAILED", publication_error: code, updated_at: new Date().toISOString() }) }).catch(() => undefined);
    await recordMediaStorageEvent({ eventType: "PUBLICATION_FAILED", mediaId, bucket: sourceBucket, key: sourcePath, adminId, metadata: { code } });
    return { ok: false, code, mediaId, status: "FAILED" };
  }
}
