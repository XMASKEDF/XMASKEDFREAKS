import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, getAdminBySession } from "@/lib/admin-auth";
import { findMediaAsset } from "@/lib/media/server";
import { getObjectStorageProvider, storageAvailableForProduction, storageBuckets } from "@/lib/infrastructure/storage";

export async function GET(request: NextRequest, { params }: { params: { mediaId: string } }) {
  if (!storageAvailableForProduction()) return new NextResponse("Media storage is not configured.", { status: 503 });
  const asset = await findMediaAsset(params.mediaId);
  if (!asset) return new NextResponse("Image not found.", { status: 404 });
  if (!asset.is_public || asset.status !== "published") {
    const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
    if (!admin || admin.role !== "ADMIN") return new NextResponse("Image not found.", { status: 404 });
  }
  const bucket = String(asset.storage_bucket || storageBuckets().privateMedia);
  const stored = await getObjectStorageProvider().download(String(asset.storage_path), bucket);
  if (!stored) return new NextResponse("Image unavailable.", { status: 404 });
  return new NextResponse(Buffer.from(stored), { headers: { "content-type": String(asset.mime_type), "content-length": String(stored.byteLength), "cache-control": asset.is_public ? "public, max-age=3600, stale-while-revalidate=86400" : "private, no-store", "x-content-type-options": "nosniff", "content-disposition": `inline; filename="${String(asset.original_filename).replace(/[\"\\]/g, "")}"` } });
}
