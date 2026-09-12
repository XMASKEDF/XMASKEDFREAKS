"use client";

import { useI18n } from "@/components/I18nProvider";
import PurchaseItemCard from "@/components/purchase/PurchaseItemCard";
import PurchaseModalShell from "@/components/purchase/PurchaseModalShell";
import { usePurchase } from "@/components/purchase/PurchaseProvider";
import PurchaseSummaryPanel from "@/components/purchase/PurchaseSummaryPanel";

export default function CartModal() {
  const { t } = useI18n();
  const { cartItems, summary, busy, status, promoCodesEnabled, promoCode, setPromoCode, closePurchase, openCheckout, removeProduct, updateQuantity } = usePurchase();
  return <PurchaseModalShell className="purchase-cart-modal" title={t("purchase.cartTitle", { count: summary.itemCount })} subtitle={t("purchase.cartSubtitle")} onClose={closePurchase} headerAside={<span className="purchase-secure-label"><b aria-hidden="true">◇</b><strong>{t("purchase.secureCheckout")}</strong><small>{t("purchase.secureCheckoutNote")}</small></span>}>
    {cartItems.length ? <>
      <div className="purchase-modal-grid"><section className="purchase-cart-content" aria-label={t("purchase.cartItems")}>
        <div className="purchase-section-heading"><span className="purchase-section-mark" aria-hidden="true">▣</span><div><h3>{t("purchase.yourItems", { count: summary.itemCount })}</h3><p>{t("purchase.cartSubtitle")}</p></div></div>
        <div className="purchase-item-list">{cartItems.map((product) => { const lineId = product.cartLineId || product.id; return <PurchaseItemCard key={lineId} product={product} removable onRemove={() => void removeProduct(lineId)} onQuantity={(quantity) => void updateQuantity(lineId, quantity)} disabled={busy} />; })}</div>
        <details className="purchase-promo" open={false}><summary>{t("purchase.promoTitle")}</summary><div><input value={promoCode} onChange={(event) => setPromoCode(event.target.value)} disabled={!promoCodesEnabled} aria-label={t("purchase.promoLabel")} placeholder={t("purchase.promoPlaceholder")} /><button type="button" disabled={!promoCodesEnabled}>{promoCodesEnabled ? t("purchase.applyPromo") : t("purchase.promoUnavailable")}</button></div></details>
        <div className="purchase-benefits"><span><b>↓</b><strong>{t("purchase.instantAccess")}</strong><small>{t("purchase.instantAccessNote")}</small></span><span><b>♢</b><strong>{t("purchase.privateSecure")}</strong><small>{t("purchase.privateSecureNote")}</small></span><span><b>▣</b><strong>{t("purchase.anyDevice")}</strong><small>{t("audioStore.mobileDownload")}</small></span></div>
      </section><PurchaseSummaryPanel showBuyCoins /></div>
      <p className="purchase-modal-status" role="status" aria-live="polite">{status}</p>
      <footer className="purchase-modal-actions"><button className="secondary" type="button" onClick={closePurchase}><span aria-hidden="true">←</span>{t("purchase.continueShopping")}</button><button className="primary purchase-confirm" type="button" disabled={busy || !summary.canOpenCheckout} onClick={openCheckout}><span aria-hidden="true">▣</span>{t("purchase.viewCheckout")}<span aria-hidden="true">→</span></button></footer>
    </> : <div className="purchase-empty"><span aria-hidden="true">⌁</span><h3>{t("purchase.emptyTitle")}</h3><p>{t("purchase.emptyCopy")}</p><button className="primary" type="button" onClick={closePurchase}>{t("purchase.continueShopping")}</button></div>}
  </PurchaseModalShell>;
}
