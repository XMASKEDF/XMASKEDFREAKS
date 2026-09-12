"use client";

import CartModal from "@/components/purchase/CartModal";
import CheckoutModal from "@/components/purchase/CheckoutModal";
import { usePurchase } from "@/components/purchase/PurchaseProvider";

export default function PurchaseModals() {
  const { stage } = usePurchase();
  if (stage === "cart") return <CartModal />;
  if (stage === "checkout" || stage === "success") return <CheckoutModal />;
  return null;
}
