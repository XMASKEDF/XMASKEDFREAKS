import type { ProductVariant, PurchaseProduct } from "@/lib/purchase/types";

export type MerchCategory = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  imageUrl: string | null;
  sortOrder: number;
  active: boolean;
  hidden: boolean;
  productCount?: number;
};

export type MerchLanguage = {
  id: string;
  code: string;
  label: string;
  nativeLabel: string;
  sortOrder: number;
  enabled: boolean;
  published: boolean;
};

export type MerchProduct = {
  id: string;
  slotNumber: number;
  name: string;
  shortDescription: string;
  fullDescription: string;
  categoryId: string;
  categoryName: string;
  coinPrice: number;
  priceMinor: number | null;
  shippingCostMinor: number;
  shippingMode: "manual" | "provider" | "free";
  fulfillmentType: "manual" | "printify";
  sku: string;
  imageUrl: string;
  secondaryImageUrl: string | null;
  additionalImageUrls: string[];
  inventoryQuantity: number;
  inventoryTracked: boolean;
  requiresSize: boolean;
  requiresShipping: true;
  internationalShippingAllowed: boolean;
  quantityLimit: number;
  lowStockThreshold: number;
  restockAt: string | null;
  restockNotificationsEnabled: boolean;
  showExactInventory: boolean;
  printifyProductId: string | null;
  printifyBlueprintId: number | null;
  printifyProviderId: number | null;
  fulfillmentEnabled: boolean;
  printifyLastSyncedAt: string | null;
  languageCodes: string[];
  weightGrams: number | null;
  dimensions: { length: number; width: number; height: number; unit: "cm" } | null;
  active: boolean;
  published: boolean;
  featured: boolean;
  sortOrder: number;
  variants: ProductVariant[];
};

export type CatalogCategory = "Merch" | "Audio" | "Video" | "Painting" | "News" | "Event" | "General";
export type CatalogEntry = {
  id: string;
  title: string;
  description: string;
  category: CatalogCategory;
  imageUrl: string;
  displayDate: string;
  destinationUrl: string | null;
  actionLabel: string | null;
  status: "draft" | "scheduled" | "published" | "expired" | "archived";
  pinned: boolean;
  sortOrder: number;
  publishAt: string | null;
  expiresAt: string | null;
};

export type CatalogSettings = {
  speedSeconds: number;
  paused: boolean;
};

export function merchPurchaseProduct(product: MerchProduct): PurchaseProduct {
  return {
    id: product.id,
    storeId: "merch",
    kind: "physical",
    name: product.name,
    description: product.shortDescription,
    fullDescription: product.fullDescription,
    coinPrice: product.coinPrice,
    thumbnailUrl: product.imageUrl,
    secondaryImageUrl: product.secondaryImageUrl,
    previewUrl: null,
    format: null,
    duration: null,
    active: product.active,
    published: product.published,
    purchased: false,
    allowRepurchase: true,
    quantity: 1,
    options: [],
    inventoryTracked: product.inventoryTracked,
    inventoryQuantity: product.inventoryQuantity,
    shippingRequired: true,
    internationalShippingAllowed: product.internationalShippingAllowed,
    taxCategory: "physical_general",
    categoryId: product.categoryId,
    categoryName: product.categoryName,
    sku: product.sku,
    variants: product.variants,
    requiresSize: product.requiresSize,
    lowStockThreshold: product.lowStockThreshold,
    restockAt: product.restockAt,
    restockNotificationsEnabled: product.restockNotificationsEnabled,
    showExactInventory: product.showExactInventory,
    printifyProductId: product.printifyProductId,
    fulfillmentEnabled: product.fulfillmentEnabled,
    languageCodes: product.languageCodes,
    maxQuantity: Math.min(product.quantityLimit, product.inventoryQuantity)
  };
}
