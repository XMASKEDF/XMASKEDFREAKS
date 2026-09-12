"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/components/I18nProvider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CartLine, ProductOption, PurchaseProduct, PurchaseQuote, PurchaseRecord, PurchaseResult, PurchaseServerState, PurchaseStage, PurchaseSummary, ShippingAddress } from "@/lib/purchase/types";

type SourceProduct = { id: string; coinPrice: number; active: boolean; published: boolean; purchased?: boolean };
type PurchaseContextValue = {
  products: PurchaseProduct[];
  cartItems: PurchaseProduct[];
  purchases: PurchaseRecord[];
  summary: PurchaseSummary;
  authenticated: boolean;
  stage: PurchaseStage;
  busy: boolean;
  status: string;
  errorCode: string | null;
  result: PurchaseResult | null;
  promoCodesEnabled: boolean;
  promoCode: string;
  shippingAddress: ShippingAddress;
  checkoutQuote: PurchaseQuote | null;
  setShippingAddress: (value: ShippingAddress) => void;
  setPromoCode: (value: string) => void;
  openCart: (trigger?: HTMLElement | null) => void;
  openCheckout: () => void;
  returnToCart: () => void;
  closePurchase: () => void;
  addProduct: (productId: string, trigger?: HTMLElement | null, selection?: { variantId?: string | null; quantity?: number; options?: ProductOption[] }) => Promise<void>;
  removeProduct: (lineId: string) => Promise<void>;
  updateQuantity: (lineId: string, quantity: number) => Promise<void>;
  checkout: () => Promise<void>;
  quoteCheckout: () => Promise<void>;
  refresh: () => Promise<void>;
  addTokens: () => void;
  viewPurchases: () => void;
};

const PurchaseContext = createContext<PurchaseContextValue | null>(null);

export default function PurchaseProvider<TSource extends SourceProduct>({
  children,
  endpoint,
  initialProducts,
  normalizeProduct,
  developmentPreviewState
}: {
  children: ReactNode;
  endpoint: string;
  initialProducts: TSource[];
  normalizeProduct: (product: TSource) => PurchaseProduct;
  developmentPreviewState?: PurchaseServerState<TSource>;
}) {
  const { t } = useI18n();
  const [sourceProducts, setSourceProducts] = useState(initialProducts);
  const [externalCartProducts, setExternalCartProducts] = useState<PurchaseProduct[]>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [cartProductIds, setCartProductIds] = useState<string[]>([]);
  const [cartLines, setCartLines] = useState<CartLine[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [stage, setStage] = useState<PurchaseStage>("closed");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [result, setResult] = useState<PurchaseResult | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>({ fullName: "", addressLine1: "", addressLine2: "", city: "", region: "", postalCode: "", country: "", phone: "", instructions: "" });
  const [checkoutQuote, setCheckoutQuote] = useState<PurchaseQuote | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const refreshPromise = useRef<Promise<void> | null>(null);
  const previewMode = useRef(false);

  const accessToken = useCallback(async () => {
    try { return (await createSupabaseBrowserClient().auth.getSession()).data.session?.access_token || null; } catch { return null; }
  }, []);

  const applyState = useCallback((next: Partial<PurchaseServerState<TSource>>) => {
    if (Array.isArray(next.products)) setSourceProducts(next.products);
    if (Array.isArray(next.cartProducts)) setExternalCartProducts(next.cartProducts);
    if (typeof next.authenticated === "boolean") setAuthenticated(next.authenticated);
    if (next.tokenBalance === null || typeof next.tokenBalance === "number") {
      setTokenBalance(next.tokenBalance);
      if (typeof next.tokenBalance === "number" && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("xmf:wallet-updated", { detail: { balance: next.tokenBalance, source: "purchase" } }));
      }
    }
    if (Array.isArray(next.cartProductIds)) setCartProductIds(next.cartProductIds);
    if (Array.isArray(next.cartLines)) setCartLines(next.cartLines);
    if (Array.isArray(next.purchases)) setPurchases(next.purchases);
  }, []);

  const refresh = useCallback(async () => {
    if (refreshPromise.current) return refreshPromise.current;
    refreshPromise.current = (async () => {
      const token = await accessToken();
      const response = await fetch(endpoint, { cache: "no-store", headers: token ? { authorization: `Bearer ${token}` } : {} });
      if (response.ok) applyState(await response.json() as PurchaseServerState<TSource>);
    })().finally(() => { refreshPromise.current = null; });
    return refreshPromise.current;
  }, [accessToken, applyState, endpoint]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" && developmentPreviewState && new URLSearchParams(window.location.search).get("purchaseDemo") === "1") {
      previewMode.current = true;
      applyState(developmentPreviewState);
      return;
    }
    void refresh().finally(() => {
      if (new URLSearchParams(window.location.search).get("openCart") === "1") setStage("cart");
    });
  }, [applyState, developmentPreviewState, refresh]);

  const products = useMemo(() => {
    const primary = sourceProducts.map(normalizeProduct);
    const ids = new Set(primary.map((product) => product.id));
    return [...primary, ...externalCartProducts.filter((product) => !ids.has(product.id))];
  }, [externalCartProducts, normalizeProduct, sourceProducts]);
  const effectiveLines = useMemo<CartLine[]>(() => cartLines.length ? cartLines : cartProductIds.map((productId) => ({ id: productId, productId, variantId: null, quantity: 1, options: [] })), [cartLines, cartProductIds]);
  const cartItems = useMemo(() => effectiveLines.reduce<PurchaseProduct[]>((items, line) => {
    const product = products.find((item) => item.id === line.productId);
    if (!product) return items;
    const variant = product.variants?.find((item) => item.id === line.variantId);
    items.push({ ...product, cartLineId: line.id, variantId: line.variantId, quantity: line.quantity, options: line.options, coinPrice: variant?.coinPrice ?? product.coinPrice, thumbnailUrl: variant?.imageUrl || product.thumbnailUrl, inventoryQuantity: variant?.inventoryQuantity ?? product.inventoryQuantity });
    return items;
  }, []), [effectiveLines, products]);
  const summary = useMemo<PurchaseSummary>(() => {
    const subtotal = cartItems.reduce((sum, product) => sum + product.coinPrice * product.quantity, 0);
    const discount = 0;
    const requiresShipping = cartItems.some((item) => item.shippingRequired);
    const quoteReady = Boolean(checkoutQuote && new Date(checkoutQuote.expiresAt).getTime() > Date.now());
    const tax = requiresShipping && quoteReady ? checkoutQuote!.taxCoins : 0;
    const shipping = requiresShipping && quoteReady ? checkoutQuote!.shippingCoins : 0;
    const physicalItemCount = cartItems.filter((item) => item.shippingRequired).reduce((sum, item) => sum + item.quantity, 0);
    const digitalItemCount = cartItems.filter((item) => !item.shippingRequired).reduce((sum, item) => sum + item.quantity, 0);
    const total = requiresShipping && quoteReady ? checkoutQuote!.totalCoins : Math.max(0, subtotal - discount + tax + shipping);
    const remainingBalance = tokenBalance === null ? null : tokenBalance - total;
    const shortage = remainingBalance !== null && remainingBalance < 0 ? Math.abs(remainingBalance) : 0;
    const shippingComplete = !requiresShipping || Boolean(shippingAddress.fullName.trim() && shippingAddress.addressLine1.trim() && shippingAddress.city.trim() && shippingAddress.postalCode.trim() && shippingAddress.country.trim());
    const productsValid = cartItems.every((item) => item.active && item.published && item.quantity >= 1 && (!item.inventoryTracked || item.quantity <= Number(item.inventoryQuantity ?? item.maxQuantity ?? 0)));
    const canOpenCheckout = authenticated && cartItems.length > 0 && productsValid;
    const hasFunds = remainingBalance !== null && remainingBalance >= 0;
    return {
      itemCount: cartItems.reduce((sum, item) => sum + item.quantity, 0),
      subtotal,
      discount,
      tax,
      shipping,
      merchandiseCents: quoteReady ? checkoutQuote!.merchandiseCents : null,
      shippingCents: quoteReady ? checkoutQuote!.shippingCents : null,
      taxCents: quoteReady ? checkoutQuote!.taxCents : null,
      totalCents: quoteReady ? checkoutQuote!.totalCents : null,
      quoteReady,
      quoteExpiresAt: quoteReady ? checkoutQuote!.expiresAt : null,
      total,
      balance: tokenBalance,
      remainingBalance,
      shortage,
      requiresShipping,
      physicalItemCount,
      digitalItemCount,
      canOpenCheckout,
      canCheckout: canOpenCheckout && shippingComplete && hasFunds && (!requiresShipping || quoteReady)
    };
  }, [authenticated, cartItems, checkoutQuote, shippingAddress, tokenBalance]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("xmf:cart-updated", { detail: { count: summary.itemCount } }));
  }, [summary.itemCount]);

  const updateShippingAddress = useCallback((value: ShippingAddress) => {
    setShippingAddress(value);
    setCheckoutQuote(null);
    setErrorCode(null);
  }, []);

  const openCart = useCallback((trigger?: HTMLElement | null) => {
    if (trigger) triggerRef.current = trigger;
    setErrorCode(null); setResult(null); setStage("cart");
    if (!previewMode.current) void refresh();
  }, [refresh]);

  useEffect(() => {
    const openFromGlobalLauncher = () => openCart();
    window.addEventListener("xmf:cart-open", openFromGlobalLauncher);
    return () => window.removeEventListener("xmf:cart-open", openFromGlobalLauncher);
  }, [openCart]);

  const closePurchase = useCallback(() => {
    setStage("closed"); setErrorCode(null); setCheckoutQuote(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const openCheckout = useCallback(async () => {
    setErrorCode(null);
    if (!summary.requiresShipping || previewMode.current) { setStage("checkout"); return; }
    const token = await accessToken();
    if (!token) { setStatus(t("purchase.sessionExpired")); return; }
    setBusy(true);
    const response = await fetch(endpoint, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ action: "reserve" }) });
    const payload = await response.json().catch(() => ({})) as { message?: string; state?: Partial<PurchaseServerState<TSource>> };
    if (response.ok) { if (payload.state) applyState(payload.state); setStage("checkout"); setStatus(t("purchase.inventoryReserved")); } else setStatus(payload.message || t("purchase.inventoryUnavailable"));
    setBusy(false);
  }, [accessToken, applyState, endpoint, summary.requiresShipping, t]);

  const quoteCheckout = useCallback(async () => {
    if (!summary.requiresShipping || busy) return;
    if (previewMode.current) {
      const merchandiseCents = summary.subtotal * 50;
      setCheckoutQuote({
        id: "preview-quote",
        merchandiseCents,
        merchandiseCoins: summary.subtotal,
        shippingCents: 650,
        shippingCoins: 13,
        taxCents: 0,
        taxCoins: 0,
        totalCents: merchandiseCents + 650,
        totalCoins: summary.subtotal + 13,
        coinValueCents: 50,
        roundingAdjustmentCents: 0,
        shippingMethod: "preview",
        shippingProvider: "preview",
        taxProvider: "preview",
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString()
      });
      setStatus("Preview quote calculated. No provider was contacted.");
      return;
    }
    const token = await accessToken();
    if (!token) { setErrorCode("AUTH_REQUIRED"); setStatus(t("purchase.sessionExpired")); return; }
    setBusy(true); setErrorCode(null); setStatus("Calculating secure shipping and tax…");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ action: "quote", shippingAddress })
    });
    const payload = await response.json().catch(() => ({})) as { code?: string; message?: string; quote?: PurchaseQuote };
    if (response.ok && payload.quote) {
      setCheckoutQuote(payload.quote);
      setStatus("Final coin total confirmed for 15 minutes.");
    } else {
      setCheckoutQuote(null);
      setErrorCode(payload.code || "QUOTE_FAILED");
      setStatus(payload.message || "Shipping and tax could not be calculated. Your wallet was not changed.");
    }
    setBusy(false);
  }, [accessToken, busy, endpoint, shippingAddress, summary.requiresShipping, summary.subtotal, t]);

  const cartAction = useCallback(async (action: "add" | "remove" | "quantity", productId: string, trigger?: HTMLElement | null, selection?: { variantId?: string | null; quantity?: number; options?: ProductOption[]; lineId?: string }) => {
    setCheckoutQuote(null);
    if (previewMode.current) {
      if (trigger) triggerRef.current = trigger;
      setCartLines((current) => {
        const lineId = selection?.lineId || `${productId}:${selection?.variantId || "base"}`;
        if (action === "remove") return current.filter((line) => line.id !== lineId);
        if (action === "quantity") return current.map((line) => line.id === lineId ? { ...line, quantity: Math.max(1, Number(selection?.quantity || 1)) } : line);
        const existing = current.find((line) => line.productId === productId && line.variantId === (selection?.variantId || null));
        return existing ? current.map((line) => line.id === existing.id ? { ...line, quantity: line.quantity + Math.max(1, Number(selection?.quantity || 1)) } : line) : [...current, { id: lineId, productId, variantId: selection?.variantId || null, quantity: Math.max(1, Number(selection?.quantity || 1)), options: selection?.options || [] }];
      });
      setStatus(action === "add" ? t("purchase.added") : t("purchase.removed"));
      if (action === "add") setStage("cart");
      return;
    }
    const token = await accessToken();
    if (!token) { setStatus(t("audioStore.signIn")); return; }
    if (trigger) triggerRef.current = trigger;
    setBusy(true); setErrorCode(null);
    const response = await fetch(endpoint, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ action, productId, variantId: selection?.variantId, quantity: selection?.quantity, options: selection?.options, cartLineId: selection?.lineId }) });
    const payload = await response.json().catch(() => ({})) as { code?: string; message?: string; state?: Partial<PurchaseServerState<TSource>> };
    if (response.ok && payload.state) {
      applyState({ authenticated: true, ...payload.state });
      setStatus(action === "add" ? t("purchase.added") : action === "quantity" ? t("purchase.quantityUpdated") : t("purchase.removed"));
      if (action === "add") setStage("cart");
    } else {
      setErrorCode(payload.code || "CART_ACTION_FAILED");
      setStatus(payload.code === "ALREADY_PURCHASED" ? t("purchase.alreadyPurchased") : payload.code === "PRODUCT_UNAVAILABLE" ? t("purchase.unavailable") : payload.message || t("audioStore.checkoutFailed"));
    }
    setBusy(false);
  }, [accessToken, applyState, endpoint, t]);

  const checkout = useCallback(async () => {
    if (busy || !summary.canCheckout) return;
    if (previewMode.current) {
      const previewProductIds = cartItems.map((item) => item.id);
      const previewBalance = Math.max(0, Number(summary.balance || 0) - summary.total);
      setBusy(true); setErrorCode(null); setStatus(t("audioStore.checkoutProgress"));
      await Promise.resolve();
      setTokenBalance(previewBalance); setCartProductIds([]); setCartLines([]);
      setResult({ orderId: "preview-order", orderNumber: "PREVIEW-001", totalCoins: summary.total, itemCount: summary.itemCount, tokenBalance: previewBalance, productIds: previewProductIds, requiresShipping: summary.requiresShipping, shippingCountry: summary.requiresShipping ? shippingAddress.country : null });
      setStage("success"); setStatus(t("audioStore.checkoutSuccess")); setBusy(false);
      return;
    }
    const token = await accessToken();
    if (!token) { setErrorCode("AUTH_REQUIRED"); setStatus(t("purchase.sessionExpired")); return; }
    const purchasedIds = cartItems.map((item) => item.id);
    const idempotencyKey = crypto.randomUUID();
    setBusy(true); setErrorCode(null); setStatus(t("audioStore.checkoutProgress"));
    const response = await fetch(endpoint, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "idempotency-key": idempotencyKey }, body: JSON.stringify({ action: "checkout", idempotencyKey, expectedTotal: summary.total, quoteId: checkoutQuote?.id, shippingAddress: summary.requiresShipping ? shippingAddress : null }) });
    const payload = await response.json().catch(() => ({})) as { code?: string; message?: string; orderId?: string; orderNumber?: string; totalCoins?: number; itemCount?: number; tokenBalance?: number; state?: Partial<PurchaseServerState<TSource>> };
    if (response.ok && payload.state && payload.orderId) {
      applyState({ authenticated: true, ...payload.state });
      setResult({ orderId: payload.orderId, orderNumber: payload.orderNumber, totalCoins: Number(payload.totalCoins || summary.total), itemCount: Number(payload.itemCount || summary.itemCount), tokenBalance: Number(payload.tokenBalance ?? payload.state.tokenBalance ?? 0), productIds: purchasedIds, requiresShipping: summary.requiresShipping, shippingCountry: summary.requiresShipping ? shippingAddress.country : null });
      setStage("success"); setStatus(t("audioStore.checkoutSuccess"));
    } else {
      setErrorCode(payload.code || "CHECKOUT_FAILED");
      setStatus(payload.code === "INSUFFICIENT_TOKENS" ? t("audioStore.insufficient") : payload.code === "PRICE_CHANGED" ? t("purchase.priceChanged") : payload.code === "PRODUCT_UNAVAILABLE" ? t("purchase.unavailable") : payload.code === "AUTH_REQUIRED" ? t("purchase.sessionExpired") : payload.message || t("audioStore.checkoutFailed"));
      await refresh();
    }
    setBusy(false);
  }, [accessToken, applyState, busy, cartItems, checkoutQuote?.id, endpoint, refresh, shippingAddress, summary, t]);

  const addTokens = useCallback(() => { setStage("closed"); window.location.assign("/#coin-packages"); }, []);
  const viewPurchases = useCallback(() => { setStage("closed"); document.querySelector(".audio-purchases-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }); }, []);
  const value = useMemo<PurchaseContextValue>(() => ({ products, cartItems, purchases, summary, authenticated, stage, busy, status, errorCode, result, promoCodesEnabled: false, promoCode, setPromoCode, shippingAddress, checkoutQuote, setShippingAddress: updateShippingAddress, openCart, openCheckout: () => { void openCheckout(); }, returnToCart: () => { setErrorCode(null); setCheckoutQuote(null); setStage("cart"); }, closePurchase, addProduct: (id, trigger, selection) => cartAction("add", id, trigger, selection), removeProduct: (lineId) => { const item = cartItems.find((product) => (product.cartLineId || product.id) === lineId); return cartAction("remove", item?.id || lineId, undefined, { lineId }); }, updateQuantity: (lineId, quantity) => { const item = cartItems.find((product) => (product.cartLineId || product.id) === lineId); return cartAction("quantity", item?.id || lineId, undefined, { lineId, quantity }); }, checkout, quoteCheckout, refresh, addTokens, viewPurchases }), [addTokens, authenticated, busy, cartAction, cartItems, checkout, checkoutQuote, closePurchase, errorCode, openCart, openCheckout, products, promoCode, purchases, quoteCheckout, refresh, result, shippingAddress, stage, status, summary, updateShippingAddress, viewPurchases]);

  return <PurchaseContext.Provider value={value}>{children}</PurchaseContext.Provider>;
}

export function usePurchase() {
  const value = useContext(PurchaseContext);
  if (!value) throw new Error("usePurchase must be used inside PurchaseProvider");
  return value;
}
