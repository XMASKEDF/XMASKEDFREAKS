import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession } from "@/lib/admin-auth";
import { findAudioProduct, getAudioProducts } from "@/lib/audio-store/catalog";
import { safeObjectPath, validateDigitalMedia } from "@/lib/audio-store/validation";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { validateMediaImage } from "@/lib/media/image-validation";
import { getObjectStorageProvider, storageAvailableForProduction } from "@/lib/infrastructure/storage";
import { extractClientIp } from "@/lib/security";

export const runtime = "nodejs";
const requestLimits = new Map<string, { count: number; resetAt: number }>();

async function authorize(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  return admin?.role === "ADMIN" && admin.two_factor_required ? admin : null;
}

function limited(key: string, maximum = 30) {
  const now = Date.now(); const current = requestLimits.get(key);
  if (!current || current.resetAt < now) { requestLimits.set(key, { count: 1, resetAt: now + 60_000 }); return false; }
  current.count += 1; return current.count > maximum;
}

async function logChange(adminId: string, eventType: string, productId: string, metadata: Record<string, unknown>) {
  const service = serviceCredentials();
  if (!service) return;
  await fetch(`${service.url}/rest/v1/audio_store_audit_events`, { method: "POST", headers: serviceHeaders(service, "return=minimal"), body: JSON.stringify({ admin_user_id: adminId, event_type: eventType, product_id: productId, metadata }) }).catch(() => undefined);
}

export async function GET(request: NextRequest) {
  const admin = await authorize(request);
  if (!admin) return NextResponse.json({ ok: false, error: "Authenticated ADMIN account with 2FA is required." }, { status: 401 });
  return NextResponse.json({ ok: true, products: await getAudioProducts(true), configured: Boolean(serviceCredentials()) });
}

export async function PATCH(request: NextRequest) {
  const admin = await authorize(request);
  const ipAddress = extractClientIp(request.headers); const userAgent = request.headers.get("user-agent") || "unknown";
  if (!admin) return NextResponse.json({ ok: false, error: "Authenticated ADMIN account with 2FA is required." }, { status: 401 });
  if (limited(`${admin.id}:${ipAddress}`)) return NextResponse.json({ ok: false, error: "Too many audio-store changes. Wait one minute and retry." }, { status: 429 });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ ok: false, error: "Supabase service credentials are required." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = String(body.id || ""); const before = await findAudioProduct(id);
  if (!before) return NextResponse.json({ ok: false, error: "Audio product slot not found." }, { status: 404 });
  const coinPrice = Math.floor(Number(body.coinPrice));
  if (!Number.isInteger(coinPrice) || coinPrice < 1 || coinPrice > 100000) return NextResponse.json({ ok: false, error: "Coin price must be a whole number between 1 and 100,000." }, { status: 422 });
  const patch = {
    name: String(body.name || "").trim().slice(0, 140),
    description: String(body.description || "").trim().slice(0, 2000),
    coin_price: coinPrice,
    is_active: body.active === true,
    is_published: body.published === true,
    allow_repurchase: body.allowRepurchase === true,
    updated_by: admin.id,
    updated_at: new Date().toISOString()
  };
  if (!patch.name) return NextResponse.json({ ok: false, error: "Product name is required." }, { status: 422 });
  if (patch.is_published && (!before.productFilePath || !before.mimeType)) return NextResponse.json({ ok: false, error: "Upload a valid product file before publishing." }, { status: 422 });
  const saved = await fetch(`${service.url}/rest/v1/audio_products?id=eq.${id}`, { method: "PATCH", headers: serviceHeaders(service, "return=minimal"), body: JSON.stringify(patch) });
  if (!saved.ok) return NextResponse.json({ ok: false, error: "The audio product could not be saved." }, { status: 422 });
  await Promise.all([
    logChange(admin.id, "audio_product_updated", id, { previousPrice: before.coinPrice, nextPrice: coinPrice, active: patch.is_active, published: patch.is_published }),
    auditAdminEvent({ adminUserId: admin.id, eventType: "admin_audio_product_updated", ipAddress, userAgent, metadata: { productId: id, slotNumber: before.slotNumber, coinPrice } })
  ]);
  return NextResponse.json({ ok: true, products: await getAudioProducts(true) });
}

export async function POST(request: NextRequest) {
  const admin = await authorize(request);
  const ipAddress = extractClientIp(request.headers); const userAgent = request.headers.get("user-agent") || "unknown";
  if (!admin) return NextResponse.json({ ok: false, error: "Authenticated ADMIN account with 2FA is required." }, { status: 401 });
  if (limited(`${admin.id}:${ipAddress}`, 12)) return NextResponse.json({ ok: false, error: "Too many uploads. Wait one minute and retry." }, { status: 429 });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ ok: false, error: "Supabase service credentials are required." }, { status: 503 });
  if (!storageAvailableForProduction()) return NextResponse.json({ ok: false, error: "An approved production storage provider is required." }, { status: 503 });
  const form = await request.formData(); const id = String(form.get("id") || ""); const requestedKind = String(form.get("kind") || ""); const file = form.get("file");
  const product = await findAudioProduct(id);
  if (!product || !(file instanceof File) || !["product", "preview", "thumbnail"].includes(requestedKind)) return NextResponse.json({ ok: false, error: "Choose a valid product slot, file, and upload type." }, { status: 422 });
  const kind = requestedKind as "product" | "preview" | "thumbnail";
  if (kind !== "thumbnail" && file.size > 5 * 1024 * 1024) return NextResponse.json({ ok: false, code: "DIRECT_UPLOAD_REQUIRED", error: "Large audio files must use the secure direct media uploader." }, { status: 413 });
  try {
    let bucket: string; let path: string; let patch: Record<string, unknown>; let bytes: Uint8Array; let mimeType: string;
    if (kind === "thumbnail") {
      const validated = await validateMediaImage(file); bytes = validated.bytes; mimeType = validated.mimeType; bucket = "audio-thumbnails"; path = safeObjectPath(product.slotNumber, "thumbnail", validated.extension);
      patch = { thumbnail_path: path };
    } else {
      const validated = await validateDigitalMedia(file, kind === "preview"); bytes = validated.bytes; mimeType = validated.mimeType; bucket = kind === "preview" ? "audio-previews" : "audio-products"; path = safeObjectPath(product.slotNumber, kind, validated.extension);
      patch = kind === "preview" ? { preview_file_path: path, preview_mime_type: mimeType, preview_extension: validated.extension, preview_file_size: validated.fileSize } : { product_file_path: path, media_type: validated.mediaType, mime_type: mimeType, file_extension: validated.extension, file_size: validated.fileSize, original_filename: file.name.slice(0, 220) };
    }
    const oldPath = kind === "thumbnail" ? product.thumbnailPath : kind === "preview" ? product.previewFilePath : product.productFilePath;
    const storage = getObjectStorageProvider();
    try {
      await storage.upload({ bucket, key: path, body: bytes, originalFilename: file.name, mimeType, visibility: "PRIVATE", ownerId: admin.id, reference: `audio_product:${id}:${kind}` });
    } catch {
      throw new Error("Private storage upload failed. Apply the audio-store migration and verify its buckets.");
    }
    const saved = await fetch(`${service.url}/rest/v1/audio_products?id=eq.${id}`, { method: "PATCH", headers: serviceHeaders(service, "return=minimal"), body: JSON.stringify({ ...patch, updated_by: admin.id, updated_at: new Date().toISOString() }) });
    if (!saved.ok) { await storage.delete(path, bucket); throw new Error("The file uploaded, but its product record could not be updated."); }
    if (kind !== "product" && oldPath && oldPath !== path) await storage.delete(oldPath, bucket).catch(() => false);
    await Promise.all([logChange(admin.id, `audio_${kind}_uploaded`, id, { slotNumber: product.slotNumber, mimeType, fileSize: file.size }), auditAdminEvent({ adminUserId: admin.id, eventType: `admin_audio_${kind}_uploaded`, ipAddress, userAgent, metadata: { productId: id, mimeType, fileSize: file.size } })]);
    return NextResponse.json({ ok: true, products: await getAudioProducts(true) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Audio-store upload failed." }, { status: 422 });
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await authorize(request);
  const ipAddress = extractClientIp(request.headers); const userAgent = request.headers.get("user-agent") || "unknown";
  if (!admin) return NextResponse.json({ ok: false, error: "Authenticated ADMIN account with 2FA is required." }, { status: 401 });
  const service = serviceCredentials(); if (!service) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  const id = request.nextUrl.searchParams.get("id") || ""; const kind = request.nextUrl.searchParams.get("kind") || "all"; const product = await findAudioProduct(id);
  if (!product) return NextResponse.json({ ok: false, error: "Audio product slot not found." }, { status: 404 });
  if (!["all", "thumbnail", "preview", "product"].includes(kind)) return NextResponse.json({ ok: false, error: "Unsupported removal type." }, { status: 400 });
  const reset = kind === "thumbnail" ? { thumbnail_path: null } : kind === "preview" ? { preview_file_path: null, preview_mime_type: null, preview_extension: null, preview_file_size: null } : kind === "product" ? { product_file_path: null, media_type: "audio", mime_type: null, file_extension: null, file_size: null, original_filename: null, is_active: false, is_published: false } : { name: `Audio experience ${String(product.slotNumber).padStart(2, "0")}`, description: "This downloadable product is being prepared by XMASKEDFREAKS.", coin_price: 25, thumbnail_path: null, product_file_path: null, preview_file_path: null, media_type: "audio", mime_type: null, file_extension: null, file_size: null, original_filename: null, preview_mime_type: null, preview_extension: null, preview_file_size: null, is_active: false, is_published: false };
  Object.assign(reset, { updated_by: admin.id, updated_at: new Date().toISOString() });
  const saved = await fetch(`${service.url}/rest/v1/audio_products?id=eq.${id}`, { method: "PATCH", headers: serviceHeaders(service, "return=minimal"), body: JSON.stringify(reset) });
  if (!saved.ok) return NextResponse.json({ ok: false, error: "The product slot could not be cleared." }, { status: 422 });
  const storage = getObjectStorageProvider();
  await Promise.all([
    (kind === "all" || kind === "thumbnail") && product.thumbnailPath ? storage.delete(product.thumbnailPath, "audio-thumbnails") : Promise.resolve(true),
    (kind === "all" || kind === "preview") && product.previewFilePath ? storage.delete(product.previewFilePath, "audio-previews") : Promise.resolve(true)
  ]).catch(() => undefined);
  await Promise.all([logChange(admin.id, `audio_${kind}_removed`, id, { slotNumber: product.slotNumber, historicalProductFilePreserved: kind === "product" || kind === "all" }), auditAdminEvent({ adminUserId: admin.id, eventType: "admin_audio_product_removed", ipAddress, userAgent, metadata: { productId: id, kind } })]);
  return NextResponse.json({ ok: true, products: await getAudioProducts(true) });
}
