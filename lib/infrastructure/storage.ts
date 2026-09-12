import { createHash, createHmac, randomUUID } from "node:crypto";
import type { ObjectMetadata, ProviderKind } from "./types";

export type StorageClass = "PUBLIC_MEDIA" | "PRIVATE_MEDIA" | "PRIVATE_DIGITAL" | "PROCESSING";
export type StorageHealthStatus = "NOT CONFIGURED" | "HEALTHY" | "DEGRADED" | "OFFLINE" | "ACTION REQUIRED";

export type StorageHealth = {
  provider: ProviderKind;
  status: StorageHealthStatus;
  detail: string;
  checkedAt: string;
  latencyMs?: number;
};

export type SignedUploadAuthorization = {
  provider: ProviderKind;
  bucket: string;
  key: string;
  uploadUrl: string;
  token: string;
  expiresAt: string;
  headers: Record<string, string>;
};

export type UploadInput = {
  key: string;
  bucket?: string;
  body: Uint8Array;
  originalFilename?: string;
  mimeType?: string;
  visibility?: "PUBLIC" | "PRIVATE";
  ownerId?: string | null;
  reference?: string | null;
};

export interface ObjectStorageProvider {
  readonly kind: ProviderKind;
  upload(input: UploadInput): Promise<ObjectMetadata>;
  download(key: string, bucket?: string): Promise<Uint8Array | null>;
  delete(key: string, bucket?: string): Promise<boolean>;
  exists(key: string, bucket?: string): Promise<boolean>;
  getMetadata(key: string, bucket?: string): Promise<ObjectMetadata | null>;
  getSignedUrl(key: string, expiresInSeconds?: number, bucket?: string, downloadName?: string): Promise<string | null>;
  copy(sourceKey: string, destinationKey: string, bucket?: string): Promise<ObjectMetadata | null>;
  copyToBucket?(sourceKey: string, destinationKey: string, sourceBucket: string, destinationBucket: string): Promise<ObjectMetadata | null>;
  list(prefix?: string, bucket?: string): Promise<ObjectMetadata[]>;
  authorizeUpload?(input: { key: string; bucket?: string; mimeType: string; size: number; expiresInSeconds?: number }): Promise<SignedUploadAuthorization | null>;
  publicUrl?(key: string, bucket?: string, version?: string): string | null;
  health(): Promise<StorageHealth>;
}

export function safeObjectKey(key: string) {
  return key.split("/").filter((segment) => segment && segment !== "." && segment !== "..").map((segment) => segment.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 120)).filter(Boolean).join("/").slice(0, 500);
}

export function safeStorageBucket(bucket: string) {
  return bucket.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 63);
}

export function storageBuckets() {
  return {
    publicMedia: safeStorageBucket(process.env.PUBLIC_MEDIA_BUCKET || "public-media"),
    privateMedia: safeStorageBucket(process.env.PRIVATE_MEDIA_BUCKET || "media"),
    privateDigital: safeStorageBucket(process.env.PRIVATE_DIGITAL_BUCKET || "private-digital"),
    processing: safeStorageBucket(process.env.PROCESSING_MEDIA_BUCKET || "media-processing")
} as const;
}

export function isPublicStorageBucket(bucket: string) {
  const normalized = safeStorageBucket(bucket);
  return [storageBuckets().publicMedia, "game-assets", "game-thumbnails"].includes(normalized);
}

export function bucketForStorageClass(storageClass: StorageClass) {
  const buckets = storageBuckets();
  return storageClass === "PUBLIC_MEDIA" ? buckets.publicMedia : storageClass === "PRIVATE_DIGITAL" ? buckets.privateDigital : storageClass === "PROCESSING" ? buckets.processing : buckets.privateMedia;
}

function checksum(body: Uint8Array) { return createHash("sha256").update(body).digest("hex"); }

function metadataFor(input: UploadInput, provider: ProviderKind, key: string, body: Uint8Array, processingStatus: ObjectMetadata["processingStatus"]): ObjectMetadata {
  return {
    objectId: randomUUID(), provider, bucket: input.bucket || storageBuckets().privateMedia, key, originalFilename: input.originalFilename || key.split("/").pop() || key,
    mimeType: input.mimeType || "application/octet-stream", size: body.byteLength, checksum: checksum(body),
    createdAt: new Date().toISOString(), visibility: input.visibility || "PRIVATE", ownerId: input.ownerId || null,
    reference: input.reference || null, processingStatus
  };
}

export class LocalObjectStorageProvider implements ObjectStorageProvider {
  readonly kind = "LOCAL" as const;
  private readonly objects = new Map<string, { metadata: ObjectMetadata; body: Uint8Array }>();

  private objectKey(bucket: string | undefined, key: string) {
    return `${safeStorageBucket(bucket || storageBuckets().privateMedia)}:${safeObjectKey(key)}`;
  }

  async upload(input: UploadInput) {
    const bucket = safeStorageBucket(input.bucket || storageBuckets().privateMedia);
    const baseKey = safeObjectKey(input.key);
    const body = new Uint8Array(input.body);
    const objectKey = this.objectKey(bucket, baseKey);
    const existing = this.objects.get(objectKey);
    const key = existing && existing.metadata.checksum !== checksum(body) ? `${baseKey.replace(/\/?$/, "")}/${randomUUID()}` : baseKey;
    const metadata = metadataFor({ ...input, bucket }, this.kind, key, body, input.visibility === "PUBLIC" ? "SAFE" : "QUARANTINED");
    this.objects.set(this.objectKey(bucket, key), { metadata, body });
    return metadata;
  }

  async download(key: string, bucket?: string) { return this.objects.get(this.objectKey(bucket, key))?.body || null; }
  async delete(key: string, bucket?: string) { return this.objects.delete(this.objectKey(bucket, key)); }
  async exists(key: string, bucket?: string) { return this.objects.has(this.objectKey(bucket, key)); }
  async getMetadata(key: string, bucket?: string) { return this.objects.get(this.objectKey(bucket, key))?.metadata || null; }
  async getSignedUrl(key: string, expiresInSeconds = 300, bucket?: string, downloadName?: string) {
    const object = this.objects.get(this.objectKey(bucket, key));
    if (!object) return null;
    if (object.metadata.visibility === "PUBLIC") return this.publicUrl(object.metadata.key, object.metadata.bucket);
    const expires = Math.floor(Date.now() / 1000) + Math.max(1, expiresInSeconds);
    const safeName = downloadName?.replace(/["\\]/g, "").slice(0, 180) || "";
    const payload = `${object.metadata.bucket}:${object.metadata.key}:${expires}:${safeName}`;
    const signature = createHmac("sha256", process.env.SIGNED_DOWNLOAD_SECRET || "local-development-only").update(payload).digest("hex");
    return `/api/media/signed?bucket=${encodeURIComponent(object.metadata.bucket)}&key=${encodeURIComponent(object.metadata.key)}&expires=${expires}&signature=${signature}${safeName ? `&download=${encodeURIComponent(safeName)}` : ""}`;
  }
  publicUrl(key: string, bucket?: string, version?: string) { return `/assets/${encodeURIComponent(bucket || storageBuckets().privateMedia)}/${encodeURIComponent(safeObjectKey(key))}${version ? `?v=${encodeURIComponent(version)}` : ""}`; }
  async copy(sourceKey: string, destinationKey: string, bucket?: string) {
    const source = this.objects.get(this.objectKey(bucket, sourceKey));
    if (!source) return null;
    return this.upload({ bucket: source.metadata.bucket, key: destinationKey, body: source.body, originalFilename: source.metadata.originalFilename, mimeType: source.metadata.mimeType, visibility: source.metadata.visibility, ownerId: source.metadata.ownerId, reference: source.metadata.reference });
  }
  async copyToBucket(sourceKey: string, destinationKey: string, sourceBucket: string, destinationBucket: string) {
    const source = this.objects.get(this.objectKey(sourceBucket, sourceKey));
    if (!source) return null;
    const destinationKeyValue = safeObjectKey(destinationKey);
    const destinationObjectKey = this.objectKey(destinationBucket, destinationKeyValue);
    const existing = this.objects.get(destinationObjectKey);
    if (existing && existing.metadata.checksum === source.metadata.checksum) return existing.metadata;
    const metadata = metadataFor({ bucket: safeStorageBucket(destinationBucket), key: destinationKeyValue, body: source.body, originalFilename: source.metadata.originalFilename, mimeType: source.metadata.mimeType, visibility: "PUBLIC", ownerId: source.metadata.ownerId, reference: source.metadata.reference }, this.kind, destinationKeyValue, source.body, "SAFE");
    this.objects.set(destinationObjectKey, { metadata, body: new Uint8Array(source.body) });
    return metadata;
  }
  async list(prefix = "", bucket?: string) { return [...this.objects.values()].map((item) => item.metadata).filter((item) => (!bucket || item.bucket === safeStorageBucket(bucket)) && item.key.startsWith(safeObjectKey(prefix))); }
  async health(): Promise<StorageHealth> { return { provider: this.kind, status: "HEALTHY", detail: "Local object storage is available for development only.", checkedAt: new Date().toISOString() }; }
}

type S3Config = { endpoint: URL; bucket: string; accessKey: string; secretKey: string; region: string; publicBaseUrl: string | null };

function s3Config(): S3Config | null {
  const endpoint = process.env.STORAGE_ENDPOINT;
  const bucket = process.env.STORAGE_BUCKET;
  const accessKey = process.env.STORAGE_ACCESS_KEY;
  const secretKey = process.env.STORAGE_SECRET_KEY;
  if (!endpoint || !bucket || !accessKey || !secretKey) return null;
  try { return { endpoint: new URL(endpoint), bucket: safeObjectKey(bucket), accessKey, secretKey, region: process.env.STORAGE_REGION || "auto", publicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL?.replace(/\/$/, "") || null }; } catch { return null; }
}

function hmac(key: string | Uint8Array, value: string) { return createHmac("sha256", key).update(value).digest(); }
function hash(value: string | Uint8Array) { return createHash("sha256").update(value).digest("hex"); }
function encodedKey(key: string) { return safeObjectKey(key).split("/").map(encodeURIComponent).join("/"); }

export class S3CompatibleObjectStorageProvider implements ObjectStorageProvider {
  readonly kind = "S3_COMPATIBLE" as const;
  constructor(private readonly config: S3Config) {}

  private url(key = "", query: Record<string, string> = {}, bucket?: string) {
    const url = new URL(this.config.endpoint.toString());
    const root = url.pathname.replace(/\/$/, "");
    url.pathname = `${root}/${encodeURIComponent(safeStorageBucket(bucket || this.config.bucket))}${key ? `/${encodedKey(key)}` : ""}`;
    Object.entries(query).sort(([left], [right]) => left.localeCompare(right)).forEach(([name, value]) => url.searchParams.set(name, value));
    return url;
  }

  private async request(method: string, key: string, body?: Uint8Array, headers: Record<string, string> = {}, query: Record<string, string> = {}, bucket?: string) {
    const url = this.url(key, query, bucket);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = body ? hash(body) : hash("");
    const host = url.host;
    const signedHeaders: Record<string, string> = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate, ...Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value.trim()])) };
    const canonicalHeaders = Object.keys(signedHeaders).sort().map((name) => `${name}:${signedHeaders[name]}\n`).join("");
    const signedHeaderNames = Object.keys(signedHeaders).sort().join(";");
    const canonicalQuery = [...url.searchParams.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`).join("&");
    const canonicalRequest = [method, url.pathname, canonicalQuery, canonicalHeaders, signedHeaderNames, payloadHash].join("\n");
    const scope = `${dateStamp}/${this.config.region}/s3/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, hash(canonicalRequest)].join("\n");
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${this.config.secretKey}`, dateStamp), this.config.region), "s3"), "aws4_request");
    const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
    const authorization = `AWS4-HMAC-SHA256 Credential=${this.config.accessKey}/${scope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`;
    return fetch(url, { method, headers: { ...headers, host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate, authorization }, body: body ? Buffer.from(body) : undefined });
  }

  async upload(input: UploadInput) {
    const bucket = safeStorageBucket(input.bucket || this.config.bucket);
    const key = safeObjectKey(input.key);
    const body = new Uint8Array(input.body);
    const response = await this.request("PUT", key, body, { "content-type": input.mimeType || "application/octet-stream", "x-amz-meta-checksum": checksum(body) }, {}, bucket);
    if (!response.ok) throw new Error(`Object storage upload failed (${response.status}).`);
    return metadataFor({ ...input, bucket }, this.kind, key, body, "QUARANTINED");
  }

  async download(key: string, bucket?: string) { const response = await this.request("GET", key, undefined, {}, {}, bucket).catch(() => null); return response?.ok ? new Uint8Array(await response.arrayBuffer()) : null; }
  async delete(key: string, bucket?: string) { const response = await this.request("DELETE", key, undefined, {}, {}, bucket).catch(() => null); return Boolean(response?.ok || response?.status === 404); }
  async exists(key: string, bucket?: string) { const response = await this.request("HEAD", key, undefined, {}, {}, bucket).catch(() => null); return Boolean(response?.ok); }
  async getMetadata(key: string, bucket?: string) {
    const resolvedBucket = safeStorageBucket(bucket || this.config.bucket);
    const response = await this.request("HEAD", key, undefined, {}, {}, resolvedBucket).catch(() => null);
    if (!response?.ok) return null;
    return { objectId: createHash("sha256").update(`${resolvedBucket}:${safeObjectKey(key)}`).digest("hex").slice(0, 32), provider: this.kind, bucket: resolvedBucket, key: safeObjectKey(key), originalFilename: safeObjectKey(key).split("/").pop() || safeObjectKey(key), mimeType: response.headers.get("content-type") || "application/octet-stream", size: Number(response.headers.get("content-length") || 0), checksum: response.headers.get("x-amz-meta-checksum") || "UNVERIFIED", createdAt: response.headers.get("last-modified") || new Date().toISOString(), visibility: "PRIVATE", ownerId: null, reference: null, processingStatus: "QUARANTINED" } satisfies ObjectMetadata;
  }

  async getSignedUrl(key: string, expiresInSeconds = 300, bucket?: string, downloadName?: string) {
    const resolvedBucket = safeStorageBucket(bucket || this.config.bucket);
    const url = this.url(key, {}, resolvedBucket);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const scope = `${dateStamp}/${this.config.region}/s3/aws4_request`;
    const params = { "X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": `${this.config.accessKey}/${scope}`, "X-Amz-Date": amzDate, "X-Amz-Expires": String(Math.max(1, Math.min(604800, expiresInSeconds))), "X-Amz-SignedHeaders": "host", ...(downloadName ? { "response-content-disposition": `attachment; filename=\"${downloadName.replace(/[\"\\]/g, "")}\"` } : {}) };
    Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, value));
    const canonicalQuery = [...url.searchParams.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`).join("&");
    const canonicalRequest = ["GET", url.pathname, canonicalQuery, `host:${url.host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${this.config.secretKey}`, dateStamp), this.config.region), "s3"), "aws4_request");
    url.searchParams.set("X-Amz-Signature", createHmac("sha256", signingKey).update(["AWS4-HMAC-SHA256", amzDate, scope, hash(canonicalRequest)].join("\n")).digest("hex"));
    return url.toString();
  }

  publicUrl(key: string, bucket?: string, version?: string) {
    if (!this.config.publicBaseUrl) return null;
    return `${this.config.publicBaseUrl}/${encodeURIComponent(safeStorageBucket(bucket || this.config.bucket))}/${encodedKey(key)}${version ? `?v=${encodeURIComponent(version)}` : ""}`;
  }
  async copy(sourceKey: string, destinationKey: string, bucket?: string) {
    const resolvedBucket = safeStorageBucket(bucket || this.config.bucket);
    const response = await this.request("PUT", destinationKey, undefined, { "x-amz-copy-source": `/${resolvedBucket}/${encodedKey(sourceKey)}` }, {}, resolvedBucket).catch(() => null);
    if (!response?.ok) return null;
    return this.getMetadata(destinationKey, resolvedBucket);
  }
  async copyToBucket(sourceKey: string, destinationKey: string, sourceBucket: string, destinationBucket: string) {
    const source = safeStorageBucket(sourceBucket || this.config.bucket);
    const destination = safeStorageBucket(destinationBucket || this.config.bucket);
    const response = await this.request("PUT", destinationKey, undefined, { "x-amz-copy-source": `/${source}/${encodedKey(sourceKey)}` }, {}, destination).catch(() => null);
    if (!response?.ok) return null;
    return this.getMetadata(destinationKey, destination);
  }

  async list(prefix = "", bucket?: string) {
    const resolvedBucket = safeStorageBucket(bucket || this.config.bucket);
    const response = await this.request("GET", "", undefined, {}, { "list-type": "2", prefix: safeObjectKey(prefix) }, resolvedBucket).catch(() => null);
    if (!response?.ok) return [];
    const xml = await response.text();
    return [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map((match) => {
      const block = match[1];
      const value = (tag: string) => block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] || "";
      const key = safeObjectKey(value("Key"));
      return { objectId: createHash("sha256").update(`${resolvedBucket}:${key}`).digest("hex").slice(0, 32), provider: this.kind, bucket: resolvedBucket, key, originalFilename: key.split("/").pop() || key, mimeType: "application/octet-stream", size: Number(value("Size") || 0), checksum: value("ETag").replaceAll('"', "") || "UNVERIFIED", createdAt: value("LastModified") || new Date().toISOString(), visibility: "PRIVATE", ownerId: null, reference: null, processingStatus: "QUARANTINED" } satisfies ObjectMetadata;
    });
  }
  async health(): Promise<StorageHealth> {
    const response = await this.request("HEAD", "").catch(() => null);
    return { provider: this.kind, status: response?.ok ? "HEALTHY" : "DEGRADED", detail: response?.ok ? "S3-compatible storage responded to a read-only health check." : "S3-compatible storage credentials are configured but the read-only health check failed.", checkedAt: new Date().toISOString() };
  }
}

type SupabaseStorageConfig = { url: string; serviceKey: string };

function supabaseStorageConfig(): SupabaseStorageConfig | null {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !serviceKey || url.includes("your-project") || serviceKey.startsWith("replace-")) return null;
  return { url, serviceKey };
}

export class SupabaseObjectStorageProvider implements ObjectStorageProvider {
  readonly kind = "SUPABASE" as const;
  constructor(private readonly config: SupabaseStorageConfig) {}

  private bucket(bucket?: string) { return safeStorageBucket(bucket || storageBuckets().privateMedia); }
  private objectUrl(bucket: string, key: string) { return `${this.config.url}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedKey(key)}`; }
  private headers(extra: Record<string, string> = {}) { return { apikey: this.config.serviceKey, authorization: `Bearer ${this.config.serviceKey}`, ...extra }; }
  private async request(url: string, init: RequestInit = {}) { return fetch(url, { ...init, headers: this.headers({ ...(init.headers as Record<string, string> || {}) }) }); }

  async upload(input: UploadInput) {
    const bucket = this.bucket(input.bucket);
    const key = safeObjectKey(input.key);
    const body = new Uint8Array(input.body);
    const response = await this.request(this.objectUrl(bucket, key), { method: "POST", headers: { "content-type": input.mimeType || "application/octet-stream", "x-upsert": "false", "cache-control": input.visibility === "PUBLIC" ? "public,max-age=31536000,immutable" : "private,no-store" }, body: Buffer.from(body) });
    if (!response.ok) throw new Error(`Supabase Storage upload failed (${response.status}).`);
    return metadataFor({ ...input, bucket }, this.kind, key, body, input.visibility === "PUBLIC" ? "SAFE" : "QUARANTINED");
  }

  async authorizeUpload(input: { key: string; bucket?: string; mimeType: string; size: number; expiresInSeconds?: number }) {
    const bucket = this.bucket(input.bucket);
    const key = safeObjectKey(input.key);
    const response = await this.request(`${this.config.url}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${encodedKey(key)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expiresIn: Math.max(60, Math.min(3600, input.expiresInSeconds || 600)) }) });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => ({})) as { token?: unknown; signedToken?: unknown; url?: unknown; signedUrl?: unknown };
    const token = String(payload.token || payload.signedToken || "");
    if (!token) return null;
    const suppliedUrl = String(payload.url || payload.signedUrl || "");
    const uploadUrl = suppliedUrl.startsWith("http") ? suppliedUrl : `${this.config.url}/storage/v1/upload/sign/${encodeURIComponent(token)}`;
    return { provider: this.kind, bucket, key, uploadUrl, token, expiresAt: new Date(Date.now() + Math.max(60, Math.min(3600, input.expiresInSeconds || 600)) * 1000).toISOString(), headers: { "content-type": input.mimeType, "x-upsert": "false", "x-upload-size": String(input.size) } } satisfies SignedUploadAuthorization;
  }

  async download(key: string, bucket?: string) { const response = await this.request(this.objectUrl(this.bucket(bucket), key)).catch(() => null); return response?.ok ? new Uint8Array(await response.arrayBuffer()) : null; }
  async delete(key: string, bucket?: string) { const response = await this.request(`${this.config.url}/storage/v1/object/${encodeURIComponent(this.bucket(bucket))}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ prefixes: [safeObjectKey(key)] }) }).catch(() => null); return Boolean(response?.ok || response?.status === 404); }
  async exists(key: string, bucket?: string) { const response = await this.request(this.objectUrl(this.bucket(bucket), key), { method: "HEAD" }).catch(() => null); return Boolean(response?.ok); }
  async getMetadata(key: string, bucket?: string) {
    const resolvedBucket = this.bucket(bucket); const resolvedKey = safeObjectKey(key);
    const response = await this.request(this.objectUrl(resolvedBucket, resolvedKey), { method: "HEAD" }).catch(() => null);
    if (!response?.ok) return null;
    return { objectId: createHash("sha256").update(`${resolvedBucket}:${resolvedKey}`).digest("hex").slice(0, 32), provider: this.kind, bucket: resolvedBucket, key: resolvedKey, originalFilename: resolvedKey.split("/").pop() || resolvedKey, mimeType: response.headers.get("content-type") || "application/octet-stream", size: Number(response.headers.get("content-length") || 0), checksum: response.headers.get("x-amz-meta-checksum") || response.headers.get("etag")?.replaceAll('"', "") || "UNVERIFIED", createdAt: response.headers.get("last-modified") || new Date().toISOString(), visibility: isPublicStorageBucket(resolvedBucket) ? "PUBLIC" : "PRIVATE", ownerId: null, reference: null, processingStatus: "QUARANTINED" } satisfies ObjectMetadata;
  }

  async getSignedUrl(key: string, expiresInSeconds = 300, bucket?: string, downloadName?: string) {
    const resolvedBucket = this.bucket(bucket); const resolvedKey = safeObjectKey(key); const ttl = Math.max(1, Math.min(604800, expiresInSeconds));
    const response = await this.request(`${this.config.url}/storage/v1/object/sign/${encodeURIComponent(resolvedBucket)}/${encodedKey(resolvedKey)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expiresIn: ttl, ...(downloadName ? { download: downloadName.replace(/[\"\\]/g, "").slice(0, 180) } : {}) }) }).catch(() => null);
    if (!response?.ok) return null;
    const payload = await response.json().catch(() => ({})) as { signedURL?: unknown; signedUrl?: unknown; url?: unknown };
    const path = String(payload.signedURL || payload.signedUrl || payload.url || "");
    return path ? path.startsWith("http") ? path : `${this.config.url}/storage/v1${path.startsWith("/") ? path : `/${path}`}` : null;
  }

  publicUrl(key: string, bucket?: string, version?: string) {
    const resolvedBucket = this.bucket(bucket); const suffix = version ? `?v=${encodeURIComponent(version)}` : "";
    return isPublicStorageBucket(resolvedBucket) ? `${this.config.url}/storage/v1/object/public/${encodeURIComponent(resolvedBucket)}/${encodedKey(key)}${suffix}` : null;
  }

  async copy(sourceKey: string, destinationKey: string, bucket?: string) {
    const resolvedBucket = this.bucket(bucket); const response = await this.request(`${this.config.url}/storage/v1/object/copy`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bucketId: resolvedBucket, sourceKey: safeObjectKey(sourceKey), destinationKey: safeObjectKey(destinationKey) }) }).catch(() => null);
    return response?.ok ? this.getMetadata(destinationKey, resolvedBucket) : null;
  }

  async copyToBucket(sourceKey: string, destinationKey: string, sourceBucket: string, destinationBucket: string) {
    const source = await this.download(sourceKey, sourceBucket);
    if (!source) return null;
    return this.upload({ bucket: destinationBucket, key: destinationKey, body: source, mimeType: "application/octet-stream", visibility: "PUBLIC" });
  }

  async list(prefix = "", bucket?: string) {
    const resolvedBucket = this.bucket(bucket); const response = await this.request(`${this.config.url}/storage/v1/object/list/${encodeURIComponent(resolvedBucket)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prefix: safeObjectKey(prefix), limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } }) }).catch(() => null);
    if (!response?.ok) return [];
    const rows = await response.json().catch(() => []) as Array<Record<string, unknown>>;
    return rows.filter((row) => row.name).map((row) => { const key = safeObjectKey(`${String(row.name)}`); return { objectId: createHash("sha256").update(`${resolvedBucket}:${key}`).digest("hex").slice(0, 32), provider: this.kind, bucket: resolvedBucket, key, originalFilename: key.split("/").pop() || key, mimeType: String(row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>).mimetype || "application/octet-stream" : "application/octet-stream"), size: Number(row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>).size || 0 : 0), checksum: String(row.eTag || "UNVERIFIED"), createdAt: String(row.created_at || new Date().toISOString()), visibility: isPublicStorageBucket(resolvedBucket) ? "PUBLIC" : "PRIVATE", processingStatus: "QUARANTINED" } satisfies ObjectMetadata; });
  }

  async health(): Promise<StorageHealth> {
    const started = Date.now(); const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await this.request(`${this.config.url}/storage/v1/bucket`, { signal: controller.signal });
      return { provider: this.kind, status: response.ok ? "HEALTHY" : response.status === 401 || response.status === 403 ? "ACTION REQUIRED" : "DEGRADED", detail: response.ok ? "Supabase Storage responded to a read-only bucket check." : "Supabase Storage credentials or bucket access require review.", checkedAt: new Date().toISOString(), latencyMs: Date.now() - started };
    } catch { return { provider: this.kind, status: "OFFLINE", detail: "Supabase Storage did not respond to its read-only health check.", checkedAt: new Date().toISOString(), latencyMs: Date.now() - started }; } finally { clearTimeout(timer); }
  }
}

let storage: ObjectStorageProvider | null = null;
export function getObjectStorageProvider(): ObjectStorageProvider {
  if (storage) return storage;
  const external = s3Config();
  const supabase = supabaseStorageConfig();
  const requested = String(process.env.STORAGE_PROVIDER || (supabase ? "SUPABASE" : "LOCAL")).toUpperCase();
  storage = requested === "SUPABASE" && supabase ? new SupabaseObjectStorageProvider(supabase) : external && ["S3_COMPATIBLE", "CLOUDFLARE", "AWS", "CUSTOM"].includes(requested) ? new S3CompatibleObjectStorageProvider(external) : new LocalObjectStorageProvider();
  return storage;
}

export function resetObjectStorageProviderForTests() { storage = null; }

export function storageAvailableForProduction() {
  const environment = String(process.env.XMF_ENVIRONMENT || process.env.APP_ENV || "LOCAL").toUpperCase();
  return environment !== "PRODUCTION" || getObjectStorageProvider().kind !== "LOCAL";
}
