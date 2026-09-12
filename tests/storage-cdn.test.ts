import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { LocalObjectStorageProvider, bucketForStorageClass, storageBuckets } from "../lib/infrastructure/storage.ts";
import { validateUploadMetadata } from "../lib/media/storage.ts";

const source = (file: string) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("storage classes resolve to isolated logical buckets", async () => {
  const provider = new LocalObjectStorageProvider();
  const body = new Uint8Array([1, 2, 3]);
  const first = await provider.upload({ bucket: "private-a", key: "same/file.bin", body, visibility: "PRIVATE" });
  const second = await provider.upload({ bucket: "private-b", key: "same/file.bin", body, visibility: "PRIVATE" });
  assert.equal(first.bucket, "private-a");
  assert.equal(second.bucket, "private-b");
  assert.deepEqual(await provider.download(first.key, first.bucket), body);
  assert.deepEqual(await provider.download(second.key, second.bucket), body);
  assert.equal(bucketForStorageClass("PUBLIC_MEDIA"), storageBuckets().publicMedia);
  assert.equal(bucketForStorageClass("PRIVATE_DIGITAL"), storageBuckets().privateDigital);
});

test("media upload validation centralizes size, MIME, and bucket rules", () => {
  const image = validateUploadMetadata({ mediaClass: "IMAGE", filename: "banner.png", mimeType: "image/png", size: 100, visibility: "PUBLIC" });
  const audio = validateUploadMetadata({ mediaClass: "AUDIO", filename: "clip.mp4", mimeType: "audio/mp4", size: 100 });
  assert.equal(image.bucket, storageBuckets().publicMedia);
  assert.equal(audio.bucket, storageBuckets().privateDigital);
  assert.throws(() => validateUploadMetadata({ mediaClass: "AUDIO", filename: "clip.mp4", mimeType: "audio/mp4", size: 100, visibility: "PUBLIC" }), /private storage/);
  assert.throws(() => validateUploadMetadata({ mediaClass: "VIDEO", filename: "clip.mp4", mimeType: "video/webm", size: 100 }), /extension and MIME/);
});

test("storage migration is additive and provisions public/private processing boundaries", async () => {
  const migration = await source("supabase/migrations/20260909120000_storage_cdn_backbone.sql");
  assert.match(migration, /create table if not exists public\.media_upload_sessions/);
  assert.match(migration, /create table if not exists public\.media_processing_jobs/);
  assert.match(migration, /create table if not exists public\.media_storage_events/);
  assert.match(migration, /'public-media'/);
  assert.match(migration, /'private-digital'/);
  assert.match(migration, /'media-processing'/);
  assert.doesNotMatch(migration, /drop\s+table|truncate(?:\s|;)|delete\s+from|drop\s+column/i);
});

test("direct upload and completion routes remain admin-only and provider-backed", async () => {
  const upload = await source("app/api/admin/media/upload/route.ts");
  const complete = await source("app/api/admin/media/upload/complete/route.ts");
  const download = await source("app/api/media/[mediaId]/file/route.ts");
  assert.match(upload, /getAdminBySession/);
  assert.match(upload, /authorizeMediaUpload/);
  assert.match(upload, /DIRECT_UPLOAD_UNAVAILABLE/);
  assert.match(complete, /getObjectStorageProvider/);
  assert.match(complete, /queueMediaProcessing/);
  assert.match(download, /getObjectStorageProvider/);
  assert.match(download, /storage_bucket/);
});

test("private audio downloads use entitlement checks and short-lived signed URLs", async () => {
  const download = await source("app/api/audio-clips/[productId]/download/route.ts");
  assert.match(download, /assertEntitlement/);
  assert.match(download, /getSignedUrl/);
  assert.match(download, /SIGNED_DOWNLOAD_ISSUED/);
  assert.match(download, /, 60,/);
  assert.doesNotMatch(download, /storage\/v1\/object\/public/);
});

test("local private media signatures are time-limited and HMAC-protected", async () => {
  const route = await source("app/api/media/signed/route.ts");
  const storage = await source("lib/infrastructure/storage.ts");
  assert.match(route, /LOCAL_MEDIA_ONLY/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /SIGNED_URL_INVALID/);
  assert.match(storage, /local-development-only/);
  assert.match(storage, /SIGNED_DOWNLOAD_SECRET/);
});

test("expired cleanup retains referenced upload sessions", async () => {
  const cleanup = await source("lib/media/uploads.ts");
  assert.match(cleanup, /if \(session\.media_asset_id\) \{ retained \+= 1; continue; \}/);
  assert.match(cleanup, /expired_unreferenced_upload/);
});
