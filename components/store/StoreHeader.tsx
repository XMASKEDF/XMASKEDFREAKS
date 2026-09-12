"use client";

import BrandLogo from "@/components/BrandLogo";
import PublicNavigation from "@/components/PublicNavigation";
import { useI18n } from "@/components/I18nProvider";
import type { PurchaseProduct } from "@/lib/purchase/types";
import Image from "next/image";
import { useState } from "react";

export default function StoreHeader({ cartCount = 0, cartItems = [], onCart }: { active?: "audio" | "merch" | "paintings"; cartCount?: number; cartItems?: PurchaseProduct[]; onCart?: (element: HTMLButtonElement) => void }) {
  const { t } = useI18n();
  const [previewOpen, setPreviewOpen] = useState(false);
  return <header className="site-header store-shared-header"><BrandLogo href="/" priority /><PublicNavigation />{onCart ? <div className="store-cart-anchor" onMouseEnter={() => setPreviewOpen(true)} onMouseLeave={() => setPreviewOpen(false)} onFocus={() => setPreviewOpen(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPreviewOpen(false); }}><button className="header-cta audio-cart-trigger" type="button" onClick={(event) => onCart(event.currentTarget)}><span aria-hidden="true">⌁</span>{t("audioStore.cart")}{cartCount ? <b>{cartCount}</b> : null}</button>{previewOpen && cartItems.length ? <div className="mini-cart-preview" role="status" aria-label={t("audioStore.cart")}><strong>{t("purchase.cartTitle", { count: cartCount })}</strong>{cartItems.slice(-3).map((item) => <div className="mini-cart-item" key={item.cartLineId || item.id}><Image src={item.thumbnailUrl} alt="" width={36} height={36} /><span>{item.name}</span><small>{t("audioStore.coins", { count: item.coinPrice * item.quantity })}</small></div>)}<button className="secondary" type="button" onClick={(event) => onCart(event.currentTarget)}>{t("purchase.viewCheckout")}</button></div> : null}</div> : null}</header>;
}
