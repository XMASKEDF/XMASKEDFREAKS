import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession } from "@/lib/admin-auth";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { getMerchCatalog, isRetiredShortsCategory } from "@/lib/commerce/catalog";
import { centsToCoinsCeil, parseUsdToCents } from "@/lib/commerce/coins";
import { extractClientIp } from "@/lib/security";
import type { MerchCategory, MerchLanguage, MerchProduct } from "@/lib/commerce/types";
import { revalidateTag } from "next/cache";

async function authorized(request: NextRequest) { const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value); return admin?.role === "ADMIN" && admin.two_factor_required ? admin : null; }
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
const cleanText = (value: unknown, max: number) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/<[^>]*>/g, "").trim().slice(0, max);
const safeImageUrl = (value: unknown) => { const url = String(value ?? "").trim(); return url && !/^javascript:/i.test(url) && (url.startsWith("/") || /^https:\/\//i.test(url)) ? url.slice(0, 1000) : ""; };
const safeImageList = (value: unknown) => Array.from(new Set((Array.isArray(value) ? value : []).map(safeImageUrl).filter(Boolean))).slice(0, 12);
const parseWholeNumber = (value: unknown, label: string, minimum: number, maximum: number) => { const text = String(value ?? "").trim(); if (!/^\d+$/.test(text)) throw new Error(`INVALID ${label.toUpperCase()}`); const number = Number(text); if (!Number.isSafeInteger(number) || number < minimum || number > maximum) throw new Error(`INVALID ${label.toUpperCase()}`); return number; };
async function isRetiredShortsCategoryId(service: NonNullable<ReturnType<typeof serviceCredentials>>, categoryId: string) {
  const response = await fetch(`${service.url}/rest/v1/merch_categories?id=eq.${encodeURIComponent(categoryId)}&select=slug&limit=1`, { headers: serviceHeaders(service), cache: "no-store" }).catch(() => null);
  const rows = response?.ok ? await response.json().catch(() => []) as Array<{ slug?: unknown }> : [];
  return rows[0] ? isRetiredShortsCategory({ slug: rows[0].slug }) : false;
}
type ProductEntryInput = { name?: unknown; categoryId?: unknown; mainImageUrl?: unknown; additionalImageUrls?: unknown; price?: unknown; shippingCost?: unknown; shippingMode?: unknown; bio?: unknown; inventoryQuantity?: unknown; status?: unknown; fulfillmentType?: unknown; sku?: unknown; requiresSize?: unknown; internationalShippingAllowed?: unknown; quantityLimit?: unknown };
function productEntry(input: ProductEntryInput, catalog: Awaited<ReturnType<typeof getMerchCatalog>>) {
  const name = cleanText(input.name, 140);
  const categoryId = String(input.categoryId || "");
  const category = catalog.categories.find((item) => item.id === categoryId);
  const imageUrl = safeImageUrl(input.mainImageUrl);
  const additionalImages = safeImageList(input.additionalImageUrls);
  const priceMinor = parseUsdToCents(input.price, "Price", false);
  const shippingMinor = parseUsdToCents(input.shippingCost ?? "0", "Shipping cost");
  const shippingMode = ["manual", "provider", "free"].includes(String(input.shippingMode)) ? String(input.shippingMode) : "manual";
  const fulfillmentType = String(input.fulfillmentType) === "printify" ? "printify" : "manual";
  const inventoryQuantity = parseWholeNumber(input.inventoryQuantity ?? "0", "Inventory", 0, 1_000_000);
  const quantityLimit = parseWholeNumber(input.quantityLimit ?? "1", "Quantity limit", 1, 100);
  const status = ["draft", "published", "hidden", "out_of_stock", "archived"].includes(String(input.status)) ? String(input.status) : "draft";
  if (!name) throw new Error("PRODUCT NAME REQUIRED");
  if (!category) throw new Error("SELECT A CATEGORY");
  if (!imageUrl) throw new Error("PRODUCT IMAGE REQUIRED");
  if (!cleanText(input.bio, 2000) && status === "published") throw new Error("PRODUCT BIO REQUIRED BEFORE PUBLISHING");
  return {
    title: name,
    short_description: cleanText(input.bio, 1000),
    full_description: cleanText(input.bio, 2000),
    category_id: category.id,
    coin_price: centsToCoinsCeil(priceMinor),
    price_minor: priceMinor,
    shipping_cost_minor: shippingMode === "free" ? 0 : shippingMinor,
    shipping_mode: shippingMode,
    sku: cleanText(input.sku, 100) || `MERCH-${Date.now()}`,
    image_url: imageUrl,
    secondary_image_url: additionalImages[0] || null,
    additional_images: additionalImages,
    inventory_tracking_enabled: true,
    inventory_quantity: inventoryQuantity,
    requires_shipping: true,
    requires_size: Boolean(input.requiresSize),
    international_shipping_allowed: Boolean(input.internationalShippingAllowed),
    quantity_limit: quantityLimit,
    low_stock_threshold: 0,
    fulfillment_type: fulfillmentType,
    fulfillment_enabled: false,
    is_active: status !== "draft" && status !== "archived",
    is_published: status === "published" || status === "out_of_stock",
    is_featured: false,
    sort_order: Math.max(1, ...catalog.products.map((item) => item.sortOrder + 1))
  };
}
export async function POST(request: NextRequest) {
  const admin = await authorized(request); if (!admin) return NextResponse.json({ error: "ADMIN authorization and 2FA are required." }, { status: 403 });
  const service = serviceCredentials(); if (!service) return NextResponse.json({ error: "Supabase commerce storage is not configured." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { action?: string; id?: string; direction?: string; delta?: number; reason?: string; name?: string; icon?: string; code?: string; label?: string; nativeLabel?: string; language?: MerchLanguage; category?: MerchCategory; product?: MerchProduct; productEntry?: ProductEntryInput };
  const headers = serviceHeaders(service); let response: Response | null = null; const action = String(body.action || "");
  if (action === "language-create") {
    const code = String(body.code || "").trim();
    const label = String(body.label || "").trim().slice(0, 80);
    const nativeLabel = String(body.nativeLabel || "").trim().slice(0, 80);
    if (!/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(code) || !label || !nativeLabel) return NextResponse.json({ error: "Use a valid language code and both labels." }, { status: 400 });
    response = await fetch(`${service.url}/rest/v1/merch_languages`, { method: "POST", headers, body: JSON.stringify({ code, label, native_label: nativeLabel, sort_order: 999, is_enabled: false, is_published: false }) });
  }
  else if (action === "language-save" && body.language) {
    const language = body.language;
    response = await fetch(`${service.url}/rest/v1/merch_languages?id=eq.${language.id}`, { method: "PATCH", headers, body: JSON.stringify({ label: language.label.trim().slice(0, 80), native_label: language.nativeLabel.trim().slice(0, 80), sort_order: Math.max(1, Math.floor(language.sortOrder)), is_enabled: language.enabled, is_published: language.published, updated_at: new Date().toISOString() }) });
  }
  else if (action === "category-create") { const name = String(body.name || "").trim().slice(0, 80); if (!name) return NextResponse.json({ error: "Category name is required." }, { status: 400 }); const requestedSlug = slugify(name); const slug = requestedSlug === "shorts" || requestedSlug === "short" ? `shorts-custom-${Date.now()}` : requestedSlug; response = await fetch(`${service.url}/rest/v1/merch_categories`, { method: "POST", headers, body: JSON.stringify({ name, slug, icon: String(body.icon || "◇").slice(0, 8), sort_order: 999 }) }); }
  else if (action === "category-save" && body.category) { const category = body.category; const retiredCategory = await isRetiredShortsCategoryId(service, category.id); const requestedSlug = slugify(category.name); const slug = retiredCategory ? "shorts" : requestedSlug === "shorts" || requestedSlug === "short" ? `shorts-custom-${Date.now()}` : requestedSlug; response = await fetch(`${service.url}/rest/v1/merch_categories?id=eq.${category.id}`, { method: "PATCH", headers, body: JSON.stringify({ name: category.name.slice(0, 80), slug, icon: category.icon.slice(0, 8), image_url: category.imageUrl, sort_order: Math.max(1, category.sortOrder), is_active: retiredCategory ? false : category.active, is_hidden: retiredCategory ? true : category.hidden, updated_at: new Date().toISOString() }) }); }
  else if (action === "category-delete") { const countResponse = await fetch(`${service.url}/rest/v1/commerce_products?category_id=eq.${body.id}&is_active=eq.true&select=id`, { headers }); const rows = countResponse.ok ? await countResponse.json() as unknown[] : []; if (rows.length) return NextResponse.json({ error: "Reassign or archive active products before deleting this category." }, { status: 409 }); response = await fetch(`${service.url}/rest/v1/merch_categories?id=eq.${body.id}`, { method: "DELETE", headers }); }
  else if (action === "category-reorder") { const catalog = await getMerchCatalog(true); const index = catalog.categories.findIndex((item) => item.id === body.id); const target = body.direction === "up" ? index - 1 : index + 1; if (index < 0 || target < 0 || target >= catalog.categories.length) return NextResponse.json({ error: "Category cannot move further." }, { status: 400 }); const current = catalog.categories[index]; const other = catalog.categories[target]; const [first, second] = await Promise.all([fetch(`${service.url}/rest/v1/merch_categories?id=eq.${current.id}`, { method: "PATCH", headers, body: JSON.stringify({ sort_order: other.sortOrder }) }), fetch(`${service.url}/rest/v1/merch_categories?id=eq.${other.id}`, { method: "PATCH", headers, body: JSON.stringify({ sort_order: current.sortOrder }) })]); response = first.ok && second.ok ? first : second; }
  else if (action === "product-create") {
    const catalog = await getMerchCatalog(true);
    let entry: ReturnType<typeof productEntry>;
    try { entry = productEntry(body.productEntry || {}, catalog); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid merchandise entry." }, { status: 400 }); }
    const duplicateSkuResponse = await fetch(`${service.url}/rest/v1/commerce_products?sku=eq.${encodeURIComponent(entry.sku)}&select=id&limit=1`, { headers });
    const duplicateSkuRows = duplicateSkuResponse.ok ? await duplicateSkuResponse.json() as Array<{ id?: string }> : [];
    if (duplicateSkuRows.length) return NextResponse.json({ error: "SKU MUST BE UNIQUE." }, { status: 409 });
    const nextSlot = Math.max(0, ...catalog.products.map((item) => item.slotNumber)) + 1;
    response = await fetch(`${service.url}/rest/v1/commerce_products`, { method: "POST", headers: serviceHeaders(service, "return=minimal"), body: JSON.stringify({ ...entry, slot_number: nextSlot, product_type: "physical", sort_order: nextSlot, updated_by: admin.id }) });
  }
  else if (action === "product-duplicate" && body.id) {
    const source = await fetch(`${service.url}/rest/v1/commerce_products?id=eq.${encodeURIComponent(body.id)}&select=*`, { headers });
    const rows = source.ok ? await source.json() as Array<Record<string, unknown>> : [];
    const product = rows[0];
    if (!product) return NextResponse.json({ error: "Product could not be found." }, { status: 404 });
    delete product.id;
    product.title = `${String(product.title || "Merchandise").slice(0, 120)} Copy`;
    product.sku = `${String(product.sku || "MERCH").slice(0, 88)}-COPY`;
    product.is_active = false; product.is_published = false; product.sort_order = Number(product.sort_order || 0) + 1;
    response = await fetch(`${service.url}/rest/v1/commerce_products`, { method: "POST", headers: serviceHeaders(service, "return=minimal"), body: JSON.stringify(product) });
  }
  else if (action === "product-archive" && body.id) response = await fetch(`${service.url}/rest/v1/commerce_products?id=eq.${encodeURIComponent(body.id)}`, { method: "PATCH", headers, body: JSON.stringify({ is_active: false, is_published: false, updated_at: new Date().toISOString() }) });
  else if (action === "product-save" && body.product) { const product = body.product; const retiredCategory = await isRetiredShortsCategoryId(service, product.categoryId); response = await fetch(`${service.url}/rest/v1/commerce_products?id=eq.${product.id}`, { method: "PATCH", headers, body: JSON.stringify({ title: cleanText(product.name, 140), short_description: cleanText(product.shortDescription, 1000), full_description: cleanText(product.fullDescription, 2000), category_id: product.categoryId, coin_price: Math.max(1, Math.floor(product.coinPrice)), price_minor: product.priceMinor, shipping_cost_minor: Math.max(0, Math.floor(product.shippingCostMinor || 0)), shipping_mode: product.shippingMode, fulfillment_type: retiredCategory ? "manual" : product.fulfillmentType, sku: cleanText(product.sku, 100), image_url: safeImageUrl(product.imageUrl), secondary_image_url: safeImageUrl(product.secondaryImageUrl), additional_images: safeImageList(product.additionalImageUrls), inventory_quantity: Math.max(0, Math.floor(product.inventoryQuantity)), requires_size: product.requiresSize, international_shipping_allowed: product.internationalShippingAllowed, quantity_limit: Math.max(1, Math.floor(product.quantityLimit)), low_stock_threshold: Math.max(0, Math.floor(product.lowStockThreshold)), is_active: retiredCategory ? false : product.active, is_published: retiredCategory ? false : product.published, is_featured: retiredCategory ? false : product.featured, fulfillment_enabled: retiredCategory ? false : product.fulfillmentEnabled, updated_by: admin.id, updated_at: new Date().toISOString() }) }); }
  else if (action === "inventory-adjust") { const delta = Math.max(-10000, Math.min(10000, Math.floor(Number(body.delta || 0)))); response = await fetch(`${service.url}/rest/v1/rpc/adjust_commerce_inventory`, { method: "POST", headers, body: JSON.stringify({ p_product_id: body.id, p_variant_id: null, p_delta: delta, p_reason: String(body.reason || "Admin adjustment").slice(0, 250), p_admin_id: admin.id }) }); }
  else if (action === "fulfillment-save" && body.product) {
    const product = body.product;
    if (await isRetiredShortsCategoryId(service, product.categoryId)) return NextResponse.json({ error: "Printify fulfillment is disabled for the retired Shorts category." }, { status: 409 });
    if (product.fulfillmentEnabled && !product.printifyProductId?.trim()) return NextResponse.json({ error: "A Printify product ID is required before fulfillment can be enabled." }, { status: 400 });
    const enabledMappings = product.variants.filter((variant) => variant.fulfillmentAvailable);
    if (product.fulfillmentEnabled && !enabledMappings.length) return NextResponse.json({ error: "Enable at least one mapped Printify variant before enabling fulfillment." }, { status: 400 });
    if (enabledMappings.some((variant) => !variant.printifyVariantId)) return NextResponse.json({ error: "Every available Printify variation requires a Printify variant ID." }, { status: 400 });
    response = await fetch(`${service.url}/rest/v1/commerce_products?id=eq.${product.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        printify_product_id: product.printifyProductId?.trim() || null,
        printify_blueprint_id: product.printifyBlueprintId,
        printify_provider_id: product.printifyProviderId,
        fulfillment_enabled: product.fulfillmentEnabled,
        updated_at: new Date().toISOString()
      })
    });
    if (response.ok && product.variants.length) {
      const mappings = product.variants.map((variant) => ({
        id: variant.id,
        product_id: product.id,
        fit: variant.fit?.trim().slice(0, 80) || null,
        printify_variant_id: variant.printifyVariantId,
        provider_sku: variant.providerSku?.trim().slice(0, 120) || null,
        fulfillment_available: variant.fulfillmentAvailable,
        production_cost_minor: variant.productionCostMinor,
        updated_at: new Date().toISOString()
      }));
      const upsert = await fetch(`${service.url}/rest/v1/product_variants?on_conflict=id`, { method: "POST", headers: serviceHeaders(service, "resolution=merge-duplicates,return=minimal"), body: JSON.stringify(mappings) });
      if (!upsert.ok) return NextResponse.json({ error: "The product mapping was saved, but variant mappings were rejected." }, { status: 422 });
    }
    if (response.ok) {
      const catalog = await getMerchCatalog(true);
      const selectedIds = catalog.languages.filter((language) => product.languageCodes.includes(language.code)).map((language) => language.id);
      const cleared = await fetch(`${service.url}/rest/v1/product_merch_languages?product_id=eq.${product.id}`, { method: "DELETE", headers });
      if (!cleared.ok) return NextResponse.json({ error: "The mapping was saved, but language assignments could not be reset." }, { status: 422 });
      if (selectedIds.length) {
        const inserted = await fetch(`${service.url}/rest/v1/product_merch_languages`, { method: "POST", headers, body: JSON.stringify(selectedIds.map((languageId) => ({ product_id: product.id, language_id: languageId }))) });
        if (!inserted.ok) return NextResponse.json({ error: "The mapping was saved, but language assignments could not be published." }, { status: 422 });
      }
    }
  }
  else return NextResponse.json({ error: "Unsupported merchandise action." }, { status: 400 });
  if (!response?.ok) return NextResponse.json({ error: "The database rejected this merchandise change." }, { status: 422 });
  if (action === "product-save" && body.product) {
    const product = body.product;
    const variants = product.variants.slice(0, 100).map((variant) => ({ id: variant.id, product_id: product.id, sku: variant.sku.trim().slice(0, 100), size: variant.size?.trim().slice(0, 40) || null, color: variant.color?.trim().slice(0, 60) || null, style: variant.style?.trim().slice(0, 80) || null, material: variant.material?.trim().slice(0, 80) || null, pack_quantity: variant.packQuantity ? Math.max(1, Math.floor(variant.packQuantity)) : null, inventory_quantity: Math.max(0, Math.floor(variant.inventoryQuantity)), coin_price_override: variant.coinPrice ? Math.max(1, Math.floor(variant.coinPrice)) : null, image_url: variant.imageUrl || null, is_active: variant.active, updated_at: new Date().toISOString() }));
    if (variants.some((variant) => !variant.sku)) return NextResponse.json({ error: "Every variation requires a SKU." }, { status: 400 });
    if (variants.length) {
      const upsert = await fetch(`${service.url}/rest/v1/product_variants?on_conflict=id`, { method: "POST", headers: serviceHeaders(service, "resolution=merge-duplicates,return=minimal"), body: JSON.stringify(variants) });
      if (!upsert.ok) return NextResponse.json({ error: "The product was saved, but its variations were rejected." }, { status: 422 });
    }
    const keepFilter = variants.length ? `&id=not.in.(${variants.map((variant) => variant.id).join(",")})` : "";
    const removed = await fetch(`${service.url}/rest/v1/product_variants?product_id=eq.${product.id}${keepFilter}`, { method: "DELETE", headers });
    if (!removed.ok) return NextResponse.json({ error: "The product was saved, but removed variations could not be synchronized." }, { status: 422 });
  }
  await auditAdminEvent({ adminUserId: admin.id, eventType: `admin_merch_${action}`, ipAddress: extractClientIp(request.headers), userAgent: request.headers.get("user-agent") || "unknown", metadata: { targetId: body.id || body.category?.id || body.product?.id || null } });
  revalidateTag("public:merch");
  const catalog = await getMerchCatalog(true); return NextResponse.json({ ok: true, categories: catalog.categories, products: catalog.products, languages: catalog.languages });
}
