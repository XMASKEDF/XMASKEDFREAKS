import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getApiUser, serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { getMerchCatalog } from "@/lib/commerce/catalog";
import { buildCoinQuote, coinsToCents } from "@/lib/commerce/coins";
import { printifyMode, quotePrintifyShipping, type PrintifyLine } from "@/lib/commerce/printify";
import { quoteApplicableTax } from "@/lib/commerce/tax";
import { merchPurchaseProduct } from "@/lib/commerce/types";
import { normalizeQuantity, normalizeShippingAddress } from "@/lib/commerce/validation";
import { extractClientIp } from "@/lib/security";
import type { CartLine, ProductOption } from "@/lib/purchase/types";
import { getAudioProducts, publicAudioProduct } from "@/lib/audio-store/catalog";
import { audioPurchaseProduct } from "@/lib/purchase/audio-product";
import { getPaintingAuctions } from "@/lib/auctions/catalog";
import { paintingPurchaseProduct, toPaintingCartSource } from "@/lib/purchase/painting-product";
import type { PurchaseProduct, PurchaseQuote } from "@/lib/purchase/types";
import { recordVerifiedContribution, startProtectedCheckout } from "@/lib/contribution-server";
import { recordVerifiedAdminEarning } from "@/lib/admin-earnings";
import { requiresShipping } from "@/lib/commerce/fulfillment";

export const dynamic = "force-dynamic";
const limits = new Map<string, { count: number; resetAt: number }>();
function limited(key: string) { const now = Date.now(); const value = limits.get(key); if (!value || value.resetAt < now) { limits.set(key, { count: 1, resetAt: now + 60_000 }); return false; } value.count += 1; return value.count > 45; }

async function cartForUser(userId: string) {
  const service = serviceCredentials();
  if (!service) return null;
  const headers = serviceHeaders(service);
  const cartResponse = await fetch(`${service.url}/rest/v1/commerce_carts?user_id=eq.${userId}&select=id&limit=1`, { cache: "no-store", headers });
  const [cart] = cartResponse.ok ? await cartResponse.json() as Array<{ id: string }> : [];
  if (!cart) return null;
  const itemsResponse = await fetch(`${service.url}/rest/v1/commerce_cart_items?cart_id=eq.${cart.id}&select=id,product_id,variant_id,quantity,selected_options&order=created_at.asc`, { cache: "no-store", headers });
  const items = itemsResponse.ok ? await itemsResponse.json() as Array<{ id: string; product_id: string; variant_id: string | null; quantity: number; selected_options: ProductOption[] }> : [];
  return { id: cart.id, items };
}

function quotePayload(row: Record<string, unknown>): PurchaseQuote {
  return {
    id: String(row.id),
    merchandiseCents: Number(row.merchandise_minor),
    merchandiseCoins: Number(row.merchandise_coins),
    shippingCents: Number(row.shipping_minor),
    shippingCoins: Number(row.shipping_coins),
    taxCents: Number(row.tax_minor),
    taxCoins: Number(row.tax_coins),
    totalCents: Number(row.total_minor),
    totalCoins: Number(row.total_coins),
    coinValueCents: 50,
    roundingAdjustmentCents: Number(row.rounding_adjustment_minor),
    shippingMethod: String(row.shipping_method),
    shippingProvider: String(row.shipping_provider),
    taxProvider: String(row.tax_provider),
    expiresAt: String(row.expires_at)
  };
}

async function commerceState(userId: string) {
  const service = serviceCredentials();
  const catalog = await getMerchCatalog(false);
  if (!service) return { authenticated: true, tokenBalance: 0, products: catalog.products, cartProductIds: [], cartLines: [] as CartLine[], purchases: [] };
  const headers = serviceHeaders(service);
  const [walletResponse, cartResponse] = await Promise.all([
    fetch(`${service.url}/rest/v1/token_wallets?user_id=eq.${userId}&select=balance_tokens&limit=1`, { cache: "no-store", headers }),
    fetch(`${service.url}/rest/v1/commerce_carts?user_id=eq.${userId}&select=id&limit=1`, { cache: "no-store", headers })
  ]);
  const wallets = walletResponse.ok ? await walletResponse.json() as Array<{ balance_tokens: number }> : [];
  const carts = cartResponse.ok ? await cartResponse.json() as Array<{ id: string }> : [];
  let cartLines: CartLine[] = [];
  if (carts[0]?.id) {
    const response = await fetch(`${service.url}/rest/v1/commerce_cart_items?cart_id=eq.${carts[0].id}&select=id,product_id,variant_id,quantity,selected_options&order=created_at.asc`, { cache: "no-store", headers });
    if (response.ok) cartLines = (await response.json() as Array<Record<string, unknown>>).map((line) => ({ id: String(line.id), productId: String(line.product_id), variantId: line.variant_id ? String(line.variant_id) : null, quantity: Number(line.quantity || 1), options: Array.isArray(line.selected_options) ? line.selected_options as ProductOption[] : [] }));
  }
  const [audio, paintingData] = await Promise.all([getAudioProducts(false), getPaintingAuctions(false)]);
  const cartIds = cartLines.map((line) => line.productId);
  const cartProducts = [
    ...audio.filter((product) => cartIds.includes(product.id)).map((product) => audioPurchaseProduct(publicAudioProduct(product))),
    ...paintingData.auctions.filter((auction) => cartIds.includes(auction.id)).map(toPaintingCartSource).map(paintingPurchaseProduct)
  ];
  return { authenticated: true, tokenBalance: Number(wallets[0]?.balance_tokens || 0), products: catalog.products, cartProductIds: cartIds, cartLines, cartProducts, purchases: [] };
}

export async function GET(request: NextRequest) {
  const [user, catalog] = await Promise.all([getApiUser(request), getMerchCatalog(false)]);
  if (!user) return NextResponse.json({ ok: true, authenticated: false, tokenBalance: null, products: catalog.products, cartProductIds: [], cartLines: [], purchases: [] });
  return NextResponse.json({ ok: true, ...await commerceState(user.id) });
}

export async function POST(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return NextResponse.json({ ok: false, code: "AUTH_REQUIRED", message: "Sign in before managing your cart." }, { status: 401 });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ ok: false, code: "STORE_UNAVAILABLE", message: "The secure merchandise store is not connected." }, { status: 503 });
  if (limited(`${user.id}:${extractClientIp(request.headers)}`)) return NextResponse.json({ ok: false, code: "RATE_LIMITED", message: "Too many store requests. Wait one minute and retry." }, { status: 429 });
  const body = await request.json().catch(() => ({})) as { action?: string; productId?: string; variantId?: string | null; cartLineId?: string; quantity?: number; options?: ProductOption[]; idempotencyKey?: string; expectedTotal?: number; quoteId?: string; shippingAddress?: unknown };
  const headers = serviceHeaders(service);
  if (body.action === "reserve") { const response = await fetch(`${service.url}/rest/v1/rpc/reserve_commerce_cart`, { method: "POST", headers, body: JSON.stringify({ p_user_id: user.id, p_minutes: 15 }) }).catch(() => null); if (!response?.ok) return NextResponse.json({ ok: false, code: "INVENTORY_CHANGED", message: "One or more items are no longer available. Review your cart." }, { status: 409 }); return NextResponse.json({ ok: true, reservation: await response.json(), state: await commerceState(user.id) }); }
  if (body.action === "quote") {
    const cart = await cartForUser(user.id);
    if (!cart?.items.length) return NextResponse.json({ ok: false, code: "CART_EMPTY", message: "Your cart is empty." }, { status: 404 });
    const reservation = await fetch(`${service.url}/rest/v1/rpc/reserve_commerce_cart`, { method: "POST", headers, body: JSON.stringify({ p_user_id: user.id, p_minutes: 15 }) }).catch(() => null);
    if (!reservation?.ok) return NextResponse.json({ ok: false, code: "INVENTORY_CHANGED", message: "One or more items are no longer available. Your wallet was not changed." }, { status: 409 });
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
    for (const line of cart.items) {
      const product = products.find((item) => item.id === line.product_id);
      const variant = product?.variants?.find((item) => item.id === line.variant_id);
      if (!product || !product.active || !product.published || !Number.isSafeInteger(line.quantity) || line.quantity < 1) {
        return NextResponse.json({ ok: false, code: "PRODUCT_UNAVAILABLE", message: "A cart item is no longer available. Your wallet was not changed." }, { status: 409 });
      }
      merchandiseCoins += (variant?.coinPrice ?? product.coinPrice) * line.quantity;
      hasPhysicalItems ||= requiresShipping(product);
      taxCodes.push(product.taxCategory || (requiresShipping(product) ? "physical_general" : "digital_general"));
      if (product.shippingRequired && product.storeId === "merch") {
        if (!product.fulfillmentEnabled || !product.printifyProductId || !variant?.printifyVariantId || !variant.fulfillmentAvailable) {
          return NextResponse.json({ ok: false, code: "FULFILLMENT_UNAVAILABLE", message: `${product.name} is not mapped to an available Printify variant. Your wallet was not changed.` }, { status: 409 });
        }
        printifyLines.push({ productId: product.printifyProductId, variantId: variant.printifyVariantId, quantity: line.quantity, externalId: line.id });
      }
    }
    if (!hasPhysicalItems) {
      const quote = buildCoinQuote({ merchandiseCents: coinsToCents(merchandiseCoins), shippingCents: 0, taxCents: 0 });
      return NextResponse.json({ ok: true, quote: { id: "digital-only", merchandiseCents: quote.merchandiseCents, merchandiseCoins: quote.merchandiseCoins, shippingCents: 0, shippingCoins: 0, taxCents: 0, taxCoins: 0, totalCents: quote.totalCents, totalCoins: quote.totalCoins, coinValueCents: 50 as const, roundingAdjustmentCents: quote.roundingAdjustmentCents, shippingMethod: "none", shippingProvider: "none", taxProvider: "none", expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() } satisfies PurchaseQuote });
    }
    const address = normalizeShippingAddress(body.shippingAddress);
    if (!address) return NextResponse.json({ ok: false, code: "SHIPPING_REQUIRED", message: "Complete the delivery address before calculating the final total." }, { status: 400 });
    if (printifyLines.length && printifyMode() !== "live") return NextResponse.json({ ok: false, code: "PRINTIFY_LIVE_REQUIRED", message: "Physical merchandise checkout is not live yet. ADMIN must connect and verify Printify before customer orders can be charged." }, { status: 503 });
    if (printifyLines.length && !user.email) return NextResponse.json({ ok: false, code: "EMAIL_REQUIRED", message: "A verified account email is required for physical fulfillment." }, { status: 400 });
    const shipping = printifyLines.length ? await quotePrintifyShipping({ address, email: user.email || "", lines: printifyLines }) : { ok: true as const, code: null, amountCents: 0, method: "manual" };
    if (!shipping.ok || shipping.amountCents === null || !shipping.method) {
      return NextResponse.json({ ok: false, code: shipping.code, message: "Printify could not provide a shipping method for this address. Your wallet was not changed." }, { status: 409 });
    }
    const merchandiseCents = coinsToCents(merchandiseCoins);
    const reference = randomUUID();
    const tax = await quoteApplicableTax({ address, merchandiseCents, shippingCents: shipping.amountCents, taxCodes, reference });
    if (!tax.ok || tax.amountCents === null || !tax.provider) {
      return NextResponse.json({ ok: false, code: tax.code, message: "Applicable tax could not be verified. Checkout remains blocked and your wallet was not changed." }, { status: 503 });
    }
    const quote = buildCoinQuote({ merchandiseCents, shippingCents: shipping.amountCents, taxCents: tax.amountCents });
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const insert = await fetch(`${service.url}/rest/v1/commerce_checkout_quotes`, {
      method: "POST",
      headers: serviceHeaders(service, "return=representation"),
      body: JSON.stringify({
        user_id: user.id,
        cart_id: cart.id,
        address_snapshot: address,
        cart_snapshot: cart.items,
        merchandise_minor: quote.merchandiseCents,
        merchandise_coins: quote.merchandiseCoins,
        shipping_minor: quote.shippingCents,
        shipping_coins: quote.shippingCoins,
        tax_minor: quote.taxCents,
        tax_coins: quote.taxCoins,
        total_minor: quote.totalCents,
        total_coins: quote.totalCoins,
        coin_value_minor: quote.coinValueCents,
        rounding_adjustment_minor: quote.roundingAdjustmentCents,
        shipping_method: shipping.method,
        shipping_provider: printifyLines.length ? "printify" : "manual",
        tax_provider: tax.provider,
        expires_at: expiresAt
      })
    });
    const [saved] = insert.ok ? await insert.json() as Record<string, unknown>[] : [];
    if (!saved) return NextResponse.json({ ok: false, code: "QUOTE_SAVE_FAILED", message: "The secure quote could not be saved. Your wallet was not changed." }, { status: 503 });
    await fetch(`${service.url}/rest/v1/analytics_events`, { method: "POST", headers: serviceHeaders(service, "resolution=ignore-duplicates,return=minimal"), body: JSON.stringify({ event_type: "merch_checkout_quote_generated", event_key: `merch-quote:${String(saved.id)}`, user_id: user.id, page_path: "/merch", content_type: "physical_merch", content_id: String(saved.id), country_code: address.country.slice(0, 80), metadata: { merchandiseCoins: quote.merchandiseCoins, shippingCoins: quote.shippingCoins, taxCoins: quote.taxCoins, totalCoins: quote.totalCoins, totalMinor: quote.totalCents, shippingMethod: shipping.method } }) });
    return NextResponse.json({ ok: true, quote: quotePayload(saved) });
  }
  if (body.action === "checkout") {
    if (body.quoteId) {
      const key = String(request.headers.get("idempotency-key") || body.idempotencyKey || randomUUID()).slice(0, 120);
      await startProtectedCheckout(user.id, "merch_checkout", key);
      const response = await fetch(`${service.url}/rest/v1/rpc/complete_printify_merch_checkout`, { method: "POST", headers, body: JSON.stringify({ p_user_id: user.id, p_quote_id: body.quoteId, p_idempotency_key: key }) }).catch(() => null);
      if (!response?.ok) {
        const detail = await response?.text().catch(() => "") || "";
        const code = ["INSUFFICIENT_TOKENS", "PRICE_CHANGED", "CART_CHANGED", "QUOTE_EXPIRED", "QUOTE_USED", "QUOTE_NOT_FOUND", "QUOTE_INVALID", "FULFILLMENT_UNAVAILABLE", "INTERNATIONAL_UNAVAILABLE", "CART_EMPTY"].find((value) => detail.includes(value)) || "CHECKOUT_FAILED";
        return NextResponse.json({ ok: false, code, message: "The order was not completed. Your wallet and inventory were not changed." }, { status: 409 });
      }
      const result = await response.json() as Record<string, unknown>;
      await recordVerifiedContribution({ userId: user.id, category: "merchandise", coins: Math.max(0, Math.floor(Number(result.totalCoins || result.total_coins || 0))), transactionReference: String(result.orderId || result.order_id || key), source: "printify_merch_checkout" });
      await recordVerifiedAdminEarning({ category: "merchandise", sourceType: "merch_order", sourceId: String(result.orderId || result.order_id || key), amountMinor: Math.max(0, Math.floor(Number(result.totalCoins || result.total_coins || 0))) * 25 });
      return NextResponse.json({ ok: true, ...result, state: await commerceState(user.id) });
    }
    const expectedTotal = Number.isSafeInteger(body.expectedTotal) && Number(body.expectedTotal) > 0 ? Number(body.expectedTotal) : null;
    const address = normalizeShippingAddress(body.shippingAddress);
    if (expectedTotal === null) return NextResponse.json({ ok: false, code: "EXPECTED_TOTAL_REQUIRED", message: "Review the current total before checkout." }, { status: 400 });
    if (body.shippingAddress && !address) return NextResponse.json({ ok: false, code: "SHIPPING_REQUIRED", message: "Complete the delivery address before checkout." }, { status: 400 });
    const key = String(request.headers.get("idempotency-key") || body.idempotencyKey || randomUUID()).slice(0, 120);
    await startProtectedCheckout(user.id, "merch_checkout", key);
    const response = await fetch(`${service.url}/rest/v1/rpc/checkout_commerce_cart`, { method: "POST", headers, body: JSON.stringify({ p_user_id: user.id, p_idempotency_key: key, p_expected_total: expectedTotal, p_shipping_address: address }) }).catch(() => null);
    if (!response?.ok) { const detail = await response?.text().catch(() => "") || ""; const code = ["INSUFFICIENT_TOKENS", "PRICE_CHANGED", "INVENTORY_CHANGED", "PRODUCT_UNAVAILABLE", "SHIPPING_REQUIRED", "INTERNATIONAL_UNAVAILABLE", "CART_EMPTY"].find((value) => detail.includes(value)) || "CHECKOUT_FAILED"; return NextResponse.json({ ok: false, code, message: "Checkout could not be completed. Your wallet and inventory were not changed." }, { status: 409 }); }
    const result = await response.json() as Record<string, unknown>;
    await recordVerifiedContribution({ userId: user.id, category: "merchandise", coins: expectedTotal, transactionReference: String(result.orderId || result.order_id || key), source: "merch_checkout" });
    await recordVerifiedAdminEarning({ category: "merchandise", sourceType: "merch_order", sourceId: String(result.orderId || result.order_id || key), amountMinor: expectedTotal * 25 });
    return NextResponse.json({ ok: true, ...result, state: await commerceState(user.id) });
  }
  if (body.action === "remove" || body.action === "quantity") {
    const cartResponse = await fetch(`${service.url}/rest/v1/commerce_carts?user_id=eq.${user.id}&select=id&limit=1`, { headers });
    const [cart] = cartResponse.ok ? await cartResponse.json() as Array<{ id: string }> : [];
    if (!cart) return NextResponse.json({ ok: false, code: "CART_EMPTY", message: "Your cart is empty." }, { status: 404 });
    const lineId = String(body.cartLineId || "");
    if (body.action === "remove") {
      await fetch(`${service.url}/rest/v1/commerce_cart_items?id=eq.${encodeURIComponent(lineId)}&cart_id=eq.${cart.id}`, { method: "DELETE", headers });
      return NextResponse.json({ ok: true, state: await commerceState(user.id) });
    }
    const quantity = normalizeQuantity(body.quantity, 25);
    if (!quantity) return NextResponse.json({ ok: false, code: "QUANTITY_INVALID", message: "Choose a valid quantity." }, { status: 400 });
    const updated = await fetch(`${service.url}/rest/v1/rpc/update_commerce_cart_quantity`, { method: "POST", headers, body: JSON.stringify({ p_user_id: user.id, p_cart_item_id: lineId, p_quantity: quantity }) }).catch(() => null);
    if (!updated?.ok) return NextResponse.json({ ok: false, code: "INVENTORY_CHANGED", message: "Quantity exceeds current inventory or the customer limit." }, { status: 409 });
    return NextResponse.json({ ok: true, state: await commerceState(user.id) });
  }
  const productId = String(body.productId || ""); const catalog = await getMerchCatalog(false); const product = catalog.products.find((item) => item.id === productId);
  if (!product || !product.active || !product.published) return NextResponse.json({ ok: false, code: "PRODUCT_UNAVAILABLE", message: "This product is unavailable." }, { status: 409 });
  let cartResponse = await fetch(`${service.url}/rest/v1/commerce_carts?user_id=eq.${user.id}&select=id&limit=1`, { headers }); let [cart] = cartResponse.ok ? await cartResponse.json() as Array<{ id: string }> : [];
  if (!cart) { cartResponse = await fetch(`${service.url}/rest/v1/commerce_carts`, { method: "POST", headers: serviceHeaders(service, "return=representation"), body: JSON.stringify({ user_id: user.id }) }); if (!cartResponse.ok) return NextResponse.json({ ok: false, message: "Unable to create your cart." }, { status: 422 }); [cart] = await cartResponse.json() as Array<{ id: string }>; }
  const quantity = normalizeQuantity(body.quantity ?? 1, product.quantityLimit);
  if (!quantity) return NextResponse.json({ ok: false, code: "QUANTITY_INVALID", message: "Choose a valid quantity." }, { status: 400 });
  if (body.action !== "add") return NextResponse.json({ ok: false, message: "Unsupported cart action." }, { status: 400 });
  const autoVariant = product.variants.filter((item) => item.active).length === 1 ? product.variants.find((item) => item.active) : null;
  const variant = body.variantId ? product.variants.find((item) => item.id === body.variantId && item.active) : autoVariant;
  if ((product.requiresSize || product.fulfillmentEnabled) && !variant) return NextResponse.json({ ok: false, code: "VARIANT_REQUIRED", message: "Select an available merchandise option." }, { status: 400 });
  const available = variant ? variant.inventoryQuantity : product.inventoryQuantity; if (quantity > available) return NextResponse.json({ ok: false, code: "INVENTORY_CHANGED", message: "The requested quantity is no longer available." }, { status: 409 });
  const added = await fetch(`${service.url}/rest/v1/commerce_cart_items`, { method: "POST", headers: serviceHeaders(service, "resolution=merge-duplicates,return=minimal"), body: JSON.stringify({ cart_id: cart.id, product_id: productId, variant_id: variant?.id || null, quantity, selected_options: Array.isArray(body.options) ? body.options.slice(0, 8) : [] }) });
  if (!added.ok) return NextResponse.json({ ok: false, message: "The product could not be added." }, { status: 422 });
  return NextResponse.json({ ok: true, state: await commerceState(user.id) });
}
