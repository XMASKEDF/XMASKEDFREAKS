"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import FavoriteButton from "@/components/account/FavoriteButton";
import RecentViewTracker from "@/components/account/RecentViewTracker";
import { useI18n } from "@/components/I18nProvider";
import StoreHeader from "@/components/store/StoreHeader";
import AuctionCountdown from "@/components/paintings/AuctionCountdown";
import PurchaseModals from "@/components/purchase/PurchaseModals";
import { usePurchase } from "@/components/purchase/PurchaseProvider";
import { minimumNextBid, type AuctionBid, type PaintingAuction } from "@/lib/auctions/types";

const emptyAddress = { fullName: "", addressLine1: "", addressLine2: "", city: "", region: "", postalCode: "", country: "", phone: "", instructions: "" };

export default function PaintingDetail({ auction, bids, serverTime }: { auction: PaintingAuction; bids: AuctionBid[]; serverTime: string }) {
  const { locale, t } = useI18n();
  const { cartItems, summary, openCart, addProduct } = usePurchase();
  const minimum = minimumNextBid(auction);
  const [amount, setAmount] = useState(minimum);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [shippingAddress, setShippingAddress] = useState(emptyAddress);
  const history = useMemo(() => [...bids].sort((a, b) => b.amount - a.amount), [bids]);
  const accountProduct = useMemo(() => ({
    id: auction.id,
    productType: "painting",
    title: auction.title,
    imageUrl: auction.images[auction.coverImageIndex] || auction.images[0] || "",
    href: `/paintings/${auction.slug}`
  }), [auction]);

  async function submit(action: "bid" | "buy-now" | "watch" | "winner-address") {
    setBusy(true);
    const key = crypto.randomUUID();
    const response = await fetch("/api/paintings", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify({ action, auctionId: auction.id, amount, idempotencyKey: key, shippingAddress: action === "buy-now" || action === "winner-address" ? shippingAddress : null })
    });
    const result = await response.json().catch(() => ({})) as { message?: string; code?: string };
    const successKey = action === "bid" ? "paintings.bidAccepted" : action === "buy-now" ? "paintings.buyNowSuccess" : action === "winner-address" ? "paintings.addressSaved" : "paintings.watchSuccess";
    setMessage(response.ok ? t(successKey) : result.message || result.code || t("paintings.actionFailed"));
    setBusy(false);
  }

  const addressFields = <div className="painting-shipping-grid">
    <label>{t("purchase.fullName")}<input value={shippingAddress.fullName} onChange={(event) => setShippingAddress({ ...shippingAddress, fullName: event.target.value })} /></label>
    <label>{t("purchase.address1")}<input value={shippingAddress.addressLine1} onChange={(event) => setShippingAddress({ ...shippingAddress, addressLine1: event.target.value })} /></label>
    <label>{t("purchase.address2")}<input value={shippingAddress.addressLine2} onChange={(event) => setShippingAddress({ ...shippingAddress, addressLine2: event.target.value })} /></label>
    <label>{t("purchase.city")}<input value={shippingAddress.city} onChange={(event) => setShippingAddress({ ...shippingAddress, city: event.target.value })} /></label>
    <label>{t("purchase.region")}<input value={shippingAddress.region} onChange={(event) => setShippingAddress({ ...shippingAddress, region: event.target.value })} /></label>
    <label>{t("purchase.postalCode")}<input value={shippingAddress.postalCode} onChange={(event) => setShippingAddress({ ...shippingAddress, postalCode: event.target.value })} /></label>
    <label>{t("purchase.country")}<input value={shippingAddress.country} onChange={(event) => setShippingAddress({ ...shippingAddress, country: event.target.value })} /></label>
    <label>{t("purchase.phone")}<input value={shippingAddress.phone} onChange={(event) => setShippingAddress({ ...shippingAddress, phone: event.target.value })} /></label>
    <label>{t("purchase.instructions")}<textarea value={shippingAddress.instructions} onChange={(event) => setShippingAddress({ ...shippingAddress, instructions: event.target.value })} /></label>
  </div>;

  const inCart = cartItems.some((product) => product.id === auction.id);
  const cartAvailable = auction.buyNowPrice !== null && ["live", "extended"].includes(auction.status) && auction.published;
  return <main className="painting-detail-page">
    <RecentViewTracker product={accountProduct} />
    <StoreHeader active="paintings" cartCount={summary.itemCount} cartItems={cartItems} onCart={openCart} />
    <section className="painting-detail-layout">
      <div className="painting-gallery">{auction.images.map((image, index) => <figure className="painting-detail-image" key={`${image}-${index}`}><Image src={image} alt={auction.imageAlt[index] || t("paintings.imageAlt", { title: auction.title, number: index + 1 })} fill priority={index === auction.coverImageIndex} sizes="(max-width: 800px) 100vw, 55vw" />{auction.imageCaptions[index] ? <figcaption>{auction.imageCaptions[index]}</figcaption> : null}</figure>)}</div>
      <article className="painting-auction-panel">
        <FavoriteButton product={accountProduct} />
        <p className="kicker">{auction.status.replaceAll("_", " ")}</p><h1>{auction.title}</h1><p>{t("paintings.originalBy")} <strong>{auction.artist}</strong></p><p>{auction.fullDescription}</p>
        <AuctionCountdown startsAt={auction.startsAt} endsAt={auction.endsAt} serverTime={serverTime} />
        <div className="painting-current-bid"><span>{t("paintings.currentBid")}<strong>{t("audioStore.coins", { count: auction.currentBid })}</strong></span><small>{t("paintings.bidderSummary", { bids: auction.bidCount, bidders: auction.bidderCount })}</small></div>
        <label>{t("paintings.bidAmount")}<input type="number" min={minimum} step={1} value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></label>
        <small>{t("paintings.minimumBid", { count: minimum })}</small>
        <button className="primary" type="button" disabled={busy || !["live", "extended"].includes(auction.status)} onClick={() => void submit("bid")}>{t("paintings.placeBid")}</button>
        <details className="painting-shipping"><summary>{t("paintings.shippingSummary")}</summary>{addressFields}{auction.buyNowPrice ? <div className="painting-purchase-actions"><button className="secondary" type="button" disabled={busy || !["live", "extended"].includes(auction.status)} onClick={() => void submit("buy-now")}>{t("paintings.buyNow", { count: auction.buyNowPrice })}</button><button className="secondary" type="button" disabled={!cartAvailable || inCart} onClick={(event) => void addProduct(auction.id, event.currentTarget)}>{inCart ? t("audioStore.inCart") : t("merch.addToCart")}</button></div> : null}{auction.status === "fulfillment_pending" ? <button className="secondary" type="button" disabled={busy} onClick={() => void submit("winner-address")}>{t("paintings.submitWinnerAddress")}</button> : null}<p>{t("purchase.customsNotice")}</p></details>
        <button className="secondary" type="button" onClick={() => void submit("watch")}>{t("paintings.addWatchlist")}</button><p role="status">{message}</p>
        <dl><div><dt>{t("paintings.medium")}</dt><dd>{auction.medium}</dd></div><div><dt>{t("paintings.dimensions")}</dt><dd>{auction.dimensions}</dd></div><div><dt>{t("paintings.year")}</dt><dd>{auction.yearCreated || "—"}</dd></div><div><dt>{t("paintings.condition")}</dt><dd>{auction.condition}</dd></div><div><dt>{t("paintings.authenticity")}</dt><dd>{auction.authenticity}</dd></div><div><dt>{t("merch.shipping")}</dt><dd>{t("paintings.internationalShipping")}</dd></div></dl>
        <p>{t("paintings.shippingPublicNote")}</p><details><summary>{t("paintings.auctionTerms")}</summary><p>{auction.terms}</p></details>
      </article>
    </section>
    <section className="painting-bid-history"><h2>{t("paintings.bidHistory")}</h2>{history.length ? history.map((bid) => <article key={bid.id}><strong>{t("audioStore.coins", { count: bid.amount })}</strong><span>{bid.bidderLabel}</span><time dateTime={bid.createdAt}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(bid.createdAt))}</time></article>) : <p>{t("paintings.noBids")}</p>}</section>
    <PurchaseModals />
  </main>;
}
