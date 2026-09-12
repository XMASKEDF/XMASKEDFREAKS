import type { AssetDeliveryProvider } from "./provider-interfaces";
import { getObjectStorageProvider, safeObjectKey } from "./storage";

export class LocalAssetDeliveryProvider implements AssetDeliveryProvider {
  readonly kind = "LOCAL" as const;
  publicUrl(key: string, version?: string) { const base = process.env.CDN_PUBLIC_BASE_URL?.replace(/\/$/, "") || ""; const suffix = version ? `?v=${encodeURIComponent(version)}` : ""; return `${base}/assets/${encodeURIComponent(key)}${suffix}`; }
  async privateUrl(key: string, expiresInSeconds = 300) { return getObjectStorageProvider().getSignedUrl(key, expiresInSeconds); }
  async invalidate(keys: string[]) { return { accepted: true, detail: `Local delivery has no remote cache; ${keys.length} key(s) will resolve from the current origin.` }; }
}

export class CdnAssetDeliveryProvider implements AssetDeliveryProvider {
  readonly kind = "CLOUDFLARE" as const;
  constructor(private readonly baseUrl: string) {}
  publicUrl(key: string, version?: string) { const suffix = version ? `?v=${encodeURIComponent(version)}` : ""; return `${this.baseUrl}/${safeObjectKey(key).split("/").map(encodeURIComponent).join("/")}${suffix}`; }
  async privateUrl(key: string, expiresInSeconds = 300) { return getObjectStorageProvider().getSignedUrl(key, expiresInSeconds); }
  async invalidate(keys: string[]) {
    const purgeUrl = process.env.CDN_PURGE_URL;
    const purgeToken = process.env.CDN_PURGE_TOKEN;
    if (!purgeUrl || !purgeToken) return { accepted: false, detail: "CDN is configured, but an approved targeted purge endpoint is not configured." };
    const response = await fetch(purgeUrl, { method: "POST", headers: { authorization: `Bearer ${purgeToken}`, "content-type": "application/json" }, body: JSON.stringify({ keys: keys.slice(0, 100).map((key) => this.publicUrl(key)) }) }).catch(() => null);
    return response?.ok ? { accepted: true, detail: `${Math.min(keys.length, 100)} asset key(s) queued for targeted invalidation.` } : { accepted: false, detail: "The targeted CDN invalidation request failed." };
  }
}

let delivery: AssetDeliveryProvider | null = null;
export function getAssetDeliveryProvider() {
  if (delivery) return delivery;
  const baseUrl = process.env.CDN_PUBLIC_BASE_URL?.replace(/\/$/, "");
  delivery = baseUrl && ["CLOUDFLARE", "CDN", "CUSTOM"].includes(String(process.env.CDN_PROVIDER || "").toUpperCase()) ? new CdnAssetDeliveryProvider(baseUrl) : new LocalAssetDeliveryProvider();
  return delivery;
}
