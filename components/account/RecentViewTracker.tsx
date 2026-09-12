"use client";

import { useEffect, useRef } from "react";
import { useAccount } from "@/components/account/AccountProvider";

type RecentProduct = {
  id: string;
  productType: string;
  title: string;
  imageUrl: string;
  href: string;
};

export default function RecentViewTracker({ product }: { product: RecentProduct }) {
  const { account, recordRecentView } = useAccount();
  const recordedKey = useRef("");

  useEffect(() => {
    const key = `${account.userId}:${product.productType}:${product.id}`;
    if (!account.authenticated || recordedKey.current === key) return;
    recordedKey.current = key;
    void recordRecentView(product);
  }, [account.authenticated, account.userId, product, recordRecentView]);

  return null;
}
