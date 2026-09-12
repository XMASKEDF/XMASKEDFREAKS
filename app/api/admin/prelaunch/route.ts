import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession, hasAdminPermission, hasRecentAdminReauthentication, isSuperAdmin } from "@/lib/admin-auth";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { extractClientIp } from "@/lib/security";

export const dynamic = "force-dynamic";

async function authorize(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  return admin && hasAdminPermission(admin, "admin.operations.manage") ? admin : null;
}

async function rows(url: string, headers: Record<string, string>) {
  const response = await fetch(url, { cache: "no-store", headers }).catch(() => null);
  return response?.ok ? await response.json() as Record<string, unknown>[] : [];
}

function clean(value: unknown, max: number) {
  return String(value || "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function maskEmail(value: unknown) {
  const [name, host] = String(value || "").split("@");
  return name && host ? `${name.slice(0, 2)}***@${host}` : "";
}

export async function GET(request: NextRequest) {
  const admin = await authorize(request);
  if (!admin) return NextResponse.json({ error: "ADMIN authorization and 2FA are required." }, { status: 403 });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ configured: false, error: "Supabase operations storage is not configured." });
  const headers = serviceHeaders(service);
  const [products, reservations, inventoryEvents, templates, emailJobs, policies, announcements, audits, analytics, maintenance, orders, wallets, customers, restocks, paintings] = await Promise.all([
    rows(`${service.url}/rest/v1/commerce_products?product_type=eq.physical&select=id,title,sku,inventory_quantity,low_stock_threshold,restock_at,restock_notifications_enabled,show_exact_inventory,is_active,is_published,product_variants(id,sku,size,color,inventory_quantity,low_stock_threshold,restock_at,is_active)&order=title.asc`, headers),
    rows(`${service.url}/rest/v1/inventory_reservations?consumed_at=is.null&released_at=is.null&expires_at=gt.${new Date().toISOString()}&select=id,product_id,variant_id,quantity,expires_at&order=expires_at.asc&limit=300`, headers),
    rows(`${service.url}/rest/v1/inventory_events?select=id,product_id,variant_id,event_type,quantity_delta,quantity_after,reason,admin_user_id,order_id,created_at&order=created_at.desc&limit=300`, headers),
    rows(`${service.url}/rest/v1/email_templates?select=*&order=template_key.asc`, headers),
    rows(`${service.url}/rest/v1/email_delivery_jobs?select=id,template_key,recipient_email,status,retry_count,queued_at,sent_at,failure_reason&order=queued_at.desc&limit=200`, headers),
    rows(`${service.url}/rest/v1/policy_documents?select=id,slug,title,requires_acceptance,policy_versions(id,version_number,status,effective_at,publish_at,published_at,created_at)&order=created_at.asc`, headers),
    rows(`${service.url}/rest/v1/site_announcements?select=*&order=created_at.desc&limit=100`, headers),
    rows(`${service.url}/rest/v1/admin_audit_events?select=id,admin_user_id,event_type,ip_address,user_agent,metadata,created_at&order=created_at.desc&limit=500`, headers),
    rows(`${service.url}/rest/v1/analytics_events?select=event_type,page_path,content_type,content_id,search_term,result_count,filter_value,destination_type,country_code,language_code,device_type,referrer_host,occurred_at&order=occurred_at.desc&limit=1000`, headers),
    rows(`${service.url}/rest/v1/maintenance_settings?id=eq.primary&select=*`, headers),
    rows(`${service.url}/rest/v1/commerce_orders?select=id,user_id,total_coins,payment_status,fulfillment_status,created_at`, headers),
    rows(`${service.url}/rest/v1/wallet_transactions?select=id,user_id,total_coins,status,transaction_type,created_at`, headers),
    rows(`${service.url}/rest/v1/profiles?select=id,created_at`, headers),
    rows(`${service.url}/rest/v1/restock_requests?select=id,fulfilled_at,unsubscribed_at,created_at`, headers),
    rows(`${service.url}/rest/v1/painting_auctions?select=id,status,current_bid,buy_now_price`, headers)
  ]);
  const paidOrders = orders.filter((order) => order.payment_status === "paid");
  const purchaserIds = new Set(paidOrders.map((order) => String(order.user_id)));
  const walletCoinChange = wallets.reduce((sum, transaction) => sum + Number(transaction.total_coins || 0), 0);
  return NextResponse.json({
    configured: true,
    products, reservations, inventoryEvents, templates,
    emailJobs: emailJobs.map((job) => ({ ...job, recipient_email: maskEmail(job.recipient_email) })),
    policies, announcements,
    audits: audits.map((audit) => ({ ...audit, ip_address: String(audit.ip_address || "").replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)/, "$1.$2.x.x") })),
    analytics, maintenance: maintenance[0] || null,
    metrics: {
      registeredCustomers: customers.length,
      totalOrders: orders.length,
      completedOrders: paidOrders.length,
      coinsSpent: paidOrders.reduce((sum, order) => sum + Number(order.total_coins || 0), 0),
      averageOrderCoins: paidOrders.length ? Math.round(paidOrders.reduce((sum, order) => sum + Number(order.total_coins || 0), 0) / paidOrders.length) : 0,
      uniquePurchasers: purchaserIds.size,
      walletCoinChange,
      failedWalletTransactions: wallets.filter((transaction) => transaction.status === "failed").length,
      restockRequests: restocks.filter((request) => !request.unsubscribed_at).length,
      fulfilledRestocks: restocks.filter((request) => request.fulfilled_at).length,
      paintingsSold: paintings.filter((painting) => ["sold","fulfillment_pending","delivered"].includes(String(painting.status))).length,
      paintingsAvailable: paintings.filter((painting) => ["live","extended","scheduled"].includes(String(painting.status))).length
    }
  });
}

export async function POST(request: NextRequest) {
  const admin = await authorize(request);
  if (!admin) return NextResponse.json({ error: "ADMIN authorization and 2FA are required." }, { status: 403 });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ error: "Supabase operations storage is not configured." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = clean(body.action, 60);
  const headers = serviceHeaders(service);
  let response: Response | null = null;

  if (action === "inventory-adjust") {
    const delta = Math.max(-10000, Math.min(10000, Math.trunc(Number(body.delta || 0))));
    const reason = clean(body.reason, 250);
    if (!delta || reason.length < 4) return NextResponse.json({ error: "A non-zero quantity and clear reason are required." }, { status: 400 });
    response = await fetch(`${service.url}/rest/v1/rpc/adjust_commerce_inventory`, {
      method: "POST", headers, body: JSON.stringify({ p_product_id: body.productId, p_variant_id: body.variantId || null, p_delta: delta, p_reason: reason, p_admin_id: admin.id })
    });
  } else if (action === "inventory-settings") {
    response = await fetch(`${service.url}/rest/v1/commerce_products?id=eq.${encodeURIComponent(String(body.productId || ""))}`, {
      method: "PATCH", headers, body: JSON.stringify({ low_stock_threshold: Math.max(0, Math.trunc(Number(body.lowStockThreshold || 0))), restock_at: body.restockAt ? new Date(String(body.restockAt)).toISOString() : null, restock_notifications_enabled: body.restockNotificationsEnabled === true, show_exact_inventory: body.showExactInventory === true, updated_by: admin.id, updated_at: new Date().toISOString() })
    });
  } else if (action === "template-save") {
    const key = clean(body.templateKey, 80);
    const current = await rows(`${service.url}/rest/v1/email_templates?template_key=eq.${encodeURIComponent(key)}&select=allowed_variables`, headers);
    const allowed = Array.isArray(current[0]?.allowed_variables) ? current[0].allowed_variables as string[] : [];
    const subject = clean(body.subject, 180).replace(/[\r\n]/g, " ");
    const bodyText = clean(body.bodyText, 8000);
    const variables = [...subject.matchAll(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g), ...bodyText.matchAll(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g)].map((match) => match[1]);
    if (!key || !subject || !bodyText || variables.some((variable) => !allowed.includes(variable))) return NextResponse.json({ error: "Template content is invalid or contains an unapproved variable." }, { status: 400 });
    response = await fetch(`${service.url}/rest/v1/email_templates?template_key=eq.${encodeURIComponent(key)}`, {
      method: "PATCH", headers, body: JSON.stringify({ subject, body_text: bodyText, header_image_url: clean(body.headerImageUrl, 1000) || null, button_label: clean(body.buttonLabel, 80) || null, enabled: body.enabled !== false, updated_by: admin.id, updated_at: new Date().toISOString() })
    });
  } else if (action === "email-test") {
    const recent = await rows(`${service.url}/rest/v1/email_delivery_jobs?recipient_email=eq.${encodeURIComponent(admin.email)}&related_entity_type=eq.admin_test&queued_at=gt.${new Date(Date.now() - 60_000).toISOString()}&select=id`, headers);
    if (recent.length >= 3) return NextResponse.json({ error: "Test-email rate limit reached. Try again in one minute." }, { status: 429 });
    response = await fetch(`${service.url}/rest/v1/email_delivery_jobs`, {
      method: "POST", headers, body: JSON.stringify({ recipient_email: admin.email, template_key: clean(body.templateKey, 80), payload: { nickname: admin.username, message: "ADMIN template test", orderNumber: "TEST-001", productName: "Test product", walletBalance: 240, coinAmount: 20 }, related_entity_type: "admin_test", idempotency_key: `admin-test:${admin.id}:${randomUUID()}` })
    });
  } else if (action === "announcement-save") {
    const item = { title: clean(body.title, 180), message: clean(body.message, 1200), image_url: clean(body.imageUrl, 1000) || null, destination_url: clean(body.destinationUrl, 500) || null, audience: clean(body.audience || "all_visitors", 40), priority: clean(body.priority || "normal", 20), published: body.published === true, starts_at: body.startsAt ? new Date(String(body.startsAt)).toISOString() : null, ends_at: body.endsAt ? new Date(String(body.endsAt)).toISOString() : null, created_by: admin.id, updated_at: new Date().toISOString() };
    if (!item.title || !item.message || (item.destination_url && !item.destination_url.startsWith("/"))) return NextResponse.json({ error: "Announcement title, message, and a safe internal destination are required." }, { status: 400 });
    response = await fetch(`${service.url}/rest/v1/site_announcements`, { method: "POST", headers, body: JSON.stringify(item) });
  } else if (action === "policy-save") {
    const policyId = clean(body.policyId, 80);
    const bodyText = clean(body.bodyText, 30000);
    const status = body.status === "published" ? "published" : "draft";
    if (!policyId || bodyText.length < 40) return NextResponse.json({ error: "Select a policy and provide complete policy text." }, { status: 400 });
    const versions = await rows(`${service.url}/rest/v1/policy_versions?policy_id=eq.${encodeURIComponent(policyId)}&select=version_number&order=version_number.desc&limit=1`, headers);
    const languageCode = /^[a-z]{2}(?:-[A-Z]{2})?$/.test(String(body.languageCode || "")) ? String(body.languageCode) : "en";
    response = await fetch(`${service.url}/rest/v1/policy_versions`, { method: "POST", headers, body: JSON.stringify({ policy_id: policyId, version_number: Number(versions[0]?.version_number || 0) + 1, language_code: languageCode, body_text: bodyText, status, effective_at: status === "published" ? new Date().toISOString() : null, published_at: status === "published" ? new Date().toISOString() : null, created_by: admin.id }) });
  } else if (action === "audit-export") {
    const token = request.cookies.get(adminSessionCookie)?.value;
    if (!isSuperAdmin(admin) || !await hasRecentAdminReauthentication(token)) return NextResponse.json({ error: "Super Admin and recent reauthentication are required for sensitive exports." }, { status: 428 });
    const audits = await rows(`${service.url}/rest/v1/admin_audit_events?select=id,admin_user_id,event_type,ip_address,user_agent,metadata,created_at&order=created_at.desc&limit=5000`, headers);
    await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_audit_exported", ipAddress: extractClientIp(request.headers), userAgent: request.headers.get("user-agent") || "unknown", metadata: { count: audits.length } });
    const csv = ["id,admin,event_type,ip,user_agent,created_at", ...audits.map((item) => [item.id, item.admin_user_id, item.event_type, item.ip_address, item.user_agent, item.created_at].map((value) => `"${String(value || "").replaceAll("\"", "\"\"")}"`).join(","))].join("\n");
    return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=xmf-admin-audit.csv" } });
  } else return NextResponse.json({ error: "Unsupported pre-launch action." }, { status: 400 });

  if (!response.ok) {
    await auditAdminEvent({ adminUserId: admin.id, eventType: `admin_prelaunch_${action}_failed`, ipAddress: extractClientIp(request.headers), userAgent: request.headers.get("user-agent") || "unknown", metadata: { target: body.productId || body.templateKey || body.policyId || null, status: response.status } });
    return NextResponse.json({ error: "The database rejected this operation." }, { status: 422 });
  }
  if (action === "inventory-adjust" && Number(body.delta || 0) > 0) {
    const variantFilter = body.variantId ? `&variant_id=eq.${encodeURIComponent(String(body.variantId))}` : "&variant_id=is.null";
    const requests = await rows(`${service.url}/rest/v1/restock_requests?product_id=eq.${encodeURIComponent(String(body.productId || ""))}${variantFilter}&fulfilled_at=is.null&unsubscribed_at=is.null&select=id,user_id,email`, headers);
    const products = await rows(`${service.url}/rest/v1/commerce_products?id=eq.${encodeURIComponent(String(body.productId || ""))}&select=title`, headers);
    const productName = String(products[0]?.title || "An item");
    for (const requestRow of requests.slice(0, 500)) {
      if (requestRow.user_id) await fetch(`${service.url}/rest/v1/customer_notifications`, { method: "POST", headers: serviceHeaders(service, "resolution=ignore-duplicates,return=minimal"), body: JSON.stringify({ user_id: requestRow.user_id, notification_type: "product_restocked", title: "Back in stock", message: `${productName} is available again.`, destination_url: "/merch", related_entity_type: "restock_request", related_entity_id: requestRow.id, idempotency_key: `restock-notice:${requestRow.id}` }) });
      if (requestRow.email) await fetch(`${service.url}/rest/v1/email_delivery_jobs`, { method: "POST", headers: serviceHeaders(service, "resolution=ignore-duplicates,return=minimal"), body: JSON.stringify({ user_id: requestRow.user_id || null, recipient_email: requestRow.email, template_key: "restock", payload: { nickname: "Customer", productName }, related_entity_type: "restock_request", related_entity_id: requestRow.id, idempotency_key: `restock-email:${requestRow.id}` }) });
      await fetch(`${service.url}/rest/v1/restock_requests?id=eq.${requestRow.id}`, { method: "PATCH", headers, body: JSON.stringify({ fulfilled_at: new Date().toISOString() }) });
    }
  }
  await auditAdminEvent({ adminUserId: admin.id, eventType: `admin_prelaunch_${action}`, ipAddress: extractClientIp(request.headers), userAgent: request.headers.get("user-agent") || "unknown", metadata: { productId: body.productId || null, variantId: body.variantId || null, templateKey: body.templateKey || null, policyId: body.policyId || null } });
  return NextResponse.json({ ok: true });
}
