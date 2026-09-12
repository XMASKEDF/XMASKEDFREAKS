import { randomUUID } from "node:crypto";
import { bucketForStorageClass, getObjectStorageProvider, safeObjectKey, safeStorageBucket, storageBuckets, type StorageClass, type SignedUploadAuthorization } from "@/lib/infrastructure/storage";

export type MediaUploadClass = "IMAGE" | "AUDIO" | "VIDEO";

export const MEDIA_UPLOAD_LIMITS = {
  IMAGE: 15 * 1024 * 1024,
  AUDIO: 250 * 1024 * 1024,
  VIDEO: 500 * 1024 * 1024
} as const;

const mediaTypes: Record<MediaUploadClass, Record<string, string>> = {
  IMAGE: { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif", gif: "image/gif" },
  AUDIO: { mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4", wav: "audio/wav", aac: "audio/aac", ogg: "audio/ogg" },
  VIDEO: { mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime" }
};

export type ValidatedUploadMetadata = {
  mediaClass: MediaUploadClass;
  extension: string;
  mimeType: string;
  size: number;
  bucket: string;
  visibility: "PUBLIC" | "PRIVATE";
};

export function validateUploadMetadata(input: { mediaClass: MediaUploadClass; filename: string; mimeType: string; size: number; visibility?: "PUBLIC" | "PRIVATE" }) {
  const mediaClass = input.mediaClass;
  if (input.visibility === "PUBLIC" && mediaClass !== "IMAGE") throw new Error("Paid audio and video must use private storage.");
  const extension = input.filename.toLowerCase().split(".").pop() || "";
  const expectedMime = mediaTypes[mediaClass]?.[extension];
  const limit = MEDIA_UPLOAD_LIMITS[mediaClass];
  if (!expectedMime || expectedMime !== input.mimeType.toLowerCase()) throw new Error("The file extension and MIME type are not an approved match.");
  if (!Number.isSafeInteger(input.size) || input.size <= 0 || input.size > limit) throw new Error(`The file exceeds the ${Math.round(limit / 1024 / 1024)} MB ${mediaClass.toLowerCase()} limit.`);
  const visibility = input.visibility || "PRIVATE";
  const storageClass: StorageClass = visibility === "PUBLIC" ? "PUBLIC_MEDIA" : mediaClass === "IMAGE" ? "PRIVATE_MEDIA" : "PRIVATE_DIGITAL";
  return { mediaClass, extension, mimeType: expectedMime, size: input.size, bucket: bucketForStorageClass(storageClass), visibility } satisfies ValidatedUploadMetadata;
}

export function safeMediaUploadKey(category: string, extension: string) {
  const safeCategory = safeObjectKey(category).split("/")[0] || "other";
  const safeExtension = extension.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
  const now = new Date();
  return `${safeCategory}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${Date.now()}-${randomUUID()}.${safeExtension}`;
}

export async function authorizeMediaUpload(input: { key: string; bucket: string; mimeType: string; size: number; expiresInSeconds?: number }): Promise<SignedUploadAuthorization | null> {
  return getObjectStorageProvider().authorizeUpload?.({ key: safeObjectKey(input.key), bucket: safeStorageBucket(input.bucket), mimeType: input.mimeType, size: input.size, expiresInSeconds: input.expiresInSeconds }) || null;
}

export function publicMediaBucket() { return storageBuckets().publicMedia; }
export function privateMediaBucket() { return storageBuckets().privateMedia; }
export function privateDigitalBucket() { return storageBuckets().privateDigital; }
export function processingMediaBucket() { return storageBuckets().processing; }

export function mediaStorageStatus() { return getObjectStorageProvider().health(); }
