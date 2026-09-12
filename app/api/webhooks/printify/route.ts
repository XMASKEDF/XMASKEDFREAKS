import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";

export const dynamic = "force-dynamic";

function validSignature(raw: string, signature: string | null, secret: string) {
  if (!signature) return false;
  const digest = createHmac("sha256", secret).update(raw).digest();
  const candidates = [Buffer.from(signature, "base64"), Buffer.from(signature, "hex")].filter((candidate) => candidate.length === digest.length);
  return candidates.some((candidate) => timingSafeEqual(candidate, digest));
}

function record(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export async function POST(request: NextRequest) {
  const secret = process.env.PRINTIFY_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Webhook verification is not configured." }, { status: 503 });
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-pfy-signature"), secret)) return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  const payload = await Promise.resolve().then(() => JSON.parse(raw) as Record<string, unknown>).catch(() => null);
  if (!payload) return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  const eventType = String(payload.type || "");
  const resource = record(payload.resource);
  const data = record(payload.data);
  const printifyOrderId = String(resource.id || data.id || data.order_id || "");
  if (!printifyOrderId || !["order:updated", "order:shipment:created", "order:shipment:delivered"].includes(eventType)) return NextResponse.json({ ok: true, ignored: true });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ error: "Commerce storage is unavailable." }, { status: 503 });
  const headers = serviceHeaders(service);
  const fulfillmentResponse = await fetch(`${service.url}/rest/v1/commerce_fulfillments?printify_order_id=eq.${encodeURIComponent(printifyOrderId)}&select=order_id,submitted_at,shipped_at&limit=1`, { cache: "no-store", headers });
  const [fulfillment] = fulfillmentResponse.ok ? await fulfillmentResponse.json() as Array<{ order_id: string; submitted_at: string | null; shipped_at: string | null }> : [];
  if (!fulfillment) return NextResponse.json({ ok: true, ignored: true });
  const shipment = record(data.shipment || resource.shipment || data);
  const trackingNumber = String(shipment.tracking_number || shipment.tracking || "");
  const trackingUrl = String(shipment.tracking_url || shipment.url || "");
  const carrier = String(shipment.carrier || "");
  const delivered = eventType === "order:shipment:delivered";
  const shipped = delivered || eventType === "order:shipment:created";
  const status = delivered ? "delivered" : shipped ? "shipped" : String(data.status || resource.status || "processing");
  const now = new Date().toISOString();
  const update = await fetch(`${service.url}/rest/v1/commerce_fulfillments?order_id=eq.${fulfillment.order_id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      printify_status: status,
      carrier: carrier || null,
      tracking_number: trackingNumber || null,
      tracking_url: trackingUrl || null,
      shipped_at: shipped ? now : undefined,
      delivered_at: delivered ? now : undefined,
      updated_at: now
    })
  });
  if (!update.ok) return NextResponse.json({ error: "Fulfillment update failed." }, { status: 503 });
  await fetch(`${service.url}/rest/v1/commerce_orders?id=eq.${fulfillment.order_id}`, { method: "PATCH", headers, body: JSON.stringify({ fulfillment_status: status, updated_at: now }) });
  await fetch(`${service.url}/rest/v1/commerce_order_status_history`, { method: "POST", headers, body: JSON.stringify({ order_id: fulfillment.order_id, status, note: `Verified Printify webhook: ${eventType}` }) });
  await fetch(`${service.url}/rest/v1/commerce_fulfillment_events`, { method: "POST", headers, body: JSON.stringify({ order_id: fulfillment.order_id, event_type: eventType, actor_type: "provider", metadata: { status, carrier: carrier || null, hasTracking: Boolean(trackingNumber) } }) });
  await fetch(`${service.url}/rest/v1/analytics_events`, { method: "POST", headers: serviceHeaders(service, "resolution=ignore-duplicates,return=minimal"), body: JSON.stringify({ event_type: delivered ? "order_delivered" : shipped ? "order_shipped" : "printify_order_updated", event_key: `printify:${eventType}:${fulfillment.order_id}:${trackingNumber || status}`, content_type: "commerce_order", content_id: fulfillment.order_id, metadata: { status, carrier: carrier || null, hasTracking: Boolean(trackingNumber) } }) });
  await fetch(`${service.url}/rest/v1/pod_order_snapshots?provider=eq.printify&provider_order_id=eq.${encodeURIComponent(printifyOrderId)}`, { method: "PATCH", headers, body: JSON.stringify({ status, tracking_numbers: trackingNumber ? [trackingNumber] : [], fulfilled_at: delivered ? now : null, last_synced_at: now }) });
  if (delivered) {
    const productionHours = fulfillment.submitted_at && fulfillment.shipped_at ? Math.max(0, (new Date(fulfillment.shipped_at).getTime() - new Date(fulfillment.submitted_at).getTime()) / 3_600_000) : 0;
    const shippingHours = fulfillment.shipped_at ? Math.max(0, (Date.now() - new Date(fulfillment.shipped_at).getTime()) / 3_600_000) : 0;
    await fetch(`${service.url}/rest/v1/rpc/record_pod_provider_metric`, { method: "POST", headers, body: JSON.stringify({ p_provider: "printify", p_provider_option_id: 0, p_production_hours: productionHours, p_shipping_hours: shippingHours, p_fulfilled_orders: 1 }) });
  }
  if (shipped) {
    const orderResponse = await fetch(`${service.url}/rest/v1/commerce_orders?id=eq.${fulfillment.order_id}&select=user_id,order_number&limit=1`, { cache: "no-store", headers });
    const [order] = orderResponse.ok ? await orderResponse.json() as Array<{ user_id: string; order_number: string }> : [];
    if (order) {
      const userResponse = await fetch(`${service.url}/auth/v1/admin/users/${encodeURIComponent(order.user_id)}`, { cache: "no-store", headers: { apikey: service.serviceKey, authorization: `Bearer ${service.serviceKey}` } });
      const user = userResponse.ok ? await userResponse.json() as { email?: string } : {};
      const eventKey = delivered ? "delivered" : "shipped";
      await fetch(`${service.url}/rest/v1/customer_notifications`, { method: "POST", headers: serviceHeaders(service, "resolution=ignore-duplicates,return=minimal"), body: JSON.stringify({ user_id: order.user_id, notification_type: `order_${eventKey}`, title: delivered ? "Order delivered" : "Order shipped", message: delivered ? `Order ${order.order_number} was marked delivered.` : `Order ${order.order_number} shipped${trackingNumber ? ` with tracking ${trackingNumber}` : ""}.`, destination_url: "/account", related_entity_type: "commerce_order", related_entity_id: fulfillment.order_id, idempotency_key: `printify-${eventKey}:${fulfillment.order_id}` }) });
      if (user.email) await fetch(`${service.url}/rest/v1/email_delivery_jobs`, { method: "POST", headers: serviceHeaders(service, "resolution=ignore-duplicates,return=minimal"), body: JSON.stringify({ user_id: order.user_id, recipient_email: user.email, template_key: delivered ? "order_delivered" : "order_shipped", payload: { orderNumber: order.order_number, trackingNumber }, related_entity_type: "commerce_order", related_entity_id: fulfillment.order_id, idempotency_key: `printify-${eventKey}-email:${fulfillment.order_id}` }) });
    }
  }
  return NextResponse.json({ ok: true });
}
