export type PaintingAuction = {
  id: string;
  slug: string;
  title: string;
  artist: string;
  shortDescription: string;
  fullDescription: string;
  images: string[];
  imageAlt: string[];
  imageCaptions: string[];
  coverImageIndex: number;
  dimensions: string;
  medium: string;
  yearCreated: number | null;
  condition: string;
  authenticity: string;
  currentBid: number;
  startingBid: number;
  buyNowPrice: number | null;
  bidCount: number;
  bidderCount: number;
  startsAt: string;
  endsAt: string;
  status: "draft" | "scheduled" | "live" | "extended" | "sold" | "unsold" | "cancelled" | "fulfillment_pending" | "shipped" | "delivered";
  internationalShippingAllowed: true;
  shippingNotes: string;
  terms: string;
  antiSnipingEnabled: boolean;
  antiSnipingWindowSeconds: number;
  antiSnipingExtensionSeconds: number;
  antiSnipingMaxExtensions: number;
  extensionCount: number;
  published: boolean;
  featured: boolean;
  watched?: boolean;
};

export type AuctionBid = { id: string; auctionId: string; bidderLabel: string; amount: number; createdAt: string; status: "valid" | "cancelled" | "winning" };

export function automaticBidIncrement(currentBid: number) {
  if (currentBid < 100) return 5;
  if (currentBid < 500) return 10;
  if (currentBid < 1_000) return 25;
  if (currentBid < 5_000) return 50;
  return Math.max(100, Math.ceil(currentBid * 0.02 / 10) * 10);
}

export function minimumNextBid(auction: Pick<PaintingAuction, "startingBid" | "currentBid" | "bidCount">) {
  return auction.bidCount > 0 ? auction.currentBid + automaticBidIncrement(auction.currentBid) : auction.startingBid;
}
