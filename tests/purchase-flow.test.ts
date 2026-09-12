import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("one purchase provider owns cart, wallet, totals, and checkout state", async () => {
  const provider = await source("components/purchase/PurchaseProvider.tsx");
  assert.match(provider, /const \[cartProductIds, setCartProductIds\]/);
  assert.match(provider, /const \[cartLines, setCartLines\]/);
  assert.match(provider, /const \[shippingAddress, setShippingAddress\]/);
  assert.match(provider, /const \[tokenBalance, setTokenBalance\]/);
  assert.match(provider, /const summary = useMemo<PurchaseSummary>/);
  assert.match(provider, /canOpenCheckout/);
  assert.match(provider, /const \[stage, setStage\]/);
  assert.equal((provider.match(/reduce\(\(sum, product\)/g) || []).length, 1);
});

test("cart and checkout share cart mutation while checkout alone performs the purchase", async () => {
  const [cart, checkout] = await Promise.all([source("components/purchase/CartModal.tsx"), source("components/purchase/CheckoutModal.tsx")]);
  assert.match(cart, /removeProduct/);
  assert.match(cart, /openCheckout/);
  assert.doesNotMatch(cart, /void checkout\(\)/);
  assert.match(checkout, /removeProduct/);
  assert.match(checkout, /void checkout\(\)/);
});

test("checkout includes protected download guidance and the versioned policy center", async () => {
  const checkout = await source("components/purchase/CheckoutModal.tsx");
  assert.match(checkout, /purchase\.downloadInfo/);
  assert.match(checkout, /purchase\.entitlementProtected/);
  assert.match(checkout, /href="\/policies#terms"/);
  assert.match(checkout, /href="\/policies#refunds"/);
  assert.match(checkout, /purchase\.cancel/);
});

test("shared product contract is ready for digital, physical, and subscription products", async () => {
  const types = await source("lib/purchase/types.ts");
  assert.match(types, /digital_audio.*digital_video.*download.*physical.*subscription/);
  assert.match(types, /quantity: number/);
  assert.match(types, /options: ProductOption\[\]/);
  assert.match(types, /inventoryTracked: boolean/);
  assert.match(types, /shippingRequired: boolean/);
  assert.match(types, /taxCategory: string \| null/);
  assert.match(types, /variantId: string \| null/);
  assert.match(types, /requiresShipping: boolean/);
});

test("server remains authoritative and returns one reusable state packet", async () => {
  const [route, migration] = await Promise.all([source("app/api/audio-clips/route.ts"), source("supabase/migrations/20260722090000_unified_commerce_merch_orders_auctions.sql")]);
  assert.match(route, /purchaseState/);
  assert.match(route, /checkout_commerce_cart/);
  assert.doesNotMatch(route, /body\.coinPrice|body\.tokenBalance|body\.total/);
  assert.match(route, /state: await purchaseState/);
  assert.match(route, /EXPECTED_TOTAL_REQUIRED/);
  assert.match(migration, /p_expected_total<>purchase_total.*PRICE_CHANGED/);
  assert.ok(migration.indexOf("PRICE_CHANGED") < migration.indexOf("update token_wallets set balance_tokens"));
});

test("physical and mixed carts share quantity, reservation, and checkout controls", async () => {
  const [provider, audioRoute, merchRoute, migration] = await Promise.all([
    source("components/purchase/PurchaseProvider.tsx"),
    source("app/api/audio-clips/route.ts"),
    source("app/api/merch/route.ts"),
    source("supabase/migrations/20260722090000_unified_commerce_merch_orders_auctions.sql")
  ]);
  assert.match(provider, /externalCartProducts/);
  assert.match(provider, /summary\.requiresShipping/);
  assert.match(audioRoute, /update_commerce_cart_quantity/);
  assert.match(merchRoute, /update_commerce_cart_quantity/);
  assert.match(migration, /create or replace function public\.update_commerce_cart_quantity/);
  assert.match(migration, /create or replace function public\.reserve_commerce_cart/);
  assert.match(migration, /digital_total>0/);
});

test("modal shell traps focus, closes with Escape, and restores scroll", async () => {
  const shell = await source("components/purchase/PurchaseModalShell.tsx");
  assert.match(shell, /role="dialog"/);
  assert.match(shell, /aria-modal="true"/);
  assert.match(shell, /event\.key === "Escape"/);
  assert.match(shell, /event\.key !== "Tab"/);
  assert.match(shell, /document\.body\.style\.overflow/);
});

test("development checkout preview cannot activate in production", async () => {
  const provider = await source("components/purchase/PurchaseProvider.tsx");
  assert.match(provider, /process\.env\.NODE_ENV !== "production".*purchaseDemo/);
  assert.match(provider, /previewMode\.current/);
});
