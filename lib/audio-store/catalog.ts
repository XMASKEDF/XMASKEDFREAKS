import { serviceCredentials, serviceHeaders } from "@/lib/api-user";

export type AudioProduct = {
  id: string;
  slotNumber: number;
  name: string;
  description: string;
  coinPrice: number;
  thumbnailUrl: string;
  previewUrl: string | null;
  mediaType: "audio" | "video";
  mimeType: string | null;
  fileExtension: "mp3" | "m4a" | "wav" | "aac" | "mp4" | null;
  fileSize: number | null;
  originalFilename: string | null;
  active: boolean;
  published: boolean;
  purchased?: boolean;
};

export type AudioProductRecord = AudioProduct & {
  thumbnailPath: string | null;
  productFilePath: string | null;
  previewFilePath: string | null;
  previewMimeType: string | null;
  previewExtension: string | null;
  previewFileSize: number | null;
  allowRepurchase: boolean;
};

const fallbackProducts: AudioProductRecord[] = Array.from({ length: 6 }, (_, index) => ({
  id: `00000000-0000-4000-8000-00000000000${index + 1}`,
  slotNumber: index + 1,
  name: `Audio experience ${String(index + 1).padStart(2, "0")}`,
  description: "This downloadable product is being prepared by XMASKEDFREAKS.",
  coinPrice: 25,
  thumbnailUrl: "/assets/preview-04.svg",
  previewUrl: null,
  mediaType: "audio",
  mimeType: null,
  fileExtension: null,
  fileSize: null,
  originalFilename: null,
  active: false,
  published: false,
  thumbnailPath: null,
  productFilePath: null,
  previewFilePath: null,
  previewMimeType: null,
  previewExtension: null,
  previewFileSize: null,
  allowRepurchase: false
}));

function mapRecord(row: Record<string, unknown>): AudioProductRecord {
  const id = String(row.id);
  return {
    id,
    slotNumber: Number(row.slot_number),
    name: String(row.name || ""),
    description: String(row.description || ""),
    coinPrice: Number(row.coin_price || 0),
    thumbnailUrl: row.thumbnail_path ? `/api/audio-clips/${id}/thumbnail` : "/assets/preview-04.svg",
    previewUrl: row.preview_file_path ? `/api/audio-clips/${id}/preview` : null,
    mediaType: row.media_type === "video" ? "video" : "audio",
    mimeType: row.mime_type ? String(row.mime_type) : null,
    fileExtension: row.file_extension as AudioProductRecord["fileExtension"],
    fileSize: row.file_size ? Number(row.file_size) : null,
    originalFilename: row.original_filename ? String(row.original_filename) : null,
    active: row.is_active === true,
    published: row.is_published === true,
    thumbnailPath: row.thumbnail_path ? String(row.thumbnail_path) : null,
    productFilePath: row.product_file_path ? String(row.product_file_path) : null,
    previewFilePath: row.preview_file_path ? String(row.preview_file_path) : null,
    previewMimeType: row.preview_mime_type ? String(row.preview_mime_type) : null,
    previewExtension: row.preview_extension ? String(row.preview_extension) : null,
    previewFileSize: row.preview_file_size ? Number(row.preview_file_size) : null,
    allowRepurchase: row.allow_repurchase === true
  };
}

export async function getAudioProducts(includeUnpublished = false) {
  const service = serviceCredentials();
  if (!service) return fallbackProducts;
  const filter = includeUnpublished ? "" : "&is_active=eq.true&is_published=eq.true";
  const requestOptions = includeUnpublished ? { cache: "no-store" as const } : { next: { revalidate: 30, tags: ["public:audio-clips"] } };
  const response = await fetch(`${service.url}/rest/v1/audio_products?select=*&order=slot_number.asc${filter}`, {
    ...requestOptions,
    headers: serviceHeaders(service)
  }).catch(() => null);
  if (!response?.ok) return fallbackProducts;
  const rows = await response.json() as Record<string, unknown>[];
  const mapped = rows.map(mapRecord);
  if (!includeUnpublished) {
    const bySlot = new Map(mapped.map((product) => [product.slotNumber, product]));
    return fallbackProducts.map((fallback) => bySlot.get(fallback.slotNumber) || fallback);
  }
  const bySlot = new Map(mapped.map((product) => [product.slotNumber, product]));
  return fallbackProducts.map((fallback) => bySlot.get(fallback.slotNumber) || fallback);
}

export async function findAudioProduct(id: string) {
  const products = await getAudioProducts(true);
  return products.find((product) => product.id === id) || null;
}

export function publicAudioProduct(product: AudioProductRecord, purchased = false): AudioProduct {
  return {
    id: product.id,
    slotNumber: product.slotNumber,
    name: product.name,
    description: product.description,
    coinPrice: product.coinPrice,
    thumbnailUrl: product.thumbnailUrl,
    previewUrl: product.previewUrl,
    mediaType: product.mediaType,
    mimeType: product.mimeType,
    fileExtension: product.fileExtension,
    fileSize: product.fileSize,
    originalFilename: product.originalFilename,
    active: product.active,
    published: product.published,
    purchased
  };
}
