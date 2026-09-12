import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getObjectStorageProvider, storageBuckets } from "@/lib/infrastructure/storage";
import { mediaCredentials, mediaHeaders } from "@/lib/media/server";
import { activateMediaAssignment, normalizeMediaAssignment, type MediaAssignment } from "@/lib/media/assignments";
import type { MediaUploadSession } from "@/lib/media/uploads";

export type MediaProbe = { format?: { format_name?: string; duration?: string; bit_rate?: string }; streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number; bit_rate?: string }> };
export type ProcessedMedia = { mediaId: string; sessionId: string; assignment: MediaAssignment | null; readyBucket: string; readyPath: string; thumbnailPath: string | null; metadata: { durationSeconds: number | null; width: number; height: number; container: string | null; videoCodec: string | null; audioCodec: string | null; bitrate: number | null } };

function run(command: string, args: string[], timeoutMs = 10 * 60 * 1000) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.env[command === "ffmpeg" ? "FFMPEG_PATH" : "FFPROBE_PATH"] || command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); }); child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`${command} timed out.`)); }, timeoutMs);
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => { clearTimeout(timer); code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${command} failed (${code}).`)); });
  });
}

export async function mediaToolHealth() {
  const [ffmpeg, ffprobe] = await Promise.all([run("ffmpeg", ["-version"], 3000).then(() => true).catch(() => false), run("ffprobe", ["-version"], 3000).then(() => true).catch(() => false)]);
  const environment = String(process.env.XMF_ENVIRONMENT || process.env.APP_ENV || "LOCAL").toUpperCase();
  const workerConfigured = Boolean(process.env.MEDIA_WORKER_URL || process.env.MEDIA_PROCESSOR_PROVIDER === "LOCAL");
  return { ffmpeg, ffprobe, workerConfigured, status: environment === "PRODUCTION" && !workerConfigured ? "ACTION REQUIRED" : ffmpeg && ffprobe ? "HEALTHY" : "DEGRADED", detail: environment === "PRODUCTION" && !workerConfigured ? "A durable production media worker is required before large-media processing can be enabled." : ffmpeg && ffprobe ? "FFmpeg and ffprobe are available for the configured worker." : "FFmpeg/ffprobe are unavailable; media processing remains blocked." };
}

export function extractMediaMetadata(probe: MediaProbe) {
  const video = probe.streams?.find((stream) => stream.codec_type === "video");
  const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
  const formatName = String(probe.format?.format_name || "") || null;
  return { durationSeconds: probe.format?.duration ? Number(probe.format.duration) : null, width: Math.max(1, Number(video?.width || 1)), height: Math.max(1, Number(video?.height || 1)), container: formatName, videoCodec: video?.codec_name || null, audioCodec: audio?.codec_name || null, bitrate: Number(probe.format?.bit_rate || video?.bit_rate || audio?.bit_rate || 0) || null };
}

export function isCompatibleMp4(metadata: ReturnType<typeof extractMediaMetadata>) {
  return Boolean(metadata.container?.split(",").includes("mp4") && metadata.videoCodec === "h264" && (!metadata.audioCodec || metadata.audioCodec === "aac"));
}

async function sourceFor(session: MediaUploadSession, directory: string) {
  const provider = getObjectStorageProvider();
  if (provider.kind !== "LOCAL") {
    const signedUrl = await provider.getSignedUrl(session.storage_path, 900, session.storage_bucket, session.original_filename);
    if (signedUrl?.startsWith("http")) return { input: signedUrl, cleanup: async () => undefined };
  }
  const bytes = await provider.download(session.storage_path, session.storage_bucket);
  if (!bytes) throw new Error("The source media could not be read from storage.");
  const input = join(directory, `source-${randomUUID()}-${session.original_filename.replace(/[^a-zA-Z0-9_.-]/g, "_")}`);
  await writeFile(input, bytes);
  return { input, cleanup: async () => rm(input, { force: true }) };
}

async function saveAsset(service: NonNullable<ReturnType<typeof mediaCredentials>>, processed: ProcessedMedia, session: MediaUploadSession) {
  const patch = { processing_status: "READY", processing_metadata: processed.metadata, ready_storage_bucket: processed.readyBucket, ready_storage_path: processed.readyPath, source_storage_bucket: session.storage_bucket, source_storage_path: session.storage_path, duration_seconds: processed.metadata.durationSeconds, width: processed.metadata.width, height: processed.metadata.height, aspect_ratio: processed.metadata.width / processed.metadata.height, container: processed.metadata.container, video_codec: processed.metadata.videoCodec, audio_codec: processed.metadata.audioCodec, bitrate: processed.metadata.bitrate, thumbnail_url: processed.thumbnailPath ? `/api/media/${processed.mediaId}/file` : undefined, updated_at: new Date().toISOString() };
  const response = await fetch(`${service.url}/rest/v1/media_assets?id=eq.${encodeURIComponent(processed.mediaId)}`, { method: "PATCH", headers: mediaHeaders(service, { prefer: "return=minimal" }), body: JSON.stringify(patch) });
  if (!response.ok) throw new Error("Processed media metadata could not be saved.");
  if (processed.assignment) await activateMediaAssignment(processed.assignment, processed.mediaId, { ...patch, storage_path: processed.readyPath, storage_bucket: processed.readyBucket, mime_type: session.media_class === "VIDEO" ? "video/mp4" : session.mime_type, extension: session.media_class === "VIDEO" ? "mp4" : session.original_filename.split(".").pop(), file_size: session.file_size, original_filename: session.original_filename, public_url: `/api/media/${processed.mediaId}/file` });
}

export async function processMediaSession(session: MediaUploadSession): Promise<ProcessedMedia> {
  const service = mediaCredentials();
  if (!service || !session.media_asset_id) throw new Error("Media processing storage is not configured or the asset is missing.");
  const directory = join(tmpdir(), `xmf-media-${session.id}`); await mkdir(directory, { recursive: true });
  const source = await sourceFor(session, directory);
  let outputPath: string | null = null; let thumbnailPath: string | null = null;
  try {
    const probeResult = await run("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", source.input]);
    const metadata = extractMediaMetadata(JSON.parse(probeResult.stdout) as MediaProbe);
    const provider = getObjectStorageProvider(); const readyBucket = storageBuckets().privateDigital; let readyPath = session.storage_path;
    const needsVideoNormalization = session.media_class === "VIDEO" && !isCompatibleMp4(metadata);
    if (needsVideoNormalization) {
      outputPath = join(directory, "ready.mp4");
      await run("ffmpeg", ["-y", "-i", source.input, "-map_metadata", "-1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", outputPath]);
      const body = new Uint8Array(await readFile(outputPath));
      readyPath = `processed/${session.id}.mp4`;
      await provider.upload({ bucket: readyBucket, key: readyPath, body, originalFilename: `${session.original_filename.replace(/\.[^.]+$/, "")}.mp4`, mimeType: "video/mp4", visibility: "PRIVATE", ownerId: session.requested_by, reference: `media_asset:${session.media_asset_id}` });
    }
    if (session.media_class === "VIDEO") {
      thumbnailPath = `processed/${session.id}.jpg`;
      const posterPath = join(directory, "poster.jpg");
      await run("ffmpeg", ["-y", "-ss", "00:00:01", "-i", source.input, "-frames:v", "1", "-vf", "scale=640:-2", posterPath]);
      const poster = new Uint8Array(await readFile(posterPath));
      await provider.upload({ bucket: storageBuckets().processing, key: thumbnailPath, body: poster, originalFilename: `${session.original_filename.replace(/\.[^.]+$/, "")}.jpg`, mimeType: "image/jpeg", visibility: "PRIVATE", ownerId: session.requested_by, reference: `thumbnail:${session.media_asset_id}` });
    }
    const processed: ProcessedMedia = { mediaId: session.media_asset_id, sessionId: session.id, assignment: normalizeMediaAssignment(session.metadata.assignment), readyBucket, readyPath, thumbnailPath, metadata: { ...metadata, ...(needsVideoNormalization ? { container: "mp4", videoCodec: "h264", audioCodec: "aac" } : {}) } };
    await saveAsset(service, processed, session);
    return processed;
  } finally {
    await source.cleanup().catch(() => undefined); await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}
