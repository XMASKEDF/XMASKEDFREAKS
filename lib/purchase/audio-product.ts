import type { AudioProduct } from "@/lib/audio-store/catalog";
import type { PurchaseProduct } from "@/lib/purchase/types";

export function audioPurchaseProduct(product: AudioProduct): PurchaseProduct {
  return {
    id: product.id,
    storeId: "audio-clips",
    kind: product.mediaType === "video" ? "digital_video" : "digital_audio",
    name: product.name,
    description: product.description,
    coinPrice: product.coinPrice,
    thumbnailUrl: product.thumbnailUrl,
    previewUrl: product.previewUrl,
    format: product.fileExtension?.toUpperCase() || null,
    duration: null,
    active: product.active,
    published: product.published,
    purchased: product.purchased === true,
    allowRepurchase: false,
    quantity: 1,
    options: [],
    inventoryTracked: false,
    shippingRequired: false,
    taxCategory: "digital_general"
  };
}
