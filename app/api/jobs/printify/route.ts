import { NextRequest, NextResponse } from "next/server";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { printifyMode, submitPrintifyOrder, type PrintifyLine } from "@/lib/commerce/printify";
import { CircuitOpenError, withCircuitBreaker } from "@/lib/reliability/circuit-breaker";
import { recordReliabilityIncident } from "@/lib/reliability/server";
import type { ShippingAddress } from "@/lib/purchase/types";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const expected = process.env.CRON_SECRET?.trim();
  return Boolean(expected && request.headers.get("authorization") === `Bearer ${expected}`);
}

function firstRow(value: unknown) {
  return Array.isArray(value) ? value[0] as Record<string, unknown> | undefined : value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (printifyMode() === "disabled") return NextResponse.json({ error: "Printify fulfillment is disabled. No jobs were claimed." }, { status: 503 });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ error: "Commerce storage is unavailable." }, { status: 503 });
  const headers = serviceHeaders(service);
  const settingsResponse = await fetch(`${service.url}/rest/v1/pod_provider_settings?provider=eq.printify&select=enabled,automatic_retry_enabled,max_retry_attempts&limit=1`, { cache: "no-store", headers });
  const [settings] = settingsResponse.ok ? await settingsResponse.json() as Array<{ enabled: boolean; automatic_retry_enabled: boolean; max_retry_attempts: number }> : [];
  if (settings && !settings.enabled) return NextResponse.json({ ok: true, skipped: "Printify order submission is disabled in ADMIN." });
  const maxAttempts = Math.max(1, Math.min(10, Number(settings?.max_retry_attempts || 5)));
  const automaticRetry = settings?.automatic_retry_enabled !== false;
  const claimResponse = await fetch(`${service.url}/rest/v1/rpc/claim_printify_fulfillment_jobs`, {
    method: "POST",
    headers,
    body: JSON.stringify({ p_limit: 5 })
  });
  const jobs = claimResponse.ok ? await claimResponse.json() as Array<{ id: string; order_id: string; attempts: number }> : [];
  const results: Array<{ jobId: string; status: string; code?: string }> = [];

  for (const job of jobs) {
    const orderResponse = await fetch(`${service.url}/rest/v1/commerce_orders?id=eq.${job.order_id}&select=id,order_number,user_id,merchandise_minor,shipping_minor,checkout_quote_id,commerce_checkout_quotes(shipping_method),commerce_shipping_addresses(*),commerce_order_items(id,quantity,product_id,variant_id,commerce_products(printify_product_id,printify_provider_id),product_variants(printify_variant_id,production_cost_minor))&limit=1`, { cache: "no-store", headers });
    const [order] = orderResponse.ok ? await orderResponse.json() as Record<string, unknown>[] : [];
    const addressRow = firstRow(order?.commerce_shipping_addresses);
    const quoteRow = firstRow(order?.commerce_checkout_quotes);
    const itemRows = Array.isArray(order?.commerce_order_items) ? order.commerce_order_items as Record<string, unknown>[] : [];
    const address: ShippingAddress | null = addressRow ? {
      fullName: String(addressRow.full_name || ""),
      addressLine1: String(addressRow.address_line_1 || ""),
      addressLine2: String(addressRow.address_line_2 || ""),
      city: String(addressRow.city || ""),
      region: String(addressRow.region || ""),
      postalCode: String(addressRow.postal_code || ""),
      country: String(addressRow.country || ""),
      phone: String(addressRow.phone || ""),
      instructions: String(addressRow.delivery_instructions || "")
    } : null;
    const lines: PrintifyLine[] = [];
    let providerOptionId = 0;
    let productionCostMinor = 0;
    for (const item of itemRows) {
      const product = firstRow(item.commerce_products);
      const variant = firstRow(item.product_variants);
      const productId = String(product?.printify_product_id || "");
      const variantId = Number(variant?.printify_variant_id);
      const quantity = Number(item.quantity || 0);
      if (!providerOptionId) providerOptionId = Number(product?.printify_provider_id || 0);
      if (productId && Number.isSafeInteger(variantId) && variantId > 0 && Number.isSafeInteger(quantity) && quantity > 0) {
        lines.push({ productId, variantId, quantity, externalId: String(item.id) });
        productionCostMinor += Number(variant?.production_cost_minor || 0) * quantity;
      }
    }
    const userResponse = order?.user_id ? await fetch(`${service.url}/auth/v1/admin/users/${encodeURIComponent(String(order.user_id))}`, { cache: "no-store", headers: { apikey: service.serviceKey, authorization: `Bearer ${service.serviceKey}` } }) : null;
    const user = userResponse?.ok ? await userResponse.json() as { email?: string } : {};
    if (!order || !address || !lines.length || !user.email || !quoteRow?.shipping_method) {
      const code = "FULFILLMENT_DATA_INCOMPLETE";
      await fetch(`${service.url}/rest/v1/printify_fulfillment_jobs?id=eq.${job.id}`, { method: "PATCH", headers, body: JSON.stringify({ status: "manual_approval", last_error_code: code, updated_at: new Date().toISOString() }) });
      await fetch(`${service.url}/rest/v1/commerce_fulfillment_events`, { method: "POST", headers, body: JSON.stringify({ order_id: job.order_id, event_type: "manual_approval_required", metadata: { code } }) });
      await recordReliabilityIncident({
        title: "Order requires manual fulfillment review",
        plainExplanation: "A paid merchandise order was preserved, but it is missing information required for safe fulfillment.",
        technicalExplanation: "The fulfillment worker declined to construct a provider order from incomplete stored data.",
        severity: 4,
        feature: "Orders",
        orderId: job.order_id,
        affectedOrderCount: 1,
        automaticResponse: "Moved the job to manual approval without creating a remote order or changing the payment.",
        recommendedAdminAction: "Review the order, address, product mapping, and shipping method before authorizing fulfillment.",
        financialImpact: true,
        moneyAtRisk: true,
        metadata: { jobId: job.id, failureCode: code }
      });
      results.push({ jobId: job.id, status: "manual_approval", code });
      continue;
    }
    const submitted = await withCircuitBreaker("printify-fulfillment", async () => {
      const result = await submitPrintifyOrder({ orderNumber: String(order.order_number), address, email: String(user.email), shippingMethod: String(quoteRow.shipping_method), lines });
      if (!result.ok || !result.orderId) throw new Error(result.code || "PRINTIFY_SUBMISSION_FAILED");
      return result;
    }, { threshold: 3, cooldownMs: 60_000 }).catch((error: unknown) => ({
      ok: false as const,
      orderId: null,
      code: error instanceof CircuitOpenError ? "PRINTIFY_CIRCUIT_OPEN" : error instanceof Error ? error.message : "PRINTIFY_SUBMISSION_FAILED"
    }));
    if (!submitted.ok || !submitted.orderId) {
      const terminal = !automaticRetry || job.attempts >= maxAttempts;
      const retryMinutes = Math.min(60, Math.max(2, 2 ** job.attempts));
      await fetch(`${service.url}/rest/v1/printify_fulfillment_jobs?id=eq.${job.id}`, { method: "PATCH", headers, body: JSON.stringify({ status: terminal ? "failed" : "retry", last_error_code: submitted.code, next_attempt_at: new Date(Date.now() + retryMinutes * 60_000).toISOString(), updated_at: new Date().toISOString() }) });
      await fetch(`${service.url}/rest/v1/commerce_fulfillment_events`, { method: "POST", headers, body: JSON.stringify({ order_id: job.order_id, event_type: terminal ? "printify_submission_failed" : "printify_submission_retry", metadata: { code: submitted.code, attempt: job.attempts } }) });
      if (terminal) {
        await recordReliabilityIncident({
          title: "Printify fulfillment exhausted safe retries",
          plainExplanation: "A paid merchandise order could not be submitted to the fulfillment provider after the approved retry limit.",
          technicalExplanation: "The fulfillment queue preserved the order and stopped retrying to prevent duplicate remote orders.",
          severity: 4,
          feature: "Printify",
          orderId: job.order_id,
          affectedOrderCount: 1,
          automaticResponse: "Stopped retries, retained the order, and marked the fulfillment job for administrator review.",
          recommendedAdminAction: "Confirm provider status and verify that no remote order exists before approving another attempt.",
          financialImpact: true,
          moneyAtRisk: true,
          metadata: { jobId: job.id, failureCode: submitted.code || "PRINTIFY_SUBMISSION_FAILED", attempt: job.attempts }
        });
      }
      results.push({ jobId: job.id, status: terminal ? "failed" : "retry", code: submitted.code || undefined });
      await fetch(`${service.url}/rest/v1/pod_api_request_logs`, { method: "POST", headers: serviceHeaders(service, "return=minimal"), body: JSON.stringify({ provider: "printify", operation: "order-submit", method: "POST", endpoint_group: "shop-orders", success: false, status_code: null, duration_ms: 0, error_code: submitted.code || "PRINTIFY_SUBMISSION_FAILED", correlation_id: job.id }) });
      continue;
    }
    const marginMinor = Number(order.merchandise_minor || 0) - productionCostMinor;
    await Promise.all([
      fetch(`${service.url}/rest/v1/printify_fulfillment_jobs?id=eq.${job.id}`, { method: "PATCH", headers, body: JSON.stringify({ status: "submitted", printify_order_id: submitted.orderId, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }) }),
      fetch(`${service.url}/rest/v1/commerce_fulfillments?order_id=eq.${job.order_id}`, { method: "PATCH", headers, body: JSON.stringify({ printify_order_id: submitted.orderId, printify_status: "submitted", submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() }) }),
      fetch(`${service.url}/rest/v1/commerce_orders?id=eq.${job.order_id}`, { method: "PATCH", headers, body: JSON.stringify({ fulfillment_status: "processing", printify_production_cost_minor: productionCostMinor, printify_shipping_cost_minor: Number(order.shipping_minor || 0), estimated_fulfillment_minor: productionCostMinor + Number(order.shipping_minor || 0), estimated_margin_minor: marginMinor, updated_at: new Date().toISOString() }) }),
      fetch(`${service.url}/rest/v1/commerce_order_status_history`, { method: "POST", headers, body: JSON.stringify({ order_id: job.order_id, status: "processing", note: "Printify accepted the fulfillment order." }) }),
      fetch(`${service.url}/rest/v1/customer_notifications`, { method: "POST", headers: serviceHeaders(service, "resolution=ignore-duplicates,return=minimal"), body: JSON.stringify({ user_id: order.user_id, notification_type: "order_processing", title: "Order processing", message: `Order ${String(order.order_number)} is being prepared.`, destination_url: "/account", related_entity_type: "commerce_order", related_entity_id: job.order_id, idempotency_key: `printify-processing:${job.order_id}` }) }),
      fetch(`${service.url}/rest/v1/email_delivery_jobs`, { method: "POST", headers: serviceHeaders(service, "resolution=ignore-duplicates,return=minimal"), body: JSON.stringify({ user_id: order.user_id, recipient_email: user.email, template_key: "order_processing", payload: { orderNumber: order.order_number }, related_entity_type: "commerce_order", related_entity_id: job.order_id, idempotency_key: `printify-processing-email:${job.order_id}` }) })
      ,fetch(`${service.url}/rest/v1/commerce_fulfillment_events`, { method: "POST", headers, body: JSON.stringify({ order_id: job.order_id, event_type: "printify_order_submitted", metadata: { printifyOrderId: submitted.orderId, productionCostMinor, estimatedMarginMinor: marginMinor } }) })
      ,fetch(`${service.url}/rest/v1/analytics_events`, { method: "POST", headers: serviceHeaders(service, "resolution=ignore-duplicates,return=minimal"), body: JSON.stringify({ event_type: "printify_fulfillment_submitted", event_key: `printify-submit:${job.order_id}`, user_id: order.user_id, content_type: "commerce_order", content_id: job.order_id, metadata: { productionCostMinor, estimatedMarginMinor: marginMinor } }) })
    ]);
    await fetch(`${service.url}/rest/v1/pod_api_request_logs`, { method: "POST", headers: serviceHeaders(service, "return=minimal"), body: JSON.stringify({ provider: "printify", operation: "order-submit", method: "POST", endpoint_group: "shop-orders", success: true, status_code: 200, duration_ms: 0, correlation_id: job.id }) });
    await fetch(`${service.url}/rest/v1/rpc/record_pod_provider_metric`, { method: "POST", headers, body: JSON.stringify({ p_provider: "printify", p_provider_option_id: providerOptionId, p_order_count: 1, p_revenue_minor: Number(order.merchandise_minor || 0), p_successful_orders: 1 }) });
    results.push({ jobId: job.id, status: "submitted" });
  }
  return NextResponse.json({ ok: true, mode: printifyMode(), claimed: jobs.length, results });
}
