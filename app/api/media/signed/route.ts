import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getObjectStorageProvider, safeObjectKey, safeStorageBucket } from "@/lib/infrastructure/storage";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const provider = getObjectStorageProvider();
  if (provider.kind !== "LOCAL") return NextResponse.json({ ok: false, code: "LOCAL_MEDIA_ONLY" }, { status: 404 });
  const url = new URL(request.url);
  const bucket = safeStorageBucket(url.searchParams.get("bucket") || "");
  const key = safeObjectKey(url.searchParams.get("key") || "");
  const expires = Number(url.searchParams.get("expires"));
  const signature = url.searchParams.get("signature") || "";
  const download = (url.searchParams.get("download") || "").replace(/["\\]/g, "").slice(0, 180);
  if (!bucket || !key || !Number.isSafeInteger(expires) || expires < Math.floor(Date.now() / 1000) || !/^[a-f0-9]{64}$/.test(signature)) return NextResponse.json({ ok: false, code: "SIGNED_URL_INVALID" }, { status: 403 });
  const payload = `${bucket}:${key}:${expires}:${download}`;
  const expected = createHmac("sha256", process.env.SIGNED_DOWNLOAD_SECRET || "local-development-only").update(payload).digest("hex");
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return NextResponse.json({ ok: false, code: "SIGNED_URL_INVALID" }, { status: 403 });
  const [body, metadata] = await Promise.all([provider.download(key, bucket), provider.getMetadata(key, bucket)]);
  if (!body || !metadata) return NextResponse.json({ ok: false, code: "FILE_UNAVAILABLE" }, { status: 404 });
  const headers = new Headers({ "content-type": metadata.mimeType, "content-length": String(body.byteLength), "cache-control": "private, no-store", "x-content-type-options": "nosniff" });
  if (download) headers.set("content-disposition", `attachment; filename="${download}"`);
  return new NextResponse(body as BodyInit, { status: 200, headers });
}
