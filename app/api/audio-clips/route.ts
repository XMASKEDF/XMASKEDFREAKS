import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAudioProducts, publicAudioProduct, type AudioProductRecord } from "@/lib/audio-store/catalog";
import { getApiUser, serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { extractClientIp } from "@/lib/security";
import { getMerchCatalog } from "@/lib/commerce/catalog";
import { merchPurchaseProduct } from "@/lib/commerce/types";
import { getPaintingAuctions } from "@/lib/auctions/catalog";
import type { CartLine, ProductOption } from "@/lib/purchase/types";
import { paintingPurchaseProduct, toPaintingCartSource } from "@/lib/purchase/painting-product";
import { audioPurchaseProduct } from "@/lib/purchase/audio-product";
import type { PurchaseProduct, PurchaseQuote } from "@/lib/purchase/types";
import { buildCoinQuote, coinsToCents } from "@/lib/commerce/coins";
import { printifyMode, quotePrintifyShipping, type PrintifyLine } from "@/lib/commerce/printify";
import { quoteApplicableTax } from "@/lib/commerce/tax";
import { cartRequiresShipping, requiresShipping } from "@/lib/commerce/fulfillment";
import { recordVerifiedContribution, startProtectedCheckout } from "@/lib/contribution-server";
import { recordVerifiedAdminEarning } from "@/lib/admin-earnings";
import { normalizeQuantity, normalizeShippingAddress } from "@/lib/commerce/validation";

export const dynamic = "force-dynamic";
const requestLimits = new Map<string, { count: number; resetAt: number }>();

function limited(key: string, maximum = 45) {
  const now = Date.now();
  const current = requestLimits.get(key);
  if (!current || current.resetAt < now) { requestLimits.set(key, { count: 1, resetAt: now + 60_000 }); return false; }
  current.count += 1;
  return current.count > maximum;
}

async function userStoreState(userId: string) {
  const service = serviceCredentials();
  if (!service) return { tokenBalance: 0, cartProductIds: [] as string[], cartLines: [] as CartLine[], cartProducts: [], purchases: [] as Array<Record<string, unknown>> };
  const headers = serviceHeaders(service);
  const [walletResponse, cartResponse, entitlementResponse] = await Promise.all([
    fetch(`${service.url}/rest/v1/token_wallets?user_id=eq.${userId}&select=balance_tokens&limit=1`, { cache: "no-store", headers }),
    fetch(`${service.url}/rest/v1/commerce_carts?user_id=eq.${userId}&select=id&limit=1`, { cache: "no-store", headers }),
    fetch(`${service.url}/rest/v1/purchase_entitlements?user_id=eq.${userId}&revoked_at=is.null&select=id,product_id,order_item_id,granted_at,download_count,last_downloaded_at&order=granted_at.desc`, { cache: "no-store", headers })
  ]);
  const wallets = walletResponse.ok ? await walletResponse.json() as Array<{ balance_tokens: number }> : [];
  const carts = cartResponse.ok ? await cartResponse.json() as Array<{ id: string }> : [];
  const entitlements = entitlementResponse.ok ? await entitlementResponse.json() as Array<Record<string, unknown>> : [];
  let cartProductIds: string[] = []; let cartLines: CartLine[] = [];
  if (carts[0]?.id) {
    const itemsResponse = await fetch(`${service.url}/rest/v1/commerce_cart_items?cart_id=eq.${carts[0].id}&select=id,product_id,variant_id,quantity,selected_options&order=created_at.asc`, { cache: "no-store", headers });
    if (itemsResponse.ok) { cartLines = (await itemsResponse.json() as Array<Record<string, unknown>>).map((item) => ({ id: String(item.id), productId: String(item.product_id), variantId: item.variant_id ? String(item.variant_id) : null, quantity: Number(item.quantity || 1), options: Array.isArray(item.selected_options) ? item.selected_options as ProductOption[] : [] })); cartProductIds = cartLines.map((item) => item.productId); }
  }
  const orderItemIds = entitlements.map((item) => String(item.order_item_id)).filter(Boolean);
  let itemMap = new Map<string, Record<string, unknown>>();
  if (orderItemIds.length) {
    const itemsResponse = await fetch(`${service.url}/rest/v1/digital_order_items?id=in.(${orderItemIds.join(",")})&select=id,order_id,product_name_snapshot,file_extension_snapshot`, { cache: "no-store", headers });
    if (itemsResponse.ok) itemMap = new Map((await itemsResponse.json() as Array<Record<string, unknown>>).map((item) => [String(item.id), item]));
  }
  const orderIds = [...new Set([...itemMap.values()].map((item) => String(item.order_id)).filter(Boolean))];
  let orderMap = new Map<string, Record<string, unknown>>();
  if (orderIds.length) {
    const ordersResponse = await fetch(`${service.url}/rest/v1/digital_orders?id=in.(${orderIds.join(",")})&select=id,created_at`, { cache: "no-store", headers });
    if (ordersResponse.ok) orderMap = new Map((await ordersResponse.json() as Array<Record<string, unknown>>).map((item) => [String(item.id), item]));
  }
  const purchases = entitlements.map((entitlement) => {
    const orderItem = itemMap.get(String(entitlement.order_item_id)) || {};
    const order = orderMap.get(String(orderItem.order_id)) || {};
    return { entitlementId: entitlement.id, productId: entitlement.product_id, productName: orderItem.product_name_snapshot, fileExtension: orderItem.file_extension_snapshot, grantedAt: entitlement.granted_at, downloadCount: entitlement.download_count, lastDownloadedAt: entitlement.last_downloaded_at, orderId: orderItem.order_id, orderCreatedAt: order.created_at };
  });
  const [merch, paintingData] = await Promise.all([getMerchCatalog(false), getPaintingAuctions(false)]);
  const cartProducts = [
    ...merch.products.filter((product) => cartProductIds.includes(product.id)).map(merchPurchaseProduct),
    ...paintingData.auctions.filter((auction) => cartProductIds.includes(auction.id)).map(toPaintingCartSource).map(paintingPurchaseProduct)
  ];
  return { tokenBalance: Number(wallets[0]?.balance_tokens || 0), cartProductIds, cartLines, cartProducts, purchases };
}

async function purchaseState(userId: string, suppliedProducts?: AudioProductRecord[]) {
  const products = suppliedProducts || await getAudioProducts(false);
  const state = await userStoreState(userId);
  const purchased = new Set(state.purchases.map((item) => String(item.productId)));
  return { ...state, authenticated: true, products: products.map((product) => publicAudioProduct(product, purchased.has(product.id))) };
}

export async function GET(request: NextRequest) {
  const user = await getApiUser(request);
  const products = await getAudioProducts(false);
  if (!user) return NextResponse.json({ ok: true, authenticated: false, tokenBalance: null, cartProductIds: [], cartLines: [], cartProducts: [], purchases: [], products: products.map((product) => publicAudioProduct(product)) });
  return NextResponse.json({ ok: true, ...await purchaseState(user.id, products) });
}

export async function POST(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return NextResponse.json({ ok: false, code: "AUTH_REQUIRED", message: "Sign in before managing your audio cart." }, { status: 401 });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ ok: false, code: "STORE_UNAVAILABLE", message: "The secure audio store is not connected." }, { status: 503 });
  const ip = extractClientIp(request.headers);
  if (limited(`${user.id}:${ip}`)) return NextResponse.json({ ok: false, code: "RATE_LIMITED", message: "Too many store requests. Wait one minute and retry." }, { status: 429 });
  const body = await request.json().catch(() => ({})) as { action?: string; productId?: string; cartLineId?: string; quantity?: number; idempotencyKey?: string; expectedTotal?: number; shippingAddress?: unknown };
  const headers = serviceHeaders(service);

  if (body.action === "reserve") { const reserve = await fetch(`${service.url}/rest/v1/rpc/reserve_commerce_cart`, { method: "POST", headers, body: JSON.stringify({ p_user_id: user.id, p_minutes: 15 }) }); return reserve.ok ? NextResponse.json({ ok: true, state: await purchaseState(user.id) }) : NextResponse.json({ ok: false, message: "Inventory changed. Review the cart." }, { status: 409 }); }

  if (body.action === "quote") {
    const cartResponse = await fetch(`${service.url}/rest/v1/commerce_carts?user_id=eq.${user.id}&select=id&limit=1`, { headers });
    const [cart] = cartResponse.ok ? await cartResponse.json() as Array<{ id: string }> : [];
    if (!cart) return NextResponse.json({ ok: false, code: "CART_EMPTY", message: "Your cart is empty." }, { status: 404 });
    const itemsResponse = await fetch(`${service.url}/rest/v1/commerce_cart_items?cart_id=eq.${cart.id}&select=id,product_id,variant_id,quantity,selected_options&order=created_at.asc`, { cache: "no-store", headers });
    const items = itemsResponse.ok ? await itemsResponse.json() as Array<{ id: string; product_id: string; variant_id: string | null; quantity: number; selected_options: ProductOption[] }> : [];
    if (!items.length) return NextResponse.json({ ok: false, code: "CART_EMPTY", message: "Your cart is empty." }, { status: 404 });
    const [merch, audio, paintingData] = await Promise.all([getMerchCatalog(false), getAudioProducts(false), getPaintingAuctions(false)]);
    const products: PurchaseProduct[] = [
      ...merch.products.map(merchPurchaseProduct),
      ...audio.map((product) => audioPurchaseProduct(publicAudioProduct(product))),
      ...paintingData.auctions.map(toPaintingCartSource).map(paintingPurchaseProduct)
    ];
    let merchandiseCoins = 0;
    let hasPhysicalItems = false;
    const printifyLines: PrintifyLine[] = [];
    const taxCodes: string[] = [];
    for (const line of items) {
      const product = products.find((item) => item.id === line.product_id);
      const variant = product?.variants?.find((item) => item.id === line.variant_id);
      if (!product || !product.active || !product.published || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || (product.inventoryTracked && line.quantity > Number(variant?.inventoryQuantity ?? product.inventoryQuantity ?? 0))) {
        return NextResponse.json({ ok: false, code: "PRODUCT_UNAVAILABLE", message: "A cart item changed or became unavailable. Review the cart." }, { status: 409 });
      }
      merchandiseCoins += (variant?.coinPrice ?? product.coinPrice) * line.quantity;
      hasPhysicalItems ||= requiresShipping(product);
      taxCodes.push(product.taxCategory || (requiresShipping(product) ? "physical_general" : "digital_general"));
      if (product.shippingRequired && product.storeId === "merch") {
        if (!product.fulfillmentEnabled || !product.printifyProductId || !variant?.printifyVariantId || !variant.fulfillmentAvailable) return NextResponse.json({ ok: false, code: "FULFILLMENT_UNAVAILABLE", message: "A merchandise item is not mapped to an available fulfillment variant." }, { status: 409 });
        printifyLines.push({ productId: product.printifyProductId, variantId: variant.printifyVariantId, quantity: line.quantity, externalId: line.id });
      }
    }
    if (!cartRequiresShipping(items.map((line) => products.find((product) => product.id === line.product_id)).filter((product): product is PurchaseProduct => Boolean(product)))) {
      const quote = buildCoinQuote({ merchandiseCents: coinsToCents(merchandiseCoins), shippingCents: 0, taxCents: 0 });
      return NextResponse.json({ ok: true, quote: { id: "digital-only", merchandiseCents: quote.merchandiseCents, merchandiseCoins: quote.merchandiseCoins, shippingCents: 0, shippingCoins: 0, taxCents: 0, taxCoins: 0, totalCents: quote.totalCents, totalCoins: quote.totalCoins, coinValueCents: 50 as const, roundingAdjustmentCents: quote.roundingAdjustmentCents, shippingMethod: "none", shippingProvider: "none", taxProvider: "none", expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() } satisfies PurchaseQuote });
    }
    const address = normalizeShippingAddress(body.shippingAddress);
    if (!address || !hasPhysicalItems) return NextResponse.json({ ok: false, code: "SHIPPING_REQUIRED", message: "Complete the delivery address before calculating the final total." }, { status: 400 });
    if (printifyLines.length && printifyMode() !== "live") return NextResponse.json({ ok: false, code: "PRINTIFY_LIVE_REQUIRED", message: "Physical merchandise checkout is not live yet. Review the cart without charging your wallet." }, { status: 503 });
    const shipping = printifyLines.length ? await quotePrintifyShipping({ address, email: user.email || "", lines: printifyLines }) : { ok: true as const, amountCents: 0, method: "manual" };
    if (!shipping.ok || shipping.amountCents === null || !shipping.method) return NextResponse.json({ ok: false, code: "SHIPPING_UNAVAILABLE", message: "A shipping method could not be verified. Your wallet was not changed." }, { status: 409 });
    const tax = await quoteApplicableTax({ address, merchandiseCents: coinsToCents(merchandiseCoins), shippingCents: shipping.amountCents, taxCodes, reference: randomUUID() });
    if (!tax.ok || tax.amountCents === null || !tax.provider) return NextResponse.json({ ok: false, code: "TAX_UNAVAILABLE", message: "Applicable tax could not be verified. Your wallet was not changed." }, { status: 503 });
    const quote = buildCoinQuote({ merchandiseCents: coinsToCents(merchandiseCoins), shippingCents: shipping.amountCents, taxCents: tax.amountCents });
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const saved = await fetch(`${service.url}/rest/v1/commerce_checkout_quotes`, { method: "POST", headers: serviceHeaders(service, "return=representation"), body: JSON.stringify({ user_id: user.id, cart_id: cart.id, address_snapshot: address, cart_snapshot: items, merchandise_minor: quote.merchandiseCents, merchandise_coins: quote.merchandiseCoins, shipping_minor: quote.shippingCents, shipping_coins: quote.shippingCoins, tax_minor: quote.taxCents, tax_coins: quote.taxCoins, total_minor: quote.totalCents, total_coins: quote.totalCoins, coin_value_minor: quote.coinValueCents, rounding_adjustment_minor: quote.roundingAdjustmentCents, shipping_method: shipping.method, shipping_provider: printifyLines.length ? "printify" : "manual", tax_provider: tax.provider, expires_at: expiresAt }) });
    const [row] = saved.ok ? await saved.json() as Array<Record<string, unknown>> : [];
    if (!row) return NextResponse.json({ ok: false, code: "QUOTE_SAVE_FAILED", message: "The secure quote could not be saved. Your wallet was not changed." }, { status: 503 });
    const quotePayload = { id: String(row.id), merchandiseCents: Number(row.merchandise_minor), merchandiseCoins: Number(row.merchandise_coins), shippingCents: Number(row.shipping_minor), shippingCoins: Number(row.shipping_coins), taxCents: Number(row.tax_minor), taxCoins: Number(row.tax_coins), totalCents: Number(row.total_minor), totalCoins: Number(row.total_coins), coinValueCents: 50 as const, roundingAdjustmentCents: Number(row.rounding_adjustment_minor), shippingMethod: String(row.shipping_method), shippingProvider: String(row.shipping_provider), taxProvider: String(row.tax_provider), expiresAt: String(row.expires_at) } satisfies PurchaseQuote;
    return NextResponse.json({ ok: true, quote: quotePayload });
  }

  if (body.action === "checkout") {
    const key = String(request.headers.get("idempotency-key") || body.idempotencyKey || randomUUID()).slice(0, 120);
    const expectedTotal = Number.isSafeInteger(body.expectedTotal) && Number(body.expectedTotal) > 0 ? Number(body.expectedTotal) : null;
    if (expectedTotal === null) return NextResponse.json({ ok: false, code: "EXPECTED_TOTAL_REQUIRED", message: "Review the current order total before confirming checkout." }, { status: 400 });
    const address = body.shippingAddress ? normalizeShippingAddress(body.shippingAddress) : null;
    if (body.shippingAddress && !address) return NextResponse.json({ ok: false, code: "SHIPPING_REQUIRED", message: "Complete the delivery address before checkout." }, { status: 400 });
    await startProtectedCheckout(user.id, "audio_checkout", key);
    const checkout = await fetch(`${service.url}/rest/v1/rpc/checkout_commerce_cart`, { method: "POST", headers, body: JSON.stringify({ p_user_id: user.id, p_idempotency_key: key, p_expected_total: expectedTotal, p_shipping_address: address }) }).catch(() => null);
    if (!checkout?.ok) {
      const detail = await checkout?.text().catch(() => "") || "";
      const code = detail.includes("INSUFFICIENT_TOKENS") ? "INSUFFICIENT_TOKENS" : detail.includes("PRICE_CHANGED") ? "PRICE_CHANGED" : detail.includes("PRODUCT_UNAVAILABLE") ? "PRODUCT_UNAVAILABLE" : detail.includes("SHIPPING_REQUIRED") ? "SHIPPING_REQUIRED" : detail.includes("CART_EMPTY") ? "CART_EMPTY" : "CHECKOUT_FAILED";
      const messages = { INSUFFICIENT_TOKENS: "Your wallet does not have enough coins.", PRICE_CHANGED: "A product price changed. Review the updated total before confirming again.", PRODUCT_UNAVAILABLE: "A product changed or became unavailable. Your wallet was not charged.", SHIPPING_REQUIRED: "Complete the delivery address for the physical item in your cart.", CART_EMPTY: "Your cart is empty.", CHECKOUT_FAILED: "Checkout could not be completed. Your wallet was not charged." };
      return NextResponse.json({ ok: false, code, message: messages[code] }, { status: code === "INSUFFICIENT_TOKENS" ? 409 : 422 });
    }
    const result = await checkout.json() as Record<string, unknown>;
    await recordVerifiedContribution({ userId: user.id, category: "digital_purchase", coins: expectedTotal, transactionReference: String(result.orderId || result.order_id || key), source: "audio_checkout" });
    await recordVerifiedAdminEarning({ category: "audio_clip", sourceType: "audio_order", sourceId: String(result.orderId || result.order_id || key), amountMinor: expectedTotal * 25 });
    return NextResponse.json({ ok: true, ...result, state: await purchaseState(user.id) });
  }

  const productId = String(body.productId || "");
  const cartResponse = await fetch(`${service.url}/rest/v1/commerce_carts?user_id=eq.${user.id}&select=id&limit=1`, { headers });
  let [cart] = cartResponse.ok ? await cartResponse.json() as Array<{ id: string }> : [];
  if (!cart) {
    const create = await fetch(`${service.url}/rest/v1/commerce_carts`, { method: "POST", headers: serviceHeaders(service, "return=representation"), body: JSON.stringify({ user_id: user.id }) });
    if (!create.ok) return NextResponse.json({ ok: false, message: "Unable to create your cart." }, { status: 422 });
    [cart] = await create.json() as Array<{ id: string }>;
  }
  if (body.action === "remove") {
    await fetch(`${service.url}/rest/v1/commerce_cart_items?id=eq.${encodeURIComponent(String(body.cartLineId || productId))}&cart_id=eq.${cart.id}`, { method: "DELETE", headers });
    return NextResponse.json({ ok: true, state: await purchaseState(user.id) });
  }
  if (body.action === "quantity") {
    const quantity = normalizeQuantity(body.quantity, 25);
    if (!quantity) return NextResponse.json({ ok: false, code: "QUANTITY_INVALID", message: "Choose a valid quantity." }, { status: 400 });
    const updated = await fetch(`${service.url}/rest/v1/rpc/update_commerce_cart_quantity`, { method: "POST", headers, body: JSON.stringify({ p_user_id: user.id, p_cart_item_id: String(body.cartLineId || ""), p_quantity: quantity }) }).catch(() => null);
    if (!updated?.ok) return NextResponse.json({ ok: false, code: "INVENTORY_CHANGED", message: "Quantity exceeds current inventory or the customer limit." }, { status: 409 });
    return NextResponse.json({ ok: true, state: await purchaseState(user.id) });
  }
  if (body.action !== "add") return NextResponse.json({ ok: false, message: "Unsupported cart action." }, { status: 400 });
  const publicProducts = await getAudioProducts(false);
  const audioProduct = publicProducts.find((item) => item.id === productId);
  const paintingData = audioProduct ? null : await getPaintingAuctions(false);
  const painting = paintingData?.auctions.find((item) => item.id === productId) || null;
  if (!audioProduct && !painting) return NextResponse.json({ ok: false, code: "PRODUCT_UNAVAILABLE", message: "This product is not currently available." }, { status: 409 });
  if (audioProduct) {
    if (!audioProduct.active || !audioProduct.published || !audioProduct.productFilePath) return NextResponse.json({ ok: false, code: "PRODUCT_UNAVAILABLE", message: "This product is not currently available." }, { status: 409 });
    const entitlement = await fetch(`${service.url}/rest/v1/purchase_entitlements?user_id=eq.${user.id}&product_id=eq.${productId}&revoked_at=is.null&select=id&limit=1`, { headers });
    if (!audioProduct.allowRepurchase && entitlement.ok && (await entitlement.json() as unknown[]).length) return NextResponse.json({ ok: false, code: "ALREADY_PURCHASED", message: "This product is already in My Purchases." }, { status: 409 });
  } else if (!painting || painting.buyNowPrice === null || !["live", "extended"].includes(painting.status) || !painting.published) {
    return NextResponse.json({ ok: false, code: "PRODUCT_UNAVAILABLE", message: "This painting is no longer available for Buy Now." }, { status: 409 });
  }
  const added = await fetch(`${service.url}/rest/v1/commerce_cart_items`, { method: "POST", headers: serviceHeaders(service, "resolution=merge-duplicates,return=minimal"), body: JSON.stringify({ cart_id: cart.id, product_id: productId, quantity: 1, selected_options: [] }) });
  if (!added.ok) return NextResponse.json({ ok: false, message: "The product could not be added to your cart." }, { status: 422 });
  return NextResponse.json({ ok: true, state: await purchaseState(user.id, publicProducts) });
}
