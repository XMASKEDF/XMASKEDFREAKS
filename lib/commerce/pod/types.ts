import type { ShippingAddress } from "@/lib/purchase/types";

export type PodHealth = {
  configured: boolean;
  functional: boolean | null;
  status: number | null;
  latencyMs: number | null;
  rateLimitRemaining: number | null;
  detail: string;
};

export type PodProduct = {
  id: string;
  title: string;
  blueprintId: number | null;
  printProviderId: number | null;
  lifecycleStatus: "active" | "unpublished" | "archived";
  visible: boolean;
  locked: boolean;
  variants: Array<{
    id: number;
    sku: string | null;
    title: string;
    priceMinor: number | null;
    costMinor: number | null;
    available: boolean;
  }>;
  raw: Record<string, unknown>;
};

export type PodProviderOption = {
  id: number;
  title: string;
  countryCode: string | null;
  region: string | null;
  blueprintIds: number[];
};

export type PodShippingRate = {
  method: string;
  countryCode: string;
  variantId: number;
  firstItemMinor: number;
  additionalItemMinor: number;
  currency: string;
  handlingFromDays: number | null;
  handlingToDays: number | null;
};

export type PodOrder = {
  id: string;
  externalId: string | null;
  status: string;
  totalPriceMinor: number | null;
  totalShippingMinor: number | null;
  createdAt: string | null;
  sentToProductionAt: string | null;
  fulfilledAt: string | null;
  trackingNumbers: string[];
  raw: Record<string, unknown>;
};

export type PodOrderLine = {
  productId: string;
  variantId: number;
  quantity: number;
  externalId: string;
};

export type PodOrderSubmission = {
  orderNumber: string;
  address: ShippingAddress;
  email: string;
  shippingMethod: string;
  lines: PodOrderLine[];
};

export interface PodProvider {
  readonly id: string;
  readonly name: string;
  health(): Promise<PodHealth>;
  listProducts(): Promise<{ ok: boolean; products: PodProduct[]; code: string | null }>;
  listProviders(): Promise<{ ok: boolean; providers: PodProviderOption[]; code: string | null }>;
  getProvider(providerId: number): Promise<{ ok: boolean; provider: PodProviderOption | null; code: string | null }>;
  listOrders(): Promise<{ ok: boolean; orders: PodOrder[]; code: string | null }>;
  shippingRates(blueprintId: number, providerId: number): Promise<{ ok: boolean; rates: PodShippingRate[]; code: string | null }>;
  submitOrder(input: PodOrderSubmission): Promise<{ ok: boolean; orderId: string | null; code: string | null; data: unknown }>;
}
