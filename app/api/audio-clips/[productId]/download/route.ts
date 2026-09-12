import { NextRequest, NextResponse } from "next/server";
import { safeDownloadName } from "@/lib/audio-store/validation";
import { getApiUser, serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { assertEntitlement } from "@/lib/entitlements";
import { evaluateRisk, recordRiskEvent } from "@/lib/risk";
import { getObjectStorageProvider, storageAvailableForProduction } from "@/lib/infrastructure/storage";
import { recordMediaStorageEvent } from "@/lib/media/uploads";
import { checkRateLimit, rateLimitRules } from "@/lib/infrastructure/rate-limit";

export async function GET(request: NextRequest, { params }: { params: { productId: string } }) {
  const user = await getApiUser(request);
  const service = serviceCredentials();
  if (!user) return NextResponse.json({ ok: false, code: "AUTH_REQUIRED" }, { status: 401 });
  if (!service) return NextResponse.json({ ok: false, code: "STORE_UNAVAILABLE" }, { status: 503 });
  const rate = await checkRateLimit(rateLimitRules.downloads || { name: "downloads", limit: 30, windowSeconds: 60 }, user.id);
  if (!rate.allowed) return NextResponse.json({ ok: false, code: "RATE_LIMITED" }, { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } });
  const entitlementCheck = await assertEntitlement(user.id, params.productId, "AUDIO_DOWNLOAD");
  if (!entitlementCheck.allowed) {
    const decision = evaluateRisk({ action: "unauthorized_download", authenticated: true, repeatedAccessViolations: 1, suspiciousAutomation: false });
    await recordRiskEvent({ action: "unauthorized_download", userId: user.id, metadata: { productId: params.productId, code: entitlementCheck.code }, decision });
    return NextResponse.json({ ok: false, code: entitlementCheck.code }, { status: 403 });
  }
  const assetResponse = await fetch(`${service.url}/rest/v1/audio_products?id=eq.${encodeURIComponent(params.productId)}&select=media_asset_id,name&limit=1`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null);
  const [product] = assetResponse?.ok ? await assetResponse.json() as Array<{ media_asset_id?: string; name?: string }> : [];
  const mediaResponse = product?.media_asset_id ? await fetch(`${service.url}/rest/v1/media_assets?id=eq.${encodeURIComponent(product.media_asset_id)}&processing_status=eq.READY&select=*&limit=1`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null) : null;
  const [asset] = mediaResponse?.ok ? await mediaResponse.json() as Array<Record<string, unknown>> : [];
  const entitlementResponse = await fetch(`${service.url}/rest/v1/purchase_entitlements?user_id=eq.${encodeURIComponent(user.id)}&product_id=eq.${encodeURIComponent(params.productId)}&revoked_at=is.null&select=id,order_item_id,download_count&limit=1`, { cache: "no-store", headers: serviceHeaders(service) });
  const [entitlement] = entitlementResponse.ok ? await entitlementResponse.json() as Array<{ id: string; order_item_id: string; download_count: number }> : [];
  if (!asset && !entitlement) return NextResponse.json({ ok: false, code: "ENTITLEMENT_REQUIRED" }, { status: 403 });
  let filePath = asset ? String(asset.ready_storage_path || asset.storage_path || "") : "";
  let bucket = asset ? String(asset.ready_storage_bucket || asset.storage_bucket || "private-digital") : "";
  let productName = asset ? String(product?.name || asset.display_name || asset.original_filename || "download") : "";
  let extension = asset ? String(asset.extension || "mp4") : "";
  if (!asset && entitlement) {
    const itemResponse = await fetch(`${service.url}/rest/v1/digital_order_items?id=eq.${entitlement.order_item_id}&select=file_path_snapshot,product_name_snapshot,file_extension_snapshot&limit=1`, { cache: "no-store", headers: serviceHeaders(service) });
    const [item] = itemResponse.ok ? await itemResponse.json() as Array<{ file_path_snapshot: string; product_name_snapshot: string; file_extension_snapshot: string }> : [];
    filePath = item?.file_path_snapshot || ""; bucket = process.env.AUDIO_PRODUCTS_BUCKET || "audio-products"; productName = item?.product_name_snapshot || "download"; extension = item?.file_extension_snapshot || "bin";
  }
  if (!filePath || filePath.includes("..")) return NextResponse.json({ ok: false, code: "FILE_UNAVAILABLE" }, { status: 404 });
  if (!storageAvailableForProduction()) return NextResponse.json({ ok: false, code: "STORAGE_NOT_CONFIGURED" }, { status: 503 });
  const signedUrl = await getObjectStorageProvider().getSignedUrl(filePath, 60, bucket, safeDownloadName(productName, extension));
  if (!signedUrl) return NextResponse.json({ ok: false, code: "DOWNLOAD_UNAVAILABLE" }, { status: 503 });
  await Promise.all([
    entitlement ? fetch(`${service.url}/rest/v1/purchase_entitlements?id=eq.${entitlement.id}`, { method: "PATCH", headers: serviceHeaders(service, "return=minimal"), body: JSON.stringify({ download_count: Number(entitlement.download_count || 0) + 1, last_downloaded_at: new Date().toISOString() }) }) : Promise.resolve(),
    fetch(`${service.url}/rest/v1/audio_store_audit_events`, { method: "POST", headers: serviceHeaders(service, "return=minimal"), body: JSON.stringify({ actor_user_id: user.id, event_type: "audio_download_issued", product_id: params.productId, metadata: { expiresIn: 60, mediaAssetId: product?.media_asset_id || null } }) }),
    recordMediaStorageEvent({ eventType: "SIGNED_DOWNLOAD_ISSUED", bucket, key: filePath, userId: user.id, metadata: { productId: params.productId, expiresIn: 60 } })
  ]).catch(() => undefined);
  return NextResponse.redirect(signedUrl, { status: 302 });
}
