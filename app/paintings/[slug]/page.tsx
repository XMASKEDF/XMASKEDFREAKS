import { notFound } from "next/navigation";
import PaintingDetail from "@/components/paintings/PaintingDetail";
import { getAuctionBids, getPaintingAuctions } from "@/lib/auctions/catalog";
import PurchaseProvider from "@/components/purchase/PurchaseProvider";
import { paintingPurchaseProduct, toPaintingCartSource, type PaintingCartSource } from "@/lib/purchase/painting-product";
export const dynamic = "force-dynamic";
export default async function PaintingPage({ params }: { params: { slug: string } }) { const data = await getPaintingAuctions(false); const auction = data.auctions.find((item) => item.slug === params.slug); if (!auction) notFound(); const bids = await getAuctionBids(auction.id); const cartAuction = toPaintingCartSource(auction); return <PurchaseProvider<PaintingCartSource> endpoint="/api/audio-clips" initialProducts={[cartAuction]} normalizeProduct={paintingPurchaseProduct}><PaintingDetail auction={auction} bids={bids} serverTime={data.serverTime} /></PurchaseProvider>; }
