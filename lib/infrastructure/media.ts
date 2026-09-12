import type { ObjectMetadata } from "./types";
import { getObjectStorageProvider } from "./storage";
import { BasicUploadSecurityProvider } from "./security-edge";

export const mediaPrefixes = { products: "products/", merch: "merch/", paintings: "paintings/", audio: "audio/", audioPreviews: "audio/previews/", video: "video/", live: "live/", upcoming: "upcoming/", thumbnails: "thumbnails/", userSafe: "user-safe/" } as const;
export type MediaProcessingStatus = ObjectMetadata["processingStatus"];

export async function prepareMediaUpload(input: { key: string; body: Uint8Array; filename: string; mimeType: string; visibility?: "PUBLIC" | "PRIVATE"; ownerId?: string | null; reference?: string | null }) {
  const security = await new BasicUploadSecurityProvider().inspect({ filename: input.filename, mimeType: input.mimeType, size: input.body.byteLength, bytes: input.body });
  if (security.status === "REJECTED") return { ok: false as const, status: security.status, reason: security.reason };
  const object = await getObjectStorageProvider().upload({ key: input.key, body: input.body, originalFilename: input.filename, mimeType: input.mimeType, visibility: input.visibility, ownerId: input.ownerId, reference: input.reference });
  return { ok: true as const, status: security.status, object };
}

export async function enqueueImageProcessing(object: ObjectMetadata) { return { type: "IMAGE_PROCESSING" as const, objectId: object.objectId, key: object.key, stages: ["validation", "metadata", "optimized", "thumbnail", "web-friendly", "publishing-readiness"] }; }
export async function enqueueAudioProcessing(object: ObjectMetadata) { return { type: "AUDIO_PROCESSING" as const, objectId: object.objectId, key: object.key, stages: ["metadata", "duration", "format-validation", "preview", "download-version", "checksum"] }; }
export async function enqueueVideoProcessing(object: ObjectMetadata) { return { type: "VIDEO_PROCESSING" as const, objectId: object.objectId, key: object.key, stages: ["metadata", "poster", "preview-variants", "encoding-status", "delivery-url"] }; }

export const mediaWorkerJobs = {
  image: "PROCESS_IMAGE" as const,
  audio: "PROCESS_AUDIO" as const,
  video: "PROCESS_VIDEO" as const,
  thumbnail: "GENERATE_THUMBNAIL" as const,
  preview: "GENERATE_PREVIEW" as const,
  metadata: "EXTRACT_METADATA" as const
};
