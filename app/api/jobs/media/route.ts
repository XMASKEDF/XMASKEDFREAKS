import { NextRequest, NextResponse } from "next/server";
import { mediaCredentials, mediaHeaders } from "@/lib/media/server";
import { findMediaProcessingSession, recordMediaStorageEvent, updateMediaUploadSession } from "@/lib/media/uploads";
import { processMediaSession } from "@/lib/media/processor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const expected = process.env.MEDIA_WORKER_SECRET || process.env.CRON_SECRET;
  return Boolean(expected && request.headers.get("authorization") === `Bearer ${expected}`);
}

async function updateJob(service: NonNullable<ReturnType<typeof mediaCredentials>>, id: string, patch: Record<string, unknown>) {
  await fetch(`${service.url}/rest/v1/media_processing_jobs?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: mediaHeaders(service, { prefer: "return=minimal" }), body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ ok: false, code: "WORKER_UNAUTHORIZED" }, { status: 401 });
  const service = mediaCredentials();
  if (!service) return NextResponse.json({ ok: false, code: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { limit?: unknown };
  const claim = await fetch(`${service.url}/rest/v1/rpc/claim_media_processing_jobs`, { method: "POST", headers: mediaHeaders(service), body: JSON.stringify({ p_limit: Math.max(1, Math.min(25, Math.floor(Number(body.limit || 5)))) }) }).catch(() => null);
  if (!claim?.ok) return NextResponse.json({ ok: false, code: "JOB_CLAIM_UNAVAILABLE" }, { status: 503 });
  const jobs = await claim.json() as Array<{ id: string; upload_session_id: string; attempt_count: number }>;
  const results: Array<{ jobId: string; status: string; error?: string }> = [];
  for (const job of jobs) {
    const session = await findMediaProcessingSession(job.upload_session_id);
    if (!session) { await updateJob(service, job.id, { status: "FAILED", last_error: "Upload session not found.", completed_at: new Date().toISOString() }); results.push({ jobId: job.id, status: "FAILED", error: "Upload session not found." }); continue; }
    if (!process.env.UPLOAD_SCANNER_URL || !process.env.UPLOAD_SCANNER_TOKEN || process.env.UPLOAD_SCANNER_MODE !== "url") {
      const error = "Awaiting an approved URL-capable malware scanner; media remains quarantined.";
      await updateJob(service, job.id, { status: "ACTION REQUIRED", last_error: error, completed_at: new Date().toISOString() });
      await updateMediaUploadSession(session.id, { status: "QUARANTINED", last_error: error });
      results.push({ jobId: job.id, status: "ACTION REQUIRED", error });
      continue;
    }
    try {
      const scan = await fetch(process.env.UPLOAD_SCANNER_URL, { method: "POST", headers: { authorization: `Bearer ${process.env.UPLOAD_SCANNER_TOKEN}`, "content-type": "application/json" }, body: JSON.stringify({ bucket: session.storage_bucket, key: session.storage_path, mediaAssetId: session.media_asset_id, filename: session.original_filename, mimeType: session.mime_type, size: session.file_size }) }).catch(() => null);
      const scanResult = scan?.ok ? await scan.json().catch(() => ({})) as { clean?: boolean; malicious?: boolean } : {};
      if (!scan?.ok || scanResult.clean !== true || scanResult.malicious === true) {
        const error = "The malware scanner did not confirm this media as clean; it remains quarantined.";
        await updateJob(service, job.id, { status: "ACTION REQUIRED", last_error: error, completed_at: new Date().toISOString() });
        await updateMediaUploadSession(session.id, { status: "QUARANTINED", last_error: error });
        results.push({ jobId: job.id, status: "ACTION REQUIRED", error });
        continue;
      }
      const processed = await processMediaSession(session);
      await updateJob(service, job.id, { status: "SUCCEEDED", completed_at: new Date().toISOString(), last_error: null });
      await updateMediaUploadSession(session.id, { status: "READY", completed_at: new Date().toISOString(), last_error: null });
      await recordMediaStorageEvent({ eventType: "PROCESSING_COMPLETED", mediaId: processed.mediaId, uploadSessionId: session.id, bucket: processed.readyBucket, key: processed.readyPath, metadata: processed.metadata });
      results.push({ jobId: job.id, status: "SUCCEEDED" });
    } catch (caught) {
      const error = caught instanceof Error ? caught.message : "Media processing failed.";
      const retry = job.attempt_count < 3;
      await updateJob(service, job.id, retry ? { status: "RETRYING", next_attempt_at: new Date(Date.now() + 2 ** job.attempt_count * 60_000).toISOString(), last_error: error } : { status: "FAILED", completed_at: new Date().toISOString(), last_error: error });
      if (!retry) await updateMediaUploadSession(session.id, { status: "FAILED", last_error: error });
      results.push({ jobId: job.id, status: retry ? "RETRYING" : "FAILED", error });
    }
  }
  return NextResponse.json({ ok: true, claimed: jobs.length, results }, { headers: { "cache-control": "no-store" } });
}
