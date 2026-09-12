"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import FavoriteButton from "@/components/account/FavoriteButton";
import AuctionCountdown from "@/components/paintings/AuctionCountdown";
import PaginationControls from "@/components/catalog/PaginationControls";
import PurchaseModals from "@/components/purchase/PurchaseModals";
import PurchaseProvider, { usePurchase } from "@/components/purchase/PurchaseProvider";
import StoreHeader from "@/components/store/StoreHeader";
import { useI18n } from "@/components/I18nProvider";
import type { PaintingAuction } from "@/lib/auctions/types";
import { paintingPurchaseProduct, toPaintingCartSource, type PaintingCartSource } from "@/lib/purchase/painting-product";
import type { PurchaseServerState } from "@/lib/purchase/types";

function PaintingsContent({ auctions, serverTime }: { auctions: PaintingAuction[]; serverTime: string }) {
  const { t } = useI18n();
  const { cartItems, summary, busy, status, openCart, addProduct } = usePurchase();
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const inCart = new Set(cartItems.map((product) => product.id));
  const pageItems = auctions.slice((page - 1) * pageSize, page * pageSize);

  async function watch(id: string) {
    const response = await fetch("/api/paintings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "watch", auctionId: id }) });
    setMessage(response.ok ? t("paintings.watchSuccess") : t("paintings.watchSignIn"));
  }

  return <main className="paintings-page"><StoreHeader active="paintings" cartCount={summary.itemCount} cartItems={cartItems} onCart={openCart} />
    <section className="paintings-hero"><div><p className="kicker">{t("paintings.kicker")}</p><h1>{t("paintings.title")}</h1><p>{t("paintings.intro")}</p><p>{t("paintings.internationalNotice")}</p></div><aside><span>{t("paintings.availableWorldwide")}</span><strong>{t("paintings.liveCount", { count: auctions.filter((auction) => ["live", "extended"].includes(auction.status)).length })}</strong></aside></section>
    <p className="paintings-status" role="status" aria-live="polite">{message || status}</p><PaginationControls page={page} pageSize={pageSize} totalItems={auctions.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
    <section className="painting-grid">{pageItems.map((auction, index) => { const cover = auction.images[auction.coverImageIndex] || auction.images[0] || "/branding/optimized/mask-logo-512.png"; const buyNow = auction.buyNowPrice !== null && ["live", "extended"].includes(auction.status) && auction.published; return <article className="painting-card" key={auction.id}><FavoriteButton product={{ id: auction.id, productType: "painting", title: auction.title, imageUrl: cover, href: `/paintings/${auction.slug}` }} /><Link className="painting-image" href={`/paintings/${auction.slug}`}><Image src={cover} alt={auction.imageAlt[auction.coverImageIndex] || auction.title} fill priority={index === 0} sizes="(max-width: 720px) 100vw, 50vw" /></Link><div className="painting-card-status"><span>{auction.status.replaceAll("_", " ")}</span><b>{t("paintings.internationalShipping")}</b></div><h2>{auction.title}</h2><p>{t("paintings.byArtist", { artist: auction.artist })}</p><p>{auction.shortDescription}</p><div className="painting-bid-line"><span>{t("paintings.currentBid")}<strong>{t("audioStore.coins", { count: auction.currentBid })}</strong><small>{t("paintings.bidCount", { count: auction.bidCount })}</small></span><AuctionCountdown startsAt={auction.startsAt} endsAt={auction.endsAt} serverTime={serverTime} /></div><div className="painting-actions"><Link className="primary" href={`/paintings/${auction.slug}`}>{t("paintings.placeBid")}</Link><button className="secondary" type="button" onClick={() => void watch(auction.id)}>{t("paintings.watchlist")}</button>{buyNow ? <button className="secondary" type="button" disabled={busy || inCart.has(auction.id)} onClick={(event) => void addProduct(auction.id, event.currentTarget)}>{inCart.has(auction.id) ? t("audioStore.inCart") : t("merch.addToCart")}</button> : null}</div></article>; })}</section>
    <PurchaseModals />
  </main>;
}

export default function PaintingsStorefront({ auctions, serverTime }: { auctions: PaintingAuction[]; serverTime: string }) {
  const cartAuctions = auctions.map(toPaintingCartSource);
  const developmentPreviewState = { products: cartAuctions, authenticated: true, tokenBalance: 1500, cartProductIds: [], cartLines: [], purchases: [] } satisfies PurchaseServerState<PaintingCartSource>;
  return <PurchaseProvider<PaintingCartSource> endpoint="/api/audio-clips" initialProducts={cartAuctions} normalizeProduct={paintingPurchaseProduct} developmentPreviewState={developmentPreviewState}><PaintingsContent auctions={auctions} serverTime={serverTime} /></PurchaseProvider>;
}
