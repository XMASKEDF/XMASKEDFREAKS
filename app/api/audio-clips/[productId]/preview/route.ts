import { NextRequest, NextResponse } from "next/server";
import { findAudioProduct } from "@/lib/audio-store/catalog";
import { serviceCredentials } from "@/lib/api-user";
import { getObjectStorageProvider } from "@/lib/infrastructure/storage";

export async function GET(_request: NextRequest, { params }: { params: { productId: string } }) {
  const product = await findAudioProduct(params.productId);
  const service = serviceCredentials();
  if (!product || !service || !product.active || !product.published || !product.previewFilePath) return new NextResponse("Preview not found.", { status: 404 });
  const signedUrl = await getObjectStorageProvider().getSignedUrl(product.previewFilePath, 300, "audio-previews");
  if (!signedUrl) return new NextResponse("Preview unavailable.", { status: 404 });
  return NextResponse.redirect(signedUrl, { status: 302, headers: { "cache-control": "private, max-age=60", "x-content-type-options": "nosniff", "content-type": product.previewMimeType || "application/octet-stream" } });
}
