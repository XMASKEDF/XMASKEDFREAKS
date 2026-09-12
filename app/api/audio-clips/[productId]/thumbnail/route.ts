import { NextResponse } from "next/server";
import { findAudioProduct } from "@/lib/audio-store/catalog";
import { serviceCredentials } from "@/lib/api-user";
import { getObjectStorageProvider } from "@/lib/infrastructure/storage";

export async function GET(_: Request, { params }: { params: { productId: string } }) {
  const product = await findAudioProduct(params.productId);
  const service = serviceCredentials();
  if (!product || !service || !product.thumbnailPath) return new NextResponse("Thumbnail not found.", { status: 404 });
  const signedUrl = await getObjectStorageProvider().getSignedUrl(product.thumbnailPath, 300, "audio-thumbnails");
  if (!signedUrl) return new NextResponse("Thumbnail unavailable.", { status: 404 });
  return NextResponse.redirect(signedUrl, { status: 302, headers: { "cache-control": "private, max-age=60", "x-content-type-options": "nosniff" } });
}
