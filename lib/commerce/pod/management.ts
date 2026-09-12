import "server-only";
import { createHash, randomUUID } from "crypto";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { getPodProvider } from "@/lib/commerce/pod/provider";
import type { PodProduct } from "@/lib/commerce/pod/types";
import { recordReliabilityIncident } from "@/lib/reliability/server";

type Trigger = "schedule" | "admin" | "webhook" | "system";
type SyncType = "products" | "inventory" | "providers" | "shipping" | "orders" | "reconciliation" | "health";
type Service = NonNullable<ReturnType<typeof serviceCredentials>>;

export type PrintifyManagementData = {
  configured: boolean;
  providerMode: string;
  settings: Record<string, unknown> | null;
  health: Awaited<ReturnType<ReturnType<typeof getPodProvider>["health"]>>;
  queue: Array<Record<string, unknown>>;
  syncRuns: Array<Record<string, unknown>>;
  products: Array<Record<string, unknown>>;
  providers: Array<Record<string, unknown>>;
  shippingRates: Array<Record<string, unknown>>;
  findings: Array<Record<string, unknown>>;
  apiLogs: Array<Record<string, unknown>>;
  orderSnapshots: Array<Record<string, unknown>>;
  metrics: Array<Record<string, unknown>>;
};

function hashProduct(product: PodProduct) {
  return createHash("sha256").update(JSON.stringify({
    title: product.title,
    blueprintId: product.blueprintId,
    printProviderId: product.printProviderId,
    lifecycleStatus: product.lifecycleStatus,
    visible: product.visible,
    locked: product.locked,
    variants: product.variants
  })).digest("hex");
}

async function rest(service: Service, path: string, init: RequestInit = {}) {
  return fetch(`${service.url}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers: { ...serviceHeaders(service), ...(init.headers || {}) }
  });
}

async function jsonRows(service: Service, path: string) {
  const response = await rest(service, path);
  return response.ok ? await response.json() as Array<Record<string, unknown>> : [];
}

async function beginRun(service: Service, syncType: SyncType, trigger: Trigger, adminId?: string) {
  const response = await rest(service, "pod_sync_runs?select=id", {
    method: "POST",
    headers: serviceHeaders(service, "return=representation"),
    body: JSON.stringify({ provider: "printify", sync_type: syncType, trigger_source: trigger, created_by: adminId || null })
  });
  const [run] = response.ok ? await response.json() as Array<{ id: string }> : [];
  return run?.id || null;
}

async function finishRun(service: Service, runId: string | null, values: Record<string, unknown>) {
  if (!runId) return;
  await rest(service, `pod_sync_runs?id=eq.${runId}`, {
    method: "PATCH",
    body: JSON.stringify({ ...values, completed_at: new Date().toISOString() })
  });
}

async function logOperation(service: Service, input: { operation: string; method?: string; endpointGroup: string; success: boolean; statusCode?: number | null; durationMs?: number; rateLimitRemaining?: number | null; errorCode?: string | null; correlationId?: string }) {
  await rest(service, "pod_api_request_logs", {
    method: "POST",
    headers: serviceHeaders(service, "return=minimal"),
    body: JSON.stringify({
      provider: "printify",
      operation: input.operation,
      method: input.method || "GET",
      endpoint_group: input.endpointGroup,
      success: input.success,
      status_code: input.statusCode ?? null,
      duration_ms: input.durationMs || 0,
      rate_limit_remaining: input.rateLimitRemaining ?? null,
      error_code: input.errorCode || null,
      correlation_id: input.correlationId || randomUUID()
    })
  });
}

export async function syncPrintifyProducts(trigger: Trigger, adminId?: string) {
  const service = serviceCredentials();
  if (!service) return { ok: false, code: "STORAGE_UNAVAILABLE" };
  const runId = await beginRun(service, "products", trigger, adminId);
  const result = await getPodProvider().listProducts();
  await logOperation(service, { operation: "product-sync", endpointGroup: "shop-products", success: result.ok, errorCode: result.code });
  if (!result.ok) {
    await finishRun(service, runId, { status: "failed", failure_count: 1, error_code: result.code });
    return { ok: false, code: result.code };
  }
  const existing = await jsonRows(service, "pod_product_snapshots?provider=eq.printify&select=provider_product_id,content_hash,lifecycle_status");
  const currentIds = new Set(result.products.map((product) => product.id));
  const existingById = new Map(existing.map((item) => [String(item.provider_product_id), item]));
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const now = new Date().toISOString();
  const snapshots = result.products.map((product) => {
    const hash = hashProduct(product);
    const previous = existingById.get(product.id);
    if (!previous) created += 1;
    else if (previous.content_hash !== hash || previous.lifecycle_status !== product.lifecycleStatus) updated += 1;
    else unchanged += 1;
    return {
      provider: "printify",
      provider_product_id: product.id,
      title: product.title.slice(0, 240),
      blueprint_id: product.blueprintId,
      print_provider_id: product.printProviderId,
      lifecycle_status: product.lifecycleStatus,
      provider_visible: product.visible,
      provider_locked: product.locked,
      variants: product.variants,
      content_hash: hash,
      last_seen_at: now,
      removed_at: null,
      raw_summary: { variantCount: product.variants.length }
    };
  });
  if (snapshots.length) {
    await rest(service, "pod_product_snapshots?on_conflict=provider,provider_product_id", {
      method: "POST",
      headers: serviceHeaders(service, "resolution=merge-duplicates,return=minimal"),
      body: JSON.stringify(snapshots)
    });
  }
  const removedIds = existing.map((item) => String(item.provider_product_id)).filter((id) => !currentIds.has(id));
  for (const id of removedIds) {
    await rest(service, `pod_product_snapshots?provider=eq.printify&provider_product_id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ lifecycle_status: "removed", removed_at: now })
    });
    await rest(service, `commerce_products?printify_product_id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ fulfillment_enabled: false, printify_last_synced_at: now, updated_at: now })
    });
  }
  for (const product of result.products) {
    const enabledIds = product.variants.filter((variant) => variant.available).map((variant) => variant.id);
    await rest(service, `commerce_products?printify_product_id=eq.${encodeURIComponent(product.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        printify_blueprint_id: product.blueprintId,
        printify_provider_id: product.printProviderId,
        fulfillment_enabled: product.lifecycleStatus === "active" && !product.locked,
        printify_last_synced_at: now,
        updated_at: now
      })
    });
    const localVariants = await jsonRows(service, `product_variants?commerce_products.printify_product_id=eq.${encodeURIComponent(product.id)}&select=id,printify_variant_id,commerce_products!inner(printify_product_id)`);
    for (const variant of localVariants) {
      const providerVariant = product.variants.find((candidate) => candidate.id === Number(variant.printify_variant_id));
      await rest(service, `product_variants?id=eq.${String(variant.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          fulfillment_available: providerVariant ? enabledIds.includes(providerVariant.id) : false,
          provider_sku: providerVariant?.sku || null,
          production_cost_minor: providerVariant?.costMinor ?? null,
          printify_last_synced_at: now,
          updated_at: now
        })
      });
    }
  }
  await finishRun(service, runId, { status: "completed", created_count: created, updated_count: updated, archived_count: removedIds.length, unchanged_count: unchanged, summary: { providerProducts: result.products.length } });
  return { ok: true, created, updated, removed: removedIds.length, unchanged };
}

export async function syncPrintifyProviders(trigger: Trigger, adminId?: string) {
  const service = serviceCredentials();
  if (!service) return { ok: false, code: "STORAGE_UNAVAILABLE" };
  const runId = await beginRun(service, "providers", trigger, adminId);
  const result = await getPodProvider().listProviders();
  await logOperation(service, { operation: "provider-sync", endpointGroup: "catalog-providers", success: result.ok, errorCode: result.code });
  if (!result.ok) {
    await finishRun(service, runId, { status: "failed", failure_count: 1, error_code: result.code });
    return { ok: false, code: result.code };
  }
  const settings = (await jsonRows(service, "pod_provider_settings?provider=eq.printify&select=preferred_provider_id&limit=1"))[0];
  const preferred = Number(settings?.preferred_provider_id || 0);
  const mapped = await jsonRows(service, "commerce_products?printify_provider_id=not.is.null&select=printify_provider_id");
  const relevantIds = [...new Set(mapped.map((row) => Number(row.printify_provider_id)).filter((id) => id > 0))];
  const details = await Promise.all(relevantIds.map((id) => getPodProvider().getProvider(id)));
  const detailedById = new Map(details.filter((item) => item.ok && item.provider).map((item) => [item.provider!.id, item.provider!]));
  const payload = result.providers.map((summary) => {
    const provider = detailedById.get(summary.id) || summary;
    return ({
    provider: "printify",
    provider_option_id: provider.id,
    title: provider.title,
    country_code: provider.countryCode,
    region: provider.region,
    blueprint_ids: provider.blueprintIds,
    is_available: true,
    is_preferred: provider.id === preferred,
    last_synced_at: new Date().toISOString()
  }); });
  if (payload.length) await rest(service, "pod_provider_options?on_conflict=provider,provider_option_id", { method: "POST", headers: serviceHeaders(service, "resolution=merge-duplicates,return=minimal"), body: JSON.stringify(payload) });
  await finishRun(service, runId, { status: "completed", updated_count: payload.length });
  return { ok: true, providers: payload.length };
}

export async function syncPrintifyShipping(trigger: Trigger, adminId?: string) {
  const service = serviceCredentials();
  if (!service) return { ok: false, code: "STORAGE_UNAVAILABLE" };
  const runId = await beginRun(service, "shipping", trigger, adminId);
  const settings = (await jsonRows(service, "pod_provider_settings?provider=eq.printify&select=shipping_cache_minutes&limit=1"))[0];
  const cacheMinutes = Math.max(15, Number(settings?.shipping_cache_minutes || 360));
  const mappings = await jsonRows(service, "commerce_products?fulfillment_enabled=eq.true&printify_blueprint_id=not.is.null&printify_provider_id=not.is.null&select=printify_blueprint_id,printify_provider_id");
  const pairs = [...new Set(mappings.map((item) => `${Number(item.printify_blueprint_id)}:${Number(item.printify_provider_id)}`))];
  let updated = 0;
  let failures = 0;
  for (const pair of pairs) {
    const [blueprintId, providerId] = pair.split(":").map(Number);
    const result = await getPodProvider().shippingRates(blueprintId, providerId);
    await logOperation(service, { operation: "shipping-sync", endpointGroup: "catalog-shipping", success: result.ok, errorCode: result.code });
    if (!result.ok) { failures += 1; continue; }
    const fetchedAt = new Date();
    const payload = result.rates.map((rate) => ({
      provider: "printify",
      blueprint_id: blueprintId,
      provider_option_id: providerId,
      method: rate.method,
      country_code: rate.countryCode,
      variant_id: rate.variantId,
      first_item_minor: rate.firstItemMinor,
      additional_item_minor: rate.additionalItemMinor,
      currency: rate.currency,
      handling_from_days: rate.handlingFromDays,
      handling_to_days: rate.handlingToDays,
      fetched_at: fetchedAt.toISOString(),
      expires_at: new Date(fetchedAt.getTime() + cacheMinutes * 60_000).toISOString()
    }));
    if (payload.length) {
      const response = await rest(service, "pod_shipping_rate_cache?on_conflict=provider,blueprint_id,provider_option_id,method,country_code,variant_id", { method: "POST", headers: serviceHeaders(service, "resolution=merge-duplicates,return=minimal"), body: JSON.stringify(payload) });
      if (response.ok) updated += payload.length;
      else failures += 1;
      const supportedRegions = [...new Set(result.rates.map((rate) => rate.countryCode))];
      const fromDays = result.rates.map((rate) => rate.handlingFromDays).filter((value): value is number => value !== null);
      const toDays = result.rates.map((rate) => rate.handlingToDays).filter((value): value is number => value !== null);
      await rest(service, `pod_provider_options?provider=eq.printify&provider_option_id=eq.${providerId}`, {
        method: "PATCH",
        body: JSON.stringify({
          supported_regions: supportedRegions,
          production_days_from: fromDays.length ? Math.min(...fromDays) : null,
          production_days_to: toDays.length ? Math.max(...toDays) : null,
          last_synced_at: fetchedAt.toISOString()
        })
      });
    }
  }
  await finishRun(service, runId, { status: failures ? "partial" : "completed", updated_count: updated, failure_count: failures });
  return { ok: failures === 0, updated, failures };
}

export async function syncPrintifyOrdersAndReconcile(trigger: Trigger, adminId?: string) {
  const service = serviceCredentials();
  if (!service) return { ok: false, code: "STORAGE_UNAVAILABLE" };
  const runId = await beginRun(service, "reconciliation", trigger, adminId);
  const result = await getPodProvider().listOrders();
  await logOperation(service, { operation: "order-reconciliation", endpointGroup: "shop-orders", success: result.ok, errorCode: result.code });
  if (!result.ok) {
    await finishRun(service, runId, { status: "failed", failure_count: 1, error_code: result.code });
    return { ok: false, code: result.code };
  }
  const now = new Date().toISOString();
  const snapshots = result.orders.map((order) => ({
    provider: "printify",
    provider_order_id: order.id,
    external_order_id: order.externalId,
    status: order.status,
    total_price_minor: order.totalPriceMinor,
    total_shipping_minor: order.totalShippingMinor,
    tracking_numbers: order.trackingNumbers,
    provider_created_at: order.createdAt,
    sent_to_production_at: order.sentToProductionAt,
    fulfilled_at: order.fulfilledAt,
    last_synced_at: now
  }));
  if (snapshots.length) await rest(service, "pod_order_snapshots?on_conflict=provider,provider_order_id", { method: "POST", headers: serviceHeaders(service, "resolution=merge-duplicates,return=minimal"), body: JSON.stringify(snapshots) });
  const localOrders = await jsonRows(service, "commerce_orders?payment_status=eq.paid&select=id,order_number,fulfillment_status,created_at,commerce_fulfillments(printify_order_id,printify_status,tracking_number)&order=created_at.desc&limit=1000");
  const remoteByExternal = new Map<string, typeof result.orders>();
  for (const order of result.orders) {
    if (!order.externalId) continue;
    remoteByExternal.set(order.externalId, [...(remoteByExternal.get(order.externalId) || []), order]);
  }
  const findings: Array<Record<string, unknown>> = [];
  for (const local of localOrders) {
    const orderNumber = String(local.order_number || "");
    const fulfillment = Array.isArray(local.commerce_fulfillments) ? local.commerce_fulfillments[0] as Record<string, unknown> | undefined : local.commerce_fulfillments as Record<string, unknown> | undefined;
    const remote = remoteByExternal.get(orderNumber) || [];
    const ageMinutes = (Date.now() - new Date(String(local.created_at)).getTime()) / 60_000;
    if (!remote.length && ageMinutes > 30 && fulfillment?.printify_order_id) {
      findings.push({ type: "missing_provider_order", severity: "high", local, remote: null, summary: "Local fulfillment references a provider order that was not returned by Printify." });
    }
    if (remote.length > 1) findings.push({ type: "duplicate_submission", severity: "critical", local, remote, summary: "Multiple Printify orders share one local order number." });
    const first = remote[0];
    if (!first && ageMinutes > 60 && !fulfillment?.printify_order_id) findings.push({ type: "stalled_order", severity: "high", local, remote: null, summary: "Paid order has not reached Printify within the configured safety window." });
    if (first && fulfillment?.printify_status && String(fulfillment.printify_status) !== first.status) findings.push({ type: "status_mismatch", severity: "medium", local, remote: first, summary: "Local and Printify fulfillment statuses differ." });
    const localTracking = String(fulfillment?.tracking_number || "");
    if (first && localTracking && first.trackingNumbers.length && !first.trackingNumbers.includes(localTracking)) findings.push({ type: "tracking_mismatch", severity: "high", local, remote: first, summary: "Local tracking does not match the provider shipment." });
    if (first && ["canceled", "failed", "on-hold"].includes(first.status.toLowerCase())) findings.push({ type: "fulfillment_failure", severity: "high", local, remote: first, summary: `Printify reports ${first.status}.` });
  }
  for (const finding of findings) {
    const local = finding.local as Record<string, unknown>;
    const remote = finding.remote as { id?: string } | null;
    const key = `printify:${String(finding.type)}:${String(local.id)}:${remote?.id || "none"}`;
    await rest(service, "pod_reconciliation_findings?on_conflict=finding_key", {
      method: "POST",
      headers: serviceHeaders(service, "resolution=merge-duplicates,return=minimal"),
      body: JSON.stringify({
        provider: "printify",
        finding_key: key,
        finding_type: finding.type,
        severity: finding.severity,
        status: "open",
        commerce_order_id: local.id,
        provider_order_id: remote?.id || null,
        summary: finding.summary,
        evidence: { orderNumber: local.order_number, localStatus: local.fulfillment_status, providerStatus: (finding.remote as { status?: string } | null)?.status || null },
        last_detected_at: now
      })
    });
  }
  if (findings.some((item) => item.severity === "critical" || item.severity === "high")) {
    await recordReliabilityIncident({
      title: "Printify reconciliation found fulfillment discrepancies",
      plainExplanation: "One or more merchandise orders need administrator review before any retry or correction.",
      technicalExplanation: "The read-only reconciliation scan compared local orders, provider orders, tracking, and fulfillment status without creating or resubmitting an order.",
      severity: findings.some((item) => item.severity === "critical") ? 4 : 3,
      feature: "Printify",
      affectedOrderCount: findings.length,
      automaticResponse: "Preserved all records and flagged discrepancies. No duplicate provider orders were created.",
      recommendedAdminAction: "Open the Printify Management Center and review each reconciliation finding.",
      financialImpact: true,
      moneyAtRisk: true,
      metadata: { findingCount: findings.length }
    });
  }
  await finishRun(service, runId, { status: "completed", updated_count: snapshots.length, failure_count: findings.length, summary: { providerOrders: snapshots.length, findings: findings.length } });
  return { ok: true, orders: snapshots.length, findings: findings.length };
}

export async function runPrintifyHealthProbe(trigger: Trigger, adminId?: string) {
  const service = serviceCredentials();
  const health = await getPodProvider().health();
  if (!service) return health;
  const runId = await beginRun(service, "health", trigger, adminId);
  await logOperation(service, { operation: "health-probe", endpointGroup: "shop-products", success: health.functional === true, statusCode: health.status, durationMs: health.latencyMs || 0, rateLimitRemaining: health.rateLimitRemaining, errorCode: health.functional === true ? null : health.detail });
  await finishRun(service, runId, { status: health.functional === true ? "completed" : "failed", failure_count: health.functional === true ? 0 : 1, error_code: health.functional === true ? null : "PRINTIFY_HEALTH_FAILED", summary: health });
  return health;
}

export async function getPrintifyManagementData(): Promise<PrintifyManagementData> {
  const service = serviceCredentials();
  const health = await getPodProvider().health();
  if (!service) return { configured: false, providerMode: process.env.PRINTIFY_INTEGRATION_MODE || "disabled", settings: null, health, queue: [], syncRuns: [], products: [], providers: [], shippingRates: [], findings: [], apiLogs: [], orderSnapshots: [], metrics: [] };
  const [settings, queue, syncRuns, products, providers, shippingRates, findings, apiLogs, orderSnapshots, metrics] = await Promise.all([
    jsonRows(service, "pod_provider_settings?provider=eq.printify&select=*&limit=1"),
    jsonRows(service, "printify_fulfillment_jobs?select=id,order_id,status,attempts,next_attempt_at,last_error_code,printify_order_id,cancellation_requested_at,created_at,updated_at&order=updated_at.desc&limit=200"),
    jsonRows(service, "pod_sync_runs?provider=eq.printify&select=*&order=started_at.desc&limit=100"),
    jsonRows(service, "pod_product_snapshots?provider=eq.printify&select=provider_product_id,title,blueprint_id,print_provider_id,lifecycle_status,provider_visible,provider_locked,last_seen_at,removed_at&order=title.asc&limit=500"),
    jsonRows(service, "pod_provider_options?provider=eq.printify&select=*&order=title.asc&limit=500"),
    jsonRows(service, "pod_shipping_rate_cache?provider=eq.printify&select=*&order=fetched_at.desc&limit=250"),
    jsonRows(service, "pod_reconciliation_findings?provider=eq.printify&select=*&order=last_detected_at.desc&limit=250"),
    jsonRows(service, "pod_api_request_logs?provider=eq.printify&select=*&order=created_at.desc&limit=250"),
    jsonRows(service, "pod_order_snapshots?provider=eq.printify&select=*&order=last_synced_at.desc&limit=250"),
    jsonRows(service, "pod_provider_metrics_daily?provider=eq.printify&select=*&order=metric_date.desc&limit=365")
  ]);
  return { configured: true, providerMode: process.env.PRINTIFY_INTEGRATION_MODE || "disabled", settings: settings[0] || null, health, queue, syncRuns, products, providers, shippingRates, findings, apiLogs, orderSnapshots, metrics };
}
