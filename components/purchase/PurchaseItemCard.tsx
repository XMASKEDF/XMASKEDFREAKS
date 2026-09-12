"use client";

import Image from "next/image";
import { useI18n } from "@/components/I18nProvider";
import type { PurchaseProduct } from "@/lib/purchase/types";
import { formatUsdFromCents } from "@/lib/commerce/coins";

export default function PurchaseItemCard({ product, removable, onRemove, onQuantity, disabled }: { product: PurchaseProduct; removable: boolean; onRemove?: () => void; onQuantity?: (quantity: number) => void; disabled?: boolean }) {
  const { t } = useI18n();
  const inventoryAvailable = !product.inventoryTracked || Number(product.inventoryQuantity ?? product.maxQuantity ?? 0) >= product.quantity;
  const available = product.active && product.published && inventoryAvailable;
  const digital = product.kind !== "physical";
  const itemTotal = product.coinPrice * product.quantity;
  return <article className={`purchase-item-card ${available ? "" : "is-unavailable"}`}>
    <div className="purchase-item-thumb"><Image src={product.thumbnailUrl} alt={product.name} fill sizes="96px" /></div>
    <div className="purchase-item-copy"><div><span className={`purchase-type-badge ${digital ? "is-digital" : "is-physical"}`}>{digital ? "Digital" : "Physical"}</span><small className={available ? "purchase-availability" : "purchase-availability is-unavailable"}>{available ? t("audioStore.available") : t("audioStore.unavailable")}</small>{product.duration ? <small>{product.duration}</small> : null}{product.format ? <small>{product.format}</small> : null}</div><h3>{product.name}</h3><p>{product.categoryName || (product.kind === "digital_video" ? t("audioStore.video") : product.kind === "digital_audio" ? t("audioStore.audio") : product.kind === "physical" ? t("purchase.physical") : product.kind)}</p>{product.description ? <p className="purchase-item-description">{product.description}</p> : null}{digital ? <small className="purchase-delivery"><b aria-hidden="true">↓</b>{t("purchase.instantDownload")}</small> : null}{product.options.length ? <dl>{product.options.map((option) => <div key={option.id}><dt>{option.name}</dt><dd>{option.value}</dd></div>)}</dl> : null}{product.kind === "physical" && onQuantity ? <div className="purchase-quantity" aria-label={t("purchase.quantity")}><button type="button" disabled={disabled || product.quantity <= 1} onClick={() => onQuantity(product.quantity - 1)} aria-label={t("purchase.decreaseQuantity")}>−</button><output>{product.quantity}</output><button type="button" disabled={disabled || product.quantity >= Number(product.maxQuantity || product.inventoryQuantity || 1)} onClick={() => onQuantity(product.quantity + 1)} aria-label={t("purchase.increaseQuantity")}>+</button></div> : null}</div>
    <strong className="purchase-item-price" aria-label={t("audioStore.coins", { count: itemTotal })}><span className="purchase-item-unit-price">{product.quantity} × {t("audioStore.coins", { count: product.coinPrice })}</span><span className="purchase-item-line-total">{t("audioStore.coins", { count: itemTotal })}</span><small>{formatUsdFromCents(itemTotal * 50)}</small></strong>
    {product.previewUrl ? product.kind === "digital_video" ? <video className="purchase-item-preview" controls preload="none" aria-label={`${t("audioStore.preview")}: ${product.name}`}><source src={product.previewUrl} /></video> : <audio className="purchase-item-preview" controls preload="none" aria-label={`${t("audioStore.preview")}: ${product.name}`}><source src={product.previewUrl} /></audio> : null}
    {removable ? <button className="purchase-remove" type="button" disabled={disabled} aria-label={`${t("audioStore.remove")}: ${product.name}`} onClick={onRemove}>×</button> : null}
  </article>;
}
