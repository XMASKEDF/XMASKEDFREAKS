import "server-only";
import { performance } from "perf_hooks";
import type { ShippingAddress } from "@/lib/purchase/types";
import type {
  PodHealth,
  PodOrder,
  PodProduct,
  PodProvider,
  PodProviderOption,
  PodShippingRate
} from "@/lib/commerce/pod/types";
import { recordMetric, structuredLog } from "@/lib/infrastructure/observability";

export type PrintifyMode = "disabled" | "test" | "live";
export type PrintifyLine = { productId: string; variantId: number; quantity: number; externalId: string };

type PrintifyResponse = {
  ok: boolean;
  code: string | null;
  status: number;
  data: unknown;
  latencyMs: number;
  rateLimitRemaining: number | null;
};

export function printifyMode(): PrintifyMode {
  const value = process.env.PRINTIFY_INTEGRATION_MODE;
  return value === "test" || value === "live" ? value : "disabled";
}

function configuration() {
  const token = process.env.PRINTIFY_API_TOKEN?.trim();
  const shopId = process.env.PRINTIFY_SHOP_ID?.trim();
  return token && shopId ? { token, shopId, v1: "https://api.printify.com/v1", v2: "https://api.printify.com/v2" } : null;
}

function record(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function rows(value: unknown) {
  if (Array.isArray(value)) return value;
  const source = record(value);
  return Array.isArray(source.data) ? source.data : [];
}

function addressTo(address: ShippingAddress, email: string) {
  const names = address.fullName.trim().split(/\s+/);
  return {
    first_name: names.shift() || "Customer",
    last_name: names.join(" ") || "Customer",
    email,
    phone: address.phone,
    country: address.country,
    region: address.region,
    address1: address.addressLine1,
    address2: address.addressLine2,
    city: address.city,
    zip: address.postalCode
  };
}

function requestIdFrom(init: RequestInit) {
  const headers = new Headers(init.headers);
  return headers.get("x-request-id") || undefined;
}

async function printifyRequest(path: string, init: RequestInit, options: { shop?: boolean; version?: 1 | 2 } = {}): Promise<PrintifyResponse> {
  const config = configuration();
  if (!config) return { ok: false, code: "PRINTIFY_NOT_CONFIGURED", status: 503, data: null, latencyMs: 0, rateLimitRemaining: null };
  const version = options.version || 1;
  const base = version === 2 ? config.v2 : config.v1;
  const scopedPath = options.shop === false ? path : `/shops/${encodeURIComponent(config.shopId)}${path}`;
  const requestId = requestIdFrom(init);
  const started = performance.now();
  const response = await fetch(`${base}${scopedPath}`, {
    ...init,
    cache: "no-store",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
      "user-agent": "XMASKEDFREAKS-Printify-Operations/1.0",
      ...(init.headers || {})
    }
  }).catch(() => null);
  const latencyMs = Math.round(performance.now() - started);
  if (!response) {
    recordMetric("provider.printify.request", latencyMs, true);
    structuredLog("ERROR", "printify", "provider_request_failed", { provider: "printify", operation: path.split("?")[0], durationMs: latencyMs, errorCode: "PRINTIFY_UNREACHABLE" }, { requestId });
    return { ok: false, code: "PRINTIFY_UNREACHABLE", status: 503, data: null, latencyMs, rateLimitRemaining: null };
  }
  const data = await response.json().catch(() => null) as unknown;
  const remainingHeader = response.headers.get("x-ratelimit-remaining");
  const rateLimitRemaining = remainingHeader && Number.isFinite(Number(remainingHeader)) ? Number(remainingHeader) : null;
  const code = response.ok ? null : response.status === 401 ? "PRINTIFY_AUTHENTICATION_FAILED" : response.status === 429 ? "PRINTIFY_RATE_LIMITED" : "PRINTIFY_REJECTED";
  recordMetric("provider.printify.request", latencyMs, !response.ok);
  structuredLog(response.ok ? "INFO" : "WARN", "printify", response.ok ? "provider_request_succeeded" : "provider_request_rejected", { provider: "printify", operation: path.split("?")[0], durationMs: latencyMs, statusCode: response.status, errorCode: code || undefined }, { requestId });
  return { ok: response.ok, code, status: response.status, data, latencyMs, rateLimitRemaining };
}

function mapProduct(value: unknown): PodProduct {
  const item = record(value);
  const lifecycleStatus = item.is_archived === true || String(item.status || "").toLowerCase() === "archived"
    ? "archived"
    : item.visible === false ? "unpublished" : "active";
  return {
    id: String(item.id || ""),
    title: String(item.title || "Untitled product"),
    blueprintId: Number.isSafeInteger(Number(item.blueprint_id)) ? Number(item.blueprint_id) : null,
    printProviderId: Number.isSafeInteger(Number(item.print_provider_id)) ? Number(item.print_provider_id) : null,
    lifecycleStatus,
    visible: item.visible !== false,
    locked: item.is_locked === true,
    variants: rows(item.variants).map((variantValue) => {
      const variant = record(variantValue);
      return {
        id: Number(variant.id || 0),
        sku: variant.sku ? String(variant.sku) : null,
        title: String(variant.title || ""),
        priceMinor: Number.isFinite(Number(variant.price)) ? Number(variant.price) : null,
        costMinor: Number.isFinite(Number(variant.cost)) ? Number(variant.cost) : null,
        available: variant.is_available !== false && variant.is_enabled !== false
      };
    }).filter((variant) => variant.id > 0),
    raw: item
  };
}

function mapOrder(value: unknown): PodOrder {
  const item = record(value);
  const metadata = record(item.metadata);
  const shipments = rows(item.shipments);
  return {
    id: String(item.id || ""),
    externalId: item.external_id ? String(item.external_id) : metadata.shop_order_label ? String(metadata.shop_order_label) : null,
    status: String(item.status || "unknown"),
    totalPriceMinor: Number.isFinite(Number(item.total_price)) ? Number(item.total_price) : null,
    totalShippingMinor: Number.isFinite(Number(item.total_shipping)) ? Number(item.total_shipping) : null,
    createdAt: item.created_at ? String(item.created_at) : null,
    sentToProductionAt: item.sent_to_production_at ? String(item.sent_to_production_at) : null,
    fulfilledAt: item.fulfilled_at ? String(item.fulfilled_at) : null,
    trackingNumbers: shipments.map((shipment) => String(record(shipment).number || "")).filter(Boolean),
    raw: item
  };
}

export async function getPrintifyHealth(): Promise<PodHealth> {
  if (printifyMode() === "disabled") return { configured: false, functional: null, status: null, latencyMs: null, rateLimitRemaining: null, detail: "Printify integration is disabled; no provider request was made." };
  if (!configuration()) return { configured: false, functional: null, status: null, latencyMs: null, rateLimitRemaining: null, detail: "Printify credentials are not configured." };
  const response = await printifyRequest("/products.json?limit=1", { method: "GET" });
  return {
    configured: true,
    functional: response.ok,
    status: response.status,
    latencyMs: response.latencyMs,
    rateLimitRemaining: response.rateLimitRemaining,
    detail: response.ok ? "Authenticated product probe succeeded." : response.code || "Printify health probe failed."
  };
}

export async function listPrintifyProducts() {
  const products: PodProduct[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const response = await printifyRequest(`/products.json?page=${page}&limit=100`, { method: "GET" });
    if (!response.ok) return { ok: false, products, code: response.code };
    const pageRows = rows(response.data);
    products.push(...pageRows.map(mapProduct).filter((product) => product.id));
    const source = record(response.data);
    const lastPage = Number(source.last_page || page);
    if (pageRows.length < 100 || page >= lastPage) break;
  }
  return { ok: true, products, code: null };
}

export async function listPrintifyProviders() {
  const response = await printifyRequest("/catalog/print_providers.json", { method: "GET" }, { shop: false });
  if (!response.ok) return { ok: false, providers: [] as PodProviderOption[], code: response.code };
  const providers = rows(response.data).map((value) => {
    const item = record(value);
    const location = record(item.location);
    return {
      id: Number(item.id || 0),
      title: String(item.title || "Unknown provider"),
      countryCode: location.country ? String(location.country) : null,
      region: location.region ? String(location.region) : null,
      blueprintIds: rows(item.blueprints).map((blueprint) => Number(record(blueprint).id || 0)).filter((id) => id > 0)
    };
  }).filter((provider) => provider.id > 0);
  return { ok: true, providers, code: null };
}

export async function getPrintifyProvider(providerId: number) {
  const response = await printifyRequest(`/catalog/print_providers/${providerId}.json`, { method: "GET" }, { shop: false });
  if (!response.ok) return { ok: false, provider: null, code: response.code };
  const item = record(response.data);
  const location = record(item.location);
  const provider: PodProviderOption = {
    id: Number(item.id || providerId),
    title: String(item.title || "Unknown provider"),
    countryCode: location.country ? String(location.country) : null,
    region: location.region ? String(location.region) : null,
    blueprintIds: rows(item.blueprints).map((blueprint) => Number(record(blueprint).id || 0)).filter((id) => id > 0)
  };
  return { ok: true, provider, code: null };
}

export async function listPrintifyOrders() {
  const orders: PodOrder[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const response = await printifyRequest(`/orders.json?page=${page}&limit=100`, { method: "GET" });
    if (!response.ok) return { ok: false, orders, code: response.code };
    const pageRows = rows(response.data);
    orders.push(...pageRows.map(mapOrder).filter((order) => order.id));
    const source = record(response.data);
    const lastPage = Number(source.last_page || page);
    if (pageRows.length < 100 || page >= lastPage) break;
  }
  return { ok: true, orders, code: null };
}

export async function getPrintifyShippingRates(blueprintId: number, providerId: number) {
  const response = await printifyRequest(`/catalog/blueprints/${blueprintId}/print_providers/${providerId}/shipping.json`, { method: "GET" }, { shop: false, version: 2 });
  if (!response.ok) return { ok: false, rates: [] as PodShippingRate[], code: response.code };
  const list = rows(response.data);
  const methodResponses = await Promise.all(list.map(async (value) => {
    const item = record(value);
    const attributes = record(item.attributes);
    const method = String(attributes.name || item.id || "");
    if (!method) return [];
    const detail = await printifyRequest(`/catalog/blueprints/${blueprintId}/print_providers/${providerId}/shipping/${encodeURIComponent(method)}.json`, { method: "GET" }, { shop: false, version: 2 });
    if (!detail.ok) return [];
    return rows(detail.data).map((rateValue) => {
      const rate = record(rateValue);
      const attr = record(rate.attributes);
      const country = record(attr.country);
      const handling = record(attr.handlingTime);
      const cost = record(attr.shippingCost);
      const first = record(cost.firstItem);
      const additional = record(cost.additionalItems);
      return {
        method,
        countryCode: String(country.code || "REST_OF_THE_WORLD"),
        variantId: Number(attr.variantId || 0),
        firstItemMinor: Number(first.amount || 0),
        additionalItemMinor: Number(additional.amount || 0),
        currency: String(first.currency || additional.currency || "USD"),
        handlingFromDays: Number.isFinite(Number(handling.from)) ? Number(handling.from) : null,
        handlingToDays: Number.isFinite(Number(handling.to)) ? Number(handling.to) : null
      };
    }).filter((rate) => rate.variantId > 0);
  }));
  return { ok: true, rates: methodResponses.flat(), code: null };
}

export async function quotePrintifyShipping(input: { address: ShippingAddress; email: string; lines: PrintifyLine[] }) {
  if (printifyMode() !== "live") return { ok: false as const, code: "PRINTIFY_LIVE_REQUIRED", amountCents: null, method: null };
  const response = await printifyRequest("/orders/shipping.json", { method: "POST", body: JSON.stringify({ line_items: input.lines.map((line) => ({ product_id: line.productId, variant_id: line.variantId, quantity: line.quantity, external_id: line.externalId })), address_to: addressTo(input.address, input.email) }) });
  if (!response.ok || !response.data || typeof response.data !== "object") return { ok: false as const, code: response.code, amountCents: null, method: null };
  const rates = response.data as Record<string, unknown>;
  const entries = ["standard", "economy", "priority", "express", "printify_express"].map((method) => ({ method, amount: Number(rates[method]) })).filter((rate) => Number.isSafeInteger(rate.amount) && rate.amount >= 0);
  const selected = entries.sort((a, b) => a.amount - b.amount)[0];
  return selected ? { ok: true as const, code: null, amountCents: selected.amount, method: selected.method } : { ok: false as const, code: "SHIPPING_UNAVAILABLE", amountCents: null, method: null };
}

export async function submitPrintifyOrder(input: { orderNumber: string; address: ShippingAddress; email: string; shippingMethod: string; lines: PrintifyLine[] }) {
  const mode = printifyMode();
  if (mode === "disabled") return { ok: false as const, code: "PRINTIFY_DISABLED", orderId: null, data: null };
  const response = await printifyRequest("/orders.json", { method: "POST", body: JSON.stringify({ external_id: input.orderNumber, label: input.orderNumber, line_items: input.lines.map((line) => ({ product_id: line.productId, variant_id: line.variantId, quantity: line.quantity, external_id: line.externalId })), shipping_method: input.shippingMethod === "economy" ? 4 : input.shippingMethod === "express" || input.shippingMethod === "printify_express" ? 3 : input.shippingMethod === "priority" ? 2 : 1, send_shipping_notification: false, address_to: addressTo(input.address, input.email) }) });
  const orderId = response.ok && response.data && typeof response.data === "object" ? String((response.data as Record<string, unknown>).id || "") : "";
  return response.ok && orderId ? { ok: true as const, code: null, orderId, data: response.data } : { ok: false as const, code: response.code || "PRINTIFY_ORDER_REJECTED", orderId: null, data: response.data };
}

export async function retrievePrintifyProduct(productId: string) {
  return printifyRequest(`/products/${encodeURIComponent(productId)}.json`, { method: "GET" });
}

export const printifyProvider: PodProvider = {
  id: "printify",
  name: "Printify",
  health: getPrintifyHealth,
  listProducts: listPrintifyProducts,
  listProviders: listPrintifyProviders,
  getProvider: getPrintifyProvider,
  listOrders: listPrintifyOrders,
  shippingRates: getPrintifyShippingRates,
  submitOrder: submitPrintifyOrder
};
