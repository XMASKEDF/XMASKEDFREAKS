import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("Merch keeps filters beneath categories and shares the cart trigger", async () => {
  const merch = await source("components/merch/MerchStorefront.tsx");
  assert.ok(merch.indexOf("merch-categories") < merch.indexOf("merch-filter-panel"));
  assert.match(merch, /cartItems=\{cartItems\}/);
  assert.match(merch, /variantId: variant\?\.id/);
  assert.match(merch, /inventory/);
});

test("Audio and Paintings use the same shared cart preview and modal flow", async () => {
  const [audio, paintings, header, adapter, migration] = await Promise.all([
    source("components/audio-store/AudioStorefront.tsx"),
    source("components/paintings/PaintingsStorefront.tsx"),
    source("components/store/StoreHeader.tsx"),
    source("lib/purchase/painting-product.ts"),
    source("supabase/migrations/20260906103000_painting_commerce_cart_products.sql")
  ]);
  assert.match(audio, /PurchaseProvider/);
  assert.match(paintings, /PurchaseProvider<PaintingCartSource>/);
  assert.match(paintings, /PurchaseModals/);
  assert.match(header, /mini-cart-preview/);
  assert.match(adapter, /shippingRequired: true/);
  assert.match(adapter, /maxQuantity: 1/);
  assert.match(migration, /'painting'/);
  assert.match(migration, /painting_commerce_product_sync/);
});

test("Painting cart products remain one-off and unavailable after auction settlement", async () => {
  const adapter = await source("lib/purchase/painting-product.ts");
  assert.match(adapter, /inventoryTracked: true/);
  assert.match(adapter, /inventoryQuantity: buyNowAvailable \? 1 : 0/);
  assert.match(adapter, /allowRepurchase: false/);
});

test("global wallet launcher opens the existing cart without duplicating cart state", async () => {
  const [widget, provider, boundary] = await Promise.all([source("components/account/PersistentAccountWidget.tsx"), source("components/purchase/PurchaseProvider.tsx"), source("components/purchase/GlobalCartBoundary.tsx")]);
  assert.match(widget, /xmf:cart-open/);
  assert.match(widget, /cartCount/);
  assert.doesNotMatch(widget, /fetch\("\/api\/merch"/);
  assert.match(provider, /xmf:cart-open/);
  assert.match(provider, /xmf:cart-updated/);
  assert.match(boundary, /storefrontPath/);
  assert.match(boundary, /PurchaseModals/);
});
