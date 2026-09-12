"use client";

import { usePathname } from "next/navigation";
import PurchaseModals from "@/components/purchase/PurchaseModals";
import PurchaseProvider from "@/components/purchase/PurchaseProvider";
import type { MerchProduct } from "@/lib/commerce/types";
import { merchPurchaseProduct } from "@/lib/commerce/types";
import type { ReactNode } from "react";

const storefrontPath = /^\/(?:merch|audio-clips|paintings)(?:\/|$)/;

export default function GlobalCartBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (storefrontPath.test(pathname || "")) return <>{children}</>;
  return <PurchaseProvider<MerchProduct> endpoint="/api/merch" initialProducts={[]} normalizeProduct={merchPurchaseProduct}>
    {children}
    <PurchaseModals />
  </PurchaseProvider>;
}
