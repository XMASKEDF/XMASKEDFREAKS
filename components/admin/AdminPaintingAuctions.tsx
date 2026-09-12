"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import ImagePicker from "@/components/admin/media/ImagePicker";
import { automaticBidIncrement } from "@/lib/auctions/types";
import type { PaintingAuction } from "@/lib/auctions/types";
import type { MediaAsset } from "@/lib/media/types";

type PickerTarget = { auctionId: string; imageIndex: number | null } | null;

export default function AdminPaintingAuctions({ initialAuctions, configured }: { initialAuctions: PaintingAuction[]; configured: boolean }) {
  const [auctions, setAuctions] = useState(initialAuctions);
  const [picker, setPicker] = useState<PickerTarget>(null);
  const [message, setMessage] = useState(configured ? "Auction database connected." : "Preview auctions shown until the commerce migration is applied.");
  const closePicker = useCallback(() => setPicker(null), []);

  function patchAuction(id: string, value: Partial<PaintingAuction>) {
    setAuctions((items) => items.map((item) => item.id === id ? { ...item, ...value } : item));
  }

  function patchImage(auction: PaintingAuction, index: number, value: { alt?: string; caption?: string }) {
    const imageAlt = [...auction.imageAlt];
    const imageCaptions = [...auction.imageCaptions];
    if (value.alt !== undefined) imageAlt[index] = value.alt;
    if (value.caption !== undefined) imageCaptions[index] = value.caption;
    patchAuction(auction.id, { imageAlt, imageCaptions });
  }

  function chooseImage(asset: MediaAsset) {
    if (!picker) return;
    const auction = auctions.find((item) => item.id === picker.auctionId);
    if (!auction) return;
    const images = [...auction.images];
    const imageAlt = [...auction.imageAlt];
    const imageCaptions = [...auction.imageCaptions];
    const index = picker.imageIndex ?? images.length;
    images[index] = asset.publicUrl;
    imageAlt[index] = asset.altText || asset.displayName;
    imageCaptions[index] ||= "";
    patchAuction(auction.id, { images, imageAlt, imageCaptions, coverImageIndex: Math.min(auction.coverImageIndex, images.length - 1) });
    setPicker(null);
  }

  function moveImage(auction: PaintingAuction, index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= auction.images.length) return;
    const images = [...auction.images];
    const imageAlt = [...auction.imageAlt];
    const imageCaptions = [...auction.imageCaptions];
    [images[index], images[target]] = [images[target], images[index]];
    [imageAlt[index], imageAlt[target]] = [imageAlt[target], imageAlt[index]];
    [imageCaptions[index], imageCaptions[target]] = [imageCaptions[target], imageCaptions[index]];
    let coverImageIndex = auction.coverImageIndex;
    if (coverImageIndex === index) coverImageIndex = target;
    else if (coverImageIndex === target) coverImageIndex = index;
    patchAuction(auction.id, { images, imageAlt, imageCaptions, coverImageIndex });
  }

  function removeImage(auction: PaintingAuction, index: number) {
    const images = auction.images.filter((_, position) => position !== index);
    const imageAlt = auction.imageAlt.filter((_, position) => position !== index);
    const imageCaptions = auction.imageCaptions.filter((_, position) => position !== index);
    const coverImageIndex = images.length ? Math.min(auction.coverImageIndex > index ? auction.coverImageIndex - 1 : auction.coverImageIndex, images.length - 1) : 0;
    patchAuction(auction.id, { images, imageAlt, imageCaptions, coverImageIndex });
  }

  async function save(auction: PaintingAuction, action = "save") {
    const response = await fetch("/api/admin/paintings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, auction }) });
    const result = await response.json().catch(() => ({})) as { error?: string; auctions?: PaintingAuction[] };
    if (response.ok && result.auctions) { setAuctions(result.auctions); setMessage("Auction saved and audit logged."); }
    else setMessage(result.error || "Auction change failed.");
  }

  return <section className="admin-commerce-panel">
    <header><div><p className="kicker">ADMIN · PAINTINGS</p><h2>Painting Auctions</h2><p>Manage gallery media, automatic coin bidding, worldwide availability, scheduling, and auction outcomes.</p></div></header>
    <p role="status">{message}</p>
    <div className="admin-auction-grid">{auctions.map((auction) => <article key={auction.id}>
      <header><div><span>{auction.status.replaceAll("_", " ")}</span><h3>{auction.title}</h3></div><b>{auction.currentBid} coins</b></header>
      <label>Title<input value={auction.title} onChange={(event) => patchAuction(auction.id, { title: event.target.value })} /></label>
      <label>Artist<input value={auction.artist} onChange={(event) => patchAuction(auction.id, { artist: event.target.value })} /></label>
      <label>Description<textarea rows={3} value={auction.fullDescription} onChange={(event) => patchAuction(auction.id, { fullDescription: event.target.value })} /></label>
      <section className="admin-painting-gallery" aria-label={`${auction.title} image gallery`}>
        <header><div><h4>Gallery</h4><p>Choose reusable images, set one cover, and maintain accessible descriptions.</p></div><button className="secondary" type="button" disabled={auction.images.length >= 8} onClick={() => setPicker({ auctionId: auction.id, imageIndex: null })}>Add from Media Library</button></header>
        <div>{auction.images.map((image, index) => <article key={`${image}-${index}`}>
          <Image unoptimized src={image} alt={auction.imageAlt[index] || `${auction.title} image ${index + 1}`} width={220} height={150} />
          <label className="check-row"><input type="radio" name={`cover-${auction.id}`} checked={auction.coverImageIndex === index} onChange={() => patchAuction(auction.id, { coverImageIndex: index })} />Cover image</label>
          <label>Alt text<input value={auction.imageAlt[index] || ""} onChange={(event) => patchImage(auction, index, { alt: event.target.value })} /></label>
          <label>Caption<input value={auction.imageCaptions[index] || ""} onChange={(event) => patchImage(auction, index, { caption: event.target.value })} /></label>
          <div className="admin-audio-actions"><button className="secondary" type="button" disabled={index === 0} onClick={() => moveImage(auction, index, -1)}>Move up</button><button className="secondary" type="button" disabled={index === auction.images.length - 1} onClick={() => moveImage(auction, index, 1)}>Move down</button><button className="secondary" type="button" onClick={() => setPicker({ auctionId: auction.id, imageIndex: index })}>Replace</button><button className="secondary danger" type="button" onClick={() => removeImage(auction, index)}>Remove</button></div>
        </article>)}</div>
      </section>
      <div className="admin-field-row"><label>Starting bid<input type="number" min={1} value={auction.startingBid} onChange={(event) => patchAuction(auction.id, { startingBid: Number(event.target.value) })} /></label><div className="admin-readonly-value"><span>Automatic next bid step</span><strong>{automaticBidIncrement(auction.currentBid || auction.startingBid)} coins</strong></div><label>Buy Now<input type="number" min={0} value={auction.buyNowPrice || 0} onChange={(event) => patchAuction(auction.id, { buyNowPrice: Number(event.target.value) || null })} /></label></div>
      <div className="admin-field-row"><label>Starts<input type="datetime-local" value={auction.startsAt.slice(0, 16)} onChange={(event) => patchAuction(auction.id, { startsAt: new Date(event.target.value).toISOString() })} /></label><label>Ends<input type="datetime-local" value={auction.endsAt.slice(0, 16)} onChange={(event) => patchAuction(auction.id, { endsAt: new Date(event.target.value).toISOString() })} /></label></div>
      <p className="admin-worldwide-note">Worldwide availability is always enabled for painting auctions.</p>
      <div className="admin-switch-grid"><label><input type="checkbox" checked={auction.published} onChange={(event) => patchAuction(auction.id, { published: event.target.checked })} />Published</label><label><input type="checkbox" checked={auction.featured} onChange={(event) => patchAuction(auction.id, { featured: event.target.checked })} />Featured</label><label><input type="checkbox" checked={auction.antiSnipingEnabled} onChange={(event) => patchAuction(auction.id, { antiSnipingEnabled: event.target.checked })} />Anti-sniping</label></div>
      <div className="admin-field-row"><label>Trigger seconds<input type="number" min={15} value={auction.antiSnipingWindowSeconds} onChange={(event) => patchAuction(auction.id, { antiSnipingWindowSeconds: Number(event.target.value) })} /></label><label>Extend seconds<input type="number" min={15} value={auction.antiSnipingExtensionSeconds} onChange={(event) => patchAuction(auction.id, { antiSnipingExtensionSeconds: Number(event.target.value) })} /></label><label>Max extensions<input type="number" min={0} value={auction.antiSnipingMaxExtensions} onChange={(event) => patchAuction(auction.id, { antiSnipingMaxExtensions: Number(event.target.value) })} /></label></div>
      <label>Private fulfillment notes<textarea rows={3} value={auction.shippingNotes} onChange={(event) => patchAuction(auction.id, { shippingNotes: event.target.value })} /><small>ADMIN only. These notes are not included in public auction data.</small></label>
      <label>Status<select value={auction.status} onChange={(event) => patchAuction(auction.id, { status: event.target.value as PaintingAuction["status"] })}>{["draft", "scheduled", "live", "extended", "sold", "unsold", "cancelled", "fulfillment_pending", "shipped", "delivered"].map((status) => <option key={status}>{status}</option>)}</select></label>
      <details><summary>Bid controls and history</summary><p>{auction.bidCount} bids from {auction.bidderCount} bidders. Administrative cancellation requires a reason and uses the audited cancellation endpoint; valid bid amounts are never silently edited.</p><label>Cancellation reason<input id={`cancel-${auction.id}`} /></label><button className="secondary danger" type="button" onClick={() => { const reason = (document.querySelector(`#cancel-${auction.id}`) as HTMLInputElement)?.value; if (reason && window.confirm("Cancel this auction and release reservations?")) void save(auction, `cancel:${reason}`); }}>Cancel auction</button></details>
      <button className="primary" type="button" onClick={() => void save(auction)}>Save auction</button>
    </article>)}</div>
    <ImagePicker open={Boolean(picker)} category="paintings" title="Choose painting gallery image" onClose={closePicker} onSelect={chooseImage} />
  </section>;
}
