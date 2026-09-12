import assert from "node:assert/strict";
import test from "node:test";
import { cartRequiresShipping, fulfillmentClass } from "@/lib/commerce/fulfillment";
import { audioPurchaseProduct } from "@/lib/purchase/audio-product";
import { paintingPurchaseProduct, toPaintingCartSource } from "@/lib/purchase/painting-product";
import type { AudioProduct } from "@/lib/audio-store/catalog";
import type { PaintingAuction } from "@/lib/auctions/types";

const audio: AudioProduct = {
  id: "audio-1",
  slotNumber: 1,
  name: "Audio",
  description: "Digital audio",
  coinPrice: 20,
  thumbnailUrl: "/audio.png",
  previewUrl: null,
  mediaType: "audio",
  mimeType: "audio/mpeg",
  fileExtension: "mp3",
  fileSize: 100,
  originalFilename: "audio.mp3",
  active: true,
  published: true
};

const painting: PaintingAuction = {
  id: "painting-1",
  slug: "painting-1",
  title: "Painting",
  artist: "Artist",
  shortDescription: "Original work",
  fullDescription: "Original work",
  images: ["/painting.png"],
  imageAlt: ["Painting"],
  imageCaptions: [""],
  coverImageIndex: 0,
  dimensions: "24 x 30 in",
  medium: "Canvas",
  yearCreated: 2026,
  condition: "New",
  authenticity: "Signed",
  currentBid: 100,
  startingBid: 100,
  buyNowPrice: 200,
  bidCount: 0,
  bidderCount: 0,
  startsAt: new Date(0).toISOString(),
  endsAt: new Date(Date.now() + 60_000).toISOString(),
  status: "live",
  internationalShippingAllowed: true,
  shippingNotes: "",
  terms: "",
  antiSnipingEnabled: false,
  antiSnipingWindowSeconds: 120,
  antiSnipingExtensionSeconds: 120,
  antiSnipingMaxExtensions: 0,
  extensionCount: 0,
  published: true,
  featured: false
};

test("digital audio is never classified as shippable", () => {
  const product = audioPurchaseProduct(audio);
  assert.equal(product.shippingRequired, false);
  assert.equal(product.taxCategory, "digital_general");
  assert.equal(fulfillmentClass(product), "digital");
  assert.equal(cartRequiresShipping([product]), false);
});

test("paintings remain physical and require a destination", () => {
  const product = paintingPurchaseProduct(toPaintingCartSource(painting));
  assert.equal(product.shippingRequired, true);
  assert.equal(fulfillmentClass(product), "physical");
  assert.equal(cartRequiresShipping([product]), true);
});

test("mixed carts require shipping only because of the physical item", () => {
  const digital = audioPurchaseProduct(audio);
  const physical = paintingPurchaseProduct(toPaintingCartSource(painting));
  assert.equal(cartRequiresShipping([digital, physical]), true);
  assert.equal(digital.shippingRequired, false);
  assert.equal(physical.shippingRequired, true);
});
