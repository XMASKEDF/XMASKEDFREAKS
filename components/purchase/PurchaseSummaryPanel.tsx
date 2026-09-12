"use client";

import Image from "next/image";
import { useI18n } from "@/components/I18nProvider";
import { usePurchase } from "@/components/purchase/PurchaseProvider";
import { formatUsdFromCents } from "@/lib/commerce/coins";

export default function PurchaseSummaryPanel({ showPaymentMethod = false, showBuyCoins = false }: { showPaymentMethod?: boolean; showBuyCoins?: boolean }) {
  const { t } = useI18n();
  const { summary, checkoutQuote, addTokens } = usePurchase();
  const coins = (count: number) => t("audioStore.coins", { count });
  const usd = (coinCount: number) => formatUsdFromCents(coinCount * 50);
  return <aside className="purchase-summary-panel">
    <div className="purchase-summary-heading"><span className="purchase-section-mark" aria-hidden="true">▤</span><h3>{t("purchase.orderSummary")}</h3></div>
    <dl className="purchase-summary-lines"><div><dt>{t("purchase.items", { count: summary.itemCount })}</dt><dd><strong>{coins(summary.subtotal)}</strong><small>{usd(summary.subtotal)}</small></dd></div>{summary.requiresShipping ? <><div><dt>{t("purchase.shipping")}</dt><dd>{summary.quoteReady ? <><strong>{coins(summary.shipping)}</strong><small>{usd(summary.shipping)}</small></> : t("purchase.shippingCalculated")}</dd></div><div><dt>{t("purchase.tax")}</dt><dd>{summary.quoteReady ? <><strong>{coins(summary.tax)}</strong><small>{usd(summary.tax)}</small></> : t("purchase.taxCalculated")}</dd></div></> : null}<div><dt>{t("purchase.discount")}</dt><dd><strong>{coins(summary.discount)}</strong><small>{usd(summary.discount)}</small></dd></div><div className="is-total"><dt>{t("audioStore.total")}</dt><dd>{summary.requiresShipping && !summary.quoteReady ? t("purchase.finalTotalPending") : <><strong>{coins(summary.total)}</strong><small>{usd(summary.total)}</small></>}</dd></div></dl>
    {checkoutQuote ? <div className="purchase-quote-detail" role="status"><strong>{t("purchase.quoteConfirmed")}</strong><span>{t("purchase.coinRate")}</span><small>{t("purchase.usdEquivalent", { amount: formatUsdFromCents(checkoutQuote.totalCents) })}</small><small>{t("purchase.roundingDisclosure", { amount: formatUsdFromCents(checkoutQuote.roundingAdjustmentCents) })}</small></div> : null}
    <div className="purchase-charge-note"><Image src="/branding/green-coin.png" alt="" width={36} height={36} /><span><strong>{t("purchase.charge", { count: summary.total })}</strong><small>{t("purchase.serverVerified")}</small></span></div>
    <div className="purchase-balance"><h4>{t("purchase.yourBalance")}</h4><div><span><Image src="/branding/green-coin.png" alt="" width={30} height={30} /><strong>{summary.balance === null ? "—" : coins(summary.balance)}</strong></span>{showBuyCoins || summary.shortage ? <button type="button" onClick={addTokens}>{showBuyCoins ? t("purchase.buyMoreCoins") : t("purchase.addTokens")}</button> : null}</div>{summary.shortage ? <p>{t("purchase.shortage", { count: summary.shortage })}</p> : summary.remainingBalance !== null ? <small>{t("purchase.remaining", { count: summary.remainingBalance })}</small> : null}</div>
    {showPaymentMethod ? <div className="purchase-payment-method"><h4>{t("purchase.paymentMethod")}</h4><div><Image src="/branding/green-coin.png" alt="" width={30} height={30} /><span><strong>{t("purchase.walletMethod")}</strong><small>{t("purchase.walletMethodNote")}</small></span><b aria-label={t("purchase.selected")}>✓</b></div></div> : null}
  </aside>;
}
