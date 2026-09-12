export type ProductKind = "digital_audio" | "digital_video" | "download" | "physical" | "subscription";

export type ProductOption = {
  id: string;
  name: string;
  value: string;
};

export type ProductVariant = {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  style: string | null;
  fit: string | null;
  material: string | null;
  packQuantity: number | null;
  inventoryQuantity: number;
  coinPrice: number | null;
  imageUrl: string | null;
  active: boolean;
  printifyVariantId: number | null;
  providerSku: string | null;
  fulfillmentAvailable: boolean;
  productionCostMinor: number | null;
  printifyLastSyncedAt: string | null;
};

export type PurchaseQuote = {
  id: string;
  merchandiseCents: number;
  merchandiseCoins: number;
  shippingCents: number;
  shippingCoins: number;
  taxCents: number;
  taxCoins: number;
  totalCents: number;
  totalCoins: number;
  coinValueCents: 50;
  roundingAdjustmentCents: number;
  shippingMethod: string;
  shippingProvider: string;
  taxProvider: string;
  expiresAt: string;
};

export type CartLine = {
  id: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  options: ProductOption[];
};

export type ShippingAddress = {
  fullName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  phone: string;
  instructions: string;
};

export type PurchaseProduct = {
  id: string;
  storeId: string;
  kind: ProductKind;
  name: string;
  description: string;
  coinPrice: number;
  thumbnailUrl: string;
  previewUrl: string | null;
  format: string | null;
  duration: string | null;
  active: boolean;
  published: boolean;
  purchased: boolean;
  allowRepurchase: boolean;
  quantity: number;
  options: ProductOption[];
  inventoryTracked: boolean;
  shippingRequired: boolean;
  taxCategory: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  fullDescription?: string;
  sku?: string | null;
  variants?: ProductVariant[];
  requiresSize?: boolean;
  internationalShippingAllowed?: boolean;
  inventoryQuantity?: number;
  lowStockThreshold?: number;
  restockAt?: string | null;
  restockNotificationsEnabled?: boolean;
  showExactInventory?: boolean;
  maxQuantity?: number;
  secondaryImageUrl?: string | null;
  languageCodes?: string[];
  fulfillmentEnabled?: boolean;
  printifyProductId?: string | null;
  cartLineId?: string;
  variantId?: string | null;
};

export type PurchaseRecord = {
  entitlementId: string;
  productId: string;
  productName: string;
  fileExtension: string;
  grantedAt: string;
  downloadCount: number;
  orderId: string;
  orderCreatedAt: string;
};

export type PurchaseServerState<TProduct> = {
  products: TProduct[];
  cartProducts?: PurchaseProduct[];
  authenticated: boolean;
  tokenBalance: number | null;
  cartProductIds: string[];
  cartLines?: CartLine[];
  purchases: PurchaseRecord[];
};

export type PurchaseSummary = {
  itemCount: number;
  subtotal: number;
  discount: number;
  tax: number;
  shipping: number;
  merchandiseCents: number | null;
  shippingCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  quoteReady: boolean;
  quoteExpiresAt: string | null;
  total: number;
  balance: number | null;
  remainingBalance: number | null;
  shortage: number;
  canOpenCheckout: boolean;
  canCheckout: boolean;
  requiresShipping: boolean;
  physicalItemCount: number;
  digitalItemCount: number;
};

export type PurchaseResult = {
  orderId: string;
  itemCount: number;
  totalCoins: number;
  tokenBalance: number;
  productIds: string[];
  orderNumber?: string;
  requiresShipping?: boolean;
  shippingCountry?: string | null;
};

export type PurchaseStage = "closed" | "cart" | "checkout" | "success";
