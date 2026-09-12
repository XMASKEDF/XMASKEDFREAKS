import type { PurchaseProduct } from "@/lib/purchase/types";

export type FulfillmentClass = "physical" | "digital";

/** Shipping is a product capability, never a storefront-specific assumption. */
export function fulfillmentClass(product: Pick<PurchaseProduct, "kind" | "shippingRequired">): FulfillmentClass {
  return product.shippingRequired || product.kind === "physical" ? "physical" : "digital";
}

export function requiresShipping(product: Pick<PurchaseProduct, "kind" | "shippingRequired">) {
  return fulfillmentClass(product) === "physical";
}

export function cartRequiresShipping(products: PurchaseProduct[]) {
  return products.some(requiresShipping);
}
