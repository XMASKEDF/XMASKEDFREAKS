import type { PaintingAuction } from "@/lib/auctions/types";
import type { PurchaseProduct } from "@/lib/purchase/types";

export type PaintingCartSource = PaintingAuction & { coinPrice: number; active: boolean; published: boolean };

export function toPaintingCartSource(auction: PaintingAuction): PaintingCartSource {
  return { ...auction, coinPrice: auction.buyNowPrice || auction.currentBid, active: auction.published, published: auction.published };
}

export function paintingPurchaseProduct(auction: PaintingCartSource): PurchaseProduct {
  const image = auction.images[auction.coverImageIndex] || auction.images[0] || "/branding/optimized/mask-logo-512.png";
  const buyNowAvailable = auction.buyNowPrice !== null && ["live", "extended"].includes(auction.status) && auction.published;
  return {
    id: auction.id,
    storeId: "paintings",
    kind: "physical",
    name: auction.title,
    description: auction.shortDescription,
    fullDescription: auction.fullDescription,
    coinPrice: auction.buyNowPrice || 0,
    thumbnailUrl: image,
    previewUrl: null,
    format: "Original painting",
    duration: null,
    active: buyNowAvailable,
    published: buyNowAvailable,
    purchased: ["sold", "fulfillment_pending", "shipped", "delivered"].includes(auction.status),
    allowRepurchase: false,
    quantity: 1,
    options: [],
    inventoryTracked: true,
    inventoryQuantity: buyNowAvailable ? 1 : 0,
    shippingRequired: true,
    internationalShippingAllowed: auction.internationalShippingAllowed,
    taxCategory: "original_art_physical",
    categoryId: "paintings",
    categoryName: "Paintings",
    sku: `PAINT-${auction.id.slice(0, 8).toUpperCase()}`,
    variants: [],
    requiresSize: false,
    maxQuantity: 1,
    fulfillmentEnabled: false,
    languageCodes: []
  };
}
