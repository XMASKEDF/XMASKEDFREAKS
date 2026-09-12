"use client";

import Image from "next/image";
import { useCallback, useMemo, useRef, useState, type SyntheticEvent } from "react";
import FavoriteButton from "@/components/account/FavoriteButton";
import { useAccount } from "@/components/account/AccountProvider";
import StoreHeader from "@/components/store/StoreHeader";
import { useI18n } from "@/components/I18nProvider";
import PurchaseModals from "@/components/purchase/PurchaseModals";
import PurchaseProvider, { usePurchase } from "@/components/purchase/PurchaseProvider";
import type { AudioProduct } from "@/lib/audio-store/catalog";
import { audioPurchaseProduct } from "@/lib/purchase/audio-product";
import type { PurchaseProduct, PurchaseRecord, PurchaseServerState } from "@/lib/purchase/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import PaginationControls from "@/components/catalog/PaginationControls";

function AudioStoreContent() {
  const { t, locale } = useI18n();
  const { account, recordRecentView } = useAccount();
  const { products, cartItems, purchases, summary, busy, status, openCart, addProduct, refresh } = usePurchase();
  const [downloadId, setDownloadId] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const activePreview = useRef<HTMLMediaElement | null>(null);

  const accessToken = useCallback(async () => {
    try { return (await createSupabaseBrowserClient().auth.getSession()).data.session?.access_token || null; } catch { return null; }
  }, []);

  async function download(purchase: PurchaseRecord) {
    const token = await accessToken();
    if (!token) { setDownloadStatus(t("audioStore.signIn")); return; }
    setDownloadId(purchase.entitlementId); setDownloadStatus(t("audioStore.downloading"));
    const response = await fetch(`/api/audio-clips/${encodeURIComponent(purchase.productId)}/download`, { headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) { setDownloadStatus(t("audioStore.downloadFailed")); setDownloadId(null); return; }
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${purchase.productName}.${purchase.fileExtension}`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    setDownloadStatus(t("audioStore.downloadReady")); setDownloadId(null); void refresh();
  }

  function previewStarted(event: SyntheticEvent<HTMLMediaElement>, product: PurchaseProduct) {
    if (activePreview.current && activePreview.current !== event.currentTarget) activePreview.current.pause();
    activePreview.current = event.currentTarget;
    if (account.authenticated) void recordRecentView({ id: product.id, productType: "audio", title: product.name, imageUrl: product.thumbnailUrl, href: "/audio-clips" });
  }

  const inCart = new Set(cartItems.map((product) => product.id));
  const catalogProducts = products;
  const pageItems = catalogProducts.slice((page - 1) * pageSize, page * pageSize);
  return <main className="audio-store-page">
    <StoreHeader active="audio" cartCount={summary.itemCount} cartItems={cartItems} onCart={openCart} />

    <section className="audio-store-intro"><div><p className="kicker">{t("audioStore.kicker")}</p><h1>{t("audioStore.title")}</h1><p>{t("audioStore.intro")}</p><p>{t("audioStore.deviceNote")}</p><small>{t("audioStore.privacyNote")}</small></div><aside><span>{t("audioStore.wallet")}</span><strong>{summary.balance === null ? "—" : t("audioStore.coins", { count: summary.balance })}</strong><small>{t("audioStore.secure")}</small></aside></section>

    <p className="audio-store-status" role="status" aria-live="polite">{downloadStatus || status}</p>
    <PaginationControls page={page} pageSize={pageSize} totalItems={products.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
    <section className="audio-product-grid" aria-label={t("audioStore.products")}>{pageItems.map((product, index) => {
      const available = product.active && product.published;
      return <article className={`audio-product-card ${available ? "is-available" : "is-unavailable"}`} key={product.id}>
        <FavoriteButton product={{ id: product.id, productType: "audio", title: product.name, imageUrl: product.thumbnailUrl, href: "/audio-clips" }} />
        <div className="audio-product-thumb"><Image src={product.thumbnailUrl} alt={product.name} fill priority={index === 0} sizes="(max-width: 700px) 100vw, (max-width: 1050px) 50vw, 33vw" /></div>
        <div className="audio-product-meta"><span>◉ {product.kind === "digital_video" ? t("audioStore.video") : t("audioStore.audio")}</span><b>{product.purchased ? t("audioStore.purchased") : available ? t("audioStore.available") : t("audioStore.unavailable")}</b></div>
        <h2>{product.name}</h2><p>{product.description}</p>
        <div className="audio-product-price"><strong>{t("audioStore.coins", { count: product.coinPrice })}</strong><small>{t("audioStore.format", { format: product.format || "—" })}</small></div>
        {product.previewUrl ? product.kind === "digital_video" ? <video controls preload="none" onPlay={(event) => previewStarted(event, product)} aria-label={`${t("audioStore.preview")}: ${product.name}`}><source src={product.previewUrl} /></video> : <audio controls preload="none" onPlay={(event) => previewStarted(event, product)} aria-label={`${t("audioStore.preview")}: ${product.name}`}><source src={product.previewUrl} /></audio> : null}
        <button className="primary" type="button" disabled={!available || product.purchased || inCart.has(product.id) || busy} onClick={(event) => void addProduct(product.id, event.currentTarget)}>{product.purchased ? t("audioStore.purchased") : inCart.has(product.id) ? t("audioStore.inCart") : t("audioStore.add")}</button>
      </article>;
    })}</section>

    <section className="audio-purchases-panel"><div className="section-heading"><p className="kicker">{t("audioStore.privacyNote")}</p><h2>{t("audioStore.myPurchases")}</h2></div>
      {purchases.length ? <div className="audio-purchase-list">{purchases.map((purchase) => { const product = products.find((item) => item.id === purchase.productId); return <article key={purchase.entitlementId}>{product ? <span className="audio-purchase-thumb"><Image src={product.thumbnailUrl} alt="" fill sizes="72px" /></span> : null}<div><strong>{purchase.productName}</strong><span>{t("audioStore.purchaseDate", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(purchase.grantedAt)) })}</span><small>{t("audioStore.order", { reference: purchase.orderId.slice(0, 8).toUpperCase() })} · {purchase.fileExtension.toUpperCase()}</small></div><button className="secondary" type="button" disabled={downloadId === purchase.entitlementId} onClick={() => void download(purchase)}>{downloadId === purchase.entitlementId ? t("audioStore.downloading") : t("audioStore.download")}</button></article>; })}</div> : <p>{t("audioStore.noPurchases")}</p>}
      <small>{t("audioStore.mobileDownload")}</small>
    </section>
    <PurchaseModals />
  </main>;
}

export default function AudioStorefront({ initialProducts }: { initialProducts: AudioProduct[] }) {
  const previewProducts = useMemo(() => initialProducts.map((product, index) => index < 2 ? { ...product, active: true, published: true, name: index === 0 ? "Whispers in the Dark" : "Late Night Confessions", description: index === 0 ? "A private downloadable audio experience." : "An after-hours original recording.", coinPrice: index === 0 ? 250 : 200, fileExtension: "mp3" as const } : product), [initialProducts]);
  const developmentPreviewState = useMemo<PurchaseServerState<AudioProduct>>(() => ({ products: previewProducts, authenticated: true, tokenBalance: 700, cartProductIds: previewProducts.slice(0, 2).map((product) => product.id), purchases: [] }), [previewProducts]);
  return <PurchaseProvider endpoint="/api/audio-clips" initialProducts={initialProducts} normalizeProduct={audioPurchaseProduct} developmentPreviewState={developmentPreviewState}><AudioStoreContent /></PurchaseProvider>;
}
