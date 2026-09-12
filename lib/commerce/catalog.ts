import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import type { CatalogEntry, CatalogSettings, MerchCategory, MerchLanguage, MerchProduct } from "@/lib/commerce/types";

const customMerchCategoryImages: Record<string, string> = {
  clothes: "/images/merch/categories/shirt.png",
  shirt: "/images/merch/categories/shirt.png",
  shirts: "/images/merch/categories/shirt.png",
  hat: "/images/merch/categories/hat.png",
  hats: "/images/merch/categories/hat.png",
  hoodie: "/images/merch/categories/hoodie.png",
  hoodies: "/images/merch/categories/hoodie.png",
  mug: "/images/merch/categories/mug.png",
  mugs: "/images/merch/categories/mug.png"
};

const legacyMerchCategoryImages: Record<string, string> = {
  clothes: "/images/merch/categories/shirt.jpg",
  shirt: "/images/merch/categories/shirt.jpg",
  shirts: "/images/merch/categories/shirt.jpg",
  hat: "/images/merch/categories/hat.jpg",
  hats: "/images/merch/categories/hat.jpg",
  hoodie: "/images/merch/categories/hoodie.jpg",
  hoodies: "/images/merch/categories/hoodie.jpg",
  shoe: "/images/merch/categories/shoe.jpg",
  shoes: "/images/merch/categories/shoe.jpg",
  mug: "/images/merch/categories/mug.jpg",
  mugs: "/images/merch/categories/mug.jpg"
};

export function merchCategoryCustomImage(slug: string) {
  return customMerchCategoryImages[normalizeMerchCategorySlug(slug)] || null;
}

export function normalizeMerchCategorySlug(slug: string) {
  const normalized = slug.toLowerCase().trim();
  if (normalized === "shirt" || normalized === "shirts") return "clothes";
  if (normalized === "hoodie") return "hoodies";
  if (normalized === "hat") return "hats";
  if (normalized === "mug") return "mugs";
  return normalized;
}

export function merchCategoryImage(slug: string) {
  const normalized = normalizeMerchCategorySlug(slug);
  return merchCategoryCustomImage(normalized) || legacyMerchCategoryImages[normalized] || null;
}

export function merchCategoryFallbackImage(slug: string) {
  return legacyMerchCategoryImages[normalizeMerchCategorySlug(slug)] || null;
}

export function isRetiredShortsCategory(category: Pick<MerchCategory, "slug"> | { slug?: unknown }) {
  const slug = String(category.slug || "").toLowerCase().trim();
  return slug === "shorts" || slug === "short";
}

export const fallbackCategories: MerchCategory[] = [
  { id: "cat-clothes", name: "Shirts", slug: "clothes", icon: "◫", imageUrl: merchCategoryImage("clothes"), sortOrder: 1, active: true, hidden: false },
  { id: "cat-hoodies", name: "Hoodies", slug: "hoodies", icon: "◫", imageUrl: merchCategoryImage("hoodies"), sortOrder: 2, active: true, hidden: false },
  { id: "cat-hats", name: "Hats", slug: "hats", icon: "◫", imageUrl: merchCategoryImage("hats"), sortOrder: 3, active: true, hidden: false },
  { id: "cat-mugs", name: "Mugs", slug: "mugs", icon: "◉", imageUrl: merchCategoryImage("mugs"), sortOrder: 4, active: true, hidden: false },
  { id: "cat-stickers", name: "Stickers", slug: "stickers", icon: "◇", imageUrl: null, sortOrder: 5, active: true, hidden: false }
];
export const fallbackMerchLanguages: MerchLanguage[] = [];

const sizes = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
const productSeed: Array<[string, string, string, number, string, number]> = [
  ["clothes", "Masked Signature Tee", "Heavyweight black tee with the official mask mark.", 180, "TEE-BLK", 24],
  ["hoodies", "After Dark Hoodie", "Soft heavyweight hoodie built for late sessions.", 360, "HD-BLK", 18],
  ["mugs", "Midnight Studio Mug", "Matte black ceramic mug with a clean green detail.", 120, "MUG-BLK", 30],
  ["mugs", "Creator Heat Mug", "Gloss black mug made for the control room.", 140, "MUG-HT", 16],
  ["stickers", "Mask Mark Pack", "Weather-resistant mask and wordmark sticker set.", 45, "STK-MASK", 60],
  ["stickers", "Neon Signal Pack", "Six premium vinyl accents for laptops and cases.", 55, "STK-NEON", 42]
];

export const fallbackMerchProducts: MerchProduct[] = productSeed.map(([category, name, description, price, sku, inventory], index) => {
  const categoryRecord = fallbackCategories.find((item) => item.slug === category)!;
  const requiresSize = category === "clothes" || category === "hoodies";
  return {
    id: `merch-slot-${index + 1}`,
    slotNumber: index + 1,
    name,
    shortDescription: description,
    fullDescription: `${description} Produced as an original XMASKEDFREAKS physical item. Final materials, care instructions, and shipping details are confirmed before fulfillment.`,
    categoryId: categoryRecord.id,
    categoryName: categoryRecord.name,
    coinPrice: price,
    priceMinor: price * 50,
    shippingCostMinor: 0,
    shippingMode: "manual",
    fulfillmentType: "manual",
    sku,
    imageUrl: "/branding/optimized/mask-logo-512.png",
    secondaryImageUrl: null,
    additionalImageUrls: [],
    inventoryQuantity: inventory,
    inventoryTracked: true,
    requiresSize,
    requiresShipping: true,
    internationalShippingAllowed: index !== 1,
    quantityLimit: category === "stickers" ? 6 : 3,
    lowStockThreshold: 5,
    restockAt: null,
    restockNotificationsEnabled: true,
    showExactInventory: false,
    printifyProductId: null,
    printifyBlueprintId: null,
    printifyProviderId: null,
    fulfillmentEnabled: false,
    printifyLastSyncedAt: null,
    languageCodes: [],
    weightGrams: category === "clothes" || category === "hoodies" ? 420 : category === "mugs" ? 480 : 40,
    dimensions: { length: 30, width: 22, height: category === "mugs" ? 14 : 6, unit: "cm" },
    active: true,
    published: true,
    featured: index === 1,
    sortOrder: index + 1,
    variants: requiresSize ? sizes.map((size, variantIndex) => ({
      id: `merch-slot-${index + 1}-${size.toLowerCase()}`,
      sku: `${sku}-${size}`,
      size,
      color: "Black",
      style: null,
      fit: "Standard",
      material: "Cotton blend",
      packQuantity: null,
      inventoryQuantity: Math.max(1, Math.floor(inventory / sizes.length) + (variantIndex < inventory % sizes.length ? 1 : 0)),
      coinPrice: null,
      imageUrl: null,
      active: true,
      printifyVariantId: null,
      providerSku: null,
      fulfillmentAvailable: false,
      productionCostMinor: null,
      printifyLastSyncedAt: null
    })) : []
  };
});

export const fallbackCatalogEntries: CatalogEntry[] = [
  { id: "catalog-merch", title: "First MERCH collection", description: "Clothes, mugs, and sticker packs are being prepared for release.", category: "Merch", imageUrl: "/branding/optimized/mask-logo-512.png", displayDate: "Coming soon", destinationUrl: "/merch", actionLabel: "Browse MERCH", status: "published", pinned: true, sortOrder: 1, publishAt: null, expiresAt: null },
  { id: "catalog-audio", title: "Original Audio Clips", description: "Private downloadable audio releases are available in the Audio Clips store.", category: "Audio", imageUrl: "/assets/preview-02.svg", displayDate: "Available now", destinationUrl: "/audio-clips", actionLabel: "Open Audio Clips", status: "published", pinned: false, sortOrder: 2, publishAt: null, expiresAt: null },
  { id: "catalog-painting", title: "Painting auctions", description: "Original works and auction details will appear as they are published.", category: "Painting", imageUrl: "/assets/preview-04.svg", displayDate: "Coming soon", destinationUrl: "/paintings", actionLabel: "View Paintings", status: "published", pinned: false, sortOrder: 3, publishAt: null, expiresAt: null }
];
export const fallbackCatalogSettings: CatalogSettings = { speedSeconds: 36, paused: false };

function rowProduct(row: Record<string, unknown>, categories: MerchCategory[]): MerchProduct {
  const category = categories.find((item) => item.id === row.category_id);
  const variants = Array.isArray(row.product_variants) ? row.product_variants as Record<string, unknown>[] : [];
  const languageRows = Array.isArray(row.product_merch_languages) ? row.product_merch_languages as Array<{ merch_languages?: { code?: string } | null }> : [];
  return {
    id: String(row.id),
    slotNumber: Number(row.slot_number),
    name: String(row.title || ""),
    shortDescription: String(row.short_description || ""),
    fullDescription: String(row.full_description || ""),
    categoryId: String(row.category_id || ""),
    categoryName: category?.name || "Archived category",
    coinPrice: Number(row.coin_price || 0),
    priceMinor: row.price_minor === null || row.price_minor === undefined ? Number(row.coin_price || 0) * 50 : Number(row.price_minor),
    shippingCostMinor: Math.max(0, Number(row.shipping_cost_minor || 0)),
    shippingMode: ["manual", "provider", "free"].includes(String(row.shipping_mode)) ? String(row.shipping_mode) as MerchProduct["shippingMode"] : "manual",
    fulfillmentType: String(row.fulfillment_type || (row.fulfillment_enabled ? "printify" : "manual")) === "printify" ? "printify" : "manual",
    sku: String(row.sku || ""),
    imageUrl: String(row.image_url || "/branding/optimized/mask-logo-512.png"),
    secondaryImageUrl: row.secondary_image_url ? String(row.secondary_image_url) : null,
    additionalImageUrls: Array.isArray(row.additional_images) ? row.additional_images.map(String).filter(Boolean).slice(0, 12) : [],
    inventoryQuantity: Number(row.inventory_quantity || 0),
    inventoryTracked: row.inventory_tracking_enabled !== false,
    requiresSize: Boolean(row.requires_size),
    requiresShipping: true,
    internationalShippingAllowed: Boolean(row.international_shipping_allowed),
    quantityLimit: Number(row.quantity_limit || 1),
    lowStockThreshold: Number(row.low_stock_threshold || 0),
    restockAt: row.restock_at ? String(row.restock_at) : null,
    restockNotificationsEnabled: Boolean(row.restock_notifications_enabled),
    showExactInventory: Boolean(row.show_exact_inventory),
    printifyProductId: row.printify_product_id ? String(row.printify_product_id) : null,
    printifyBlueprintId: row.printify_blueprint_id === null ? null : Number(row.printify_blueprint_id),
    printifyProviderId: row.printify_provider_id === null ? null : Number(row.printify_provider_id),
    fulfillmentEnabled: Boolean(row.fulfillment_enabled),
    printifyLastSyncedAt: row.printify_last_synced_at ? String(row.printify_last_synced_at) : null,
    languageCodes: languageRows.flatMap((item) => item.merch_languages?.code ? [String(item.merch_languages.code)] : []),
    weightGrams: row.weight_grams === null ? null : Number(row.weight_grams),
    dimensions: row.dimensions && typeof row.dimensions === "object" ? row.dimensions as MerchProduct["dimensions"] : null,
    active: Boolean(row.is_active),
    published: Boolean(row.is_published),
    featured: Boolean(row.is_featured),
    sortOrder: Number(row.sort_order || row.slot_number || 0),
    variants: variants.map((variant) => ({
      id: String(variant.id),
      sku: String(variant.sku || ""),
      size: variant.size ? String(variant.size) : null,
      color: variant.color ? String(variant.color) : null,
      style: variant.style ? String(variant.style) : null,
      fit: variant.fit ? String(variant.fit) : null,
      material: variant.material ? String(variant.material) : null,
      packQuantity: variant.pack_quantity === null ? null : Number(variant.pack_quantity),
      inventoryQuantity: Number(variant.inventory_quantity || 0),
      coinPrice: variant.coin_price_override === null ? null : Number(variant.coin_price_override),
      imageUrl: variant.image_url ? String(variant.image_url) : null,
      active: Boolean(variant.is_active),
      printifyVariantId: variant.printify_variant_id === null ? null : Number(variant.printify_variant_id),
      providerSku: variant.provider_sku ? String(variant.provider_sku) : null,
      fulfillmentAvailable: Boolean(variant.fulfillment_available),
      productionCostMinor: variant.production_cost_minor === null ? null : Number(variant.production_cost_minor),
      printifyLastSyncedAt: variant.printify_last_synced_at ? String(variant.printify_last_synced_at) : null
    }))
  };
}

export async function getMerchCatalog(includeUnpublished = false) {
  const service = serviceCredentials();
  if (!service) return { configured: false, categories: fallbackCategories, products: fallbackMerchProducts, languages: fallbackMerchLanguages };
  const headers = serviceHeaders(service);
  const categoryFilter = includeUnpublished ? "" : "&is_active=eq.true&is_hidden=eq.false";
  const productFilter = includeUnpublished ? "" : "&is_active=eq.true&is_published=eq.true";
  const publicCache = includeUnpublished ? { cache: "no-store" as const } : { next: { revalidate: 15, tags: ["public:merch"] } };
  const [categoryResponse, productResponse, languageResponse] = await Promise.all([
    fetch(`${service.url}/rest/v1/merch_categories?select=*&order=sort_order.asc${categoryFilter}`, { ...publicCache, headers }),
    fetch(`${service.url}/rest/v1/commerce_products?product_type=eq.physical&select=*,product_variants(*),product_merch_languages(merch_languages(code))&order=sort_order.asc${productFilter}`, { ...publicCache, headers }),
    fetch(`${service.url}/rest/v1/merch_languages?select=*&order=sort_order.asc`, { ...publicCache, headers })
  ]).catch(() => [null, null, null] as const);
  if (!categoryResponse?.ok || !productResponse?.ok) return { configured: false, categories: fallbackCategories, products: fallbackMerchProducts, languages: fallbackMerchLanguages };
  const categoryRows = await categoryResponse.json() as Record<string, unknown>[];
  const retiredCategoryIds = new Set(categoryRows.filter((row) => isRetiredShortsCategory({ slug: row.slug })).map((row) => String(row.id)));
  const categories = categoryRows.filter((row) => !isRetiredShortsCategory({ slug: row.slug })).map((row) => { const slug = String(row.slug); return { id: String(row.id), name: String(row.name), slug, icon: String(row.icon || "◇"), imageUrl: row.image_url ? String(row.image_url) : merchCategoryImage(slug), sortOrder: Number(row.sort_order || 0), active: Boolean(row.is_active), hidden: Boolean(row.is_hidden) }; });
  const productRows = await productResponse.json() as Record<string, unknown>[];
  const products = productRows.filter((row) => includeUnpublished || !retiredCategoryIds.has(String(row.category_id))).map((row) => rowProduct(row, categories));
  const languageRows = languageResponse?.ok ? await languageResponse.json() as Record<string, unknown>[] : [];
  const languages = languageRows.map((row) => ({
    id: String(row.id),
    code: String(row.code),
    label: String(row.label),
    nativeLabel: String(row.native_label),
    sortOrder: Number(row.sort_order || 0),
    enabled: Boolean(row.is_enabled),
    published: Boolean(row.is_published)
  }));
  return { configured: true, categories, products: products.length ? products : fallbackMerchProducts, languages };
}

export async function getVerticalCatalog(includeAll = false) {
  const service = serviceCredentials();
  if (!service) return { configured: false, entries: fallbackCatalogEntries, settings: fallbackCatalogSettings };
  const now = new Date().toISOString();
  const filter = includeAll ? "" : `&status=eq.published&or=(publish_at.is.null,publish_at.lte.${now})&or=(expires_at.is.null,expires_at.gt.${now})`;
  const headers = serviceHeaders(service);
  const publicCache = includeAll ? { cache: "no-store" as const } : { next: { revalidate: 60, tags: ["public:upcoming"] } };
  const [response, settingsResponse] = await Promise.all([
    fetch(`${service.url}/rest/v1/vertical_catalog_entries?select=*&order=pinned.desc,sort_order.asc${filter}`, { ...publicCache, headers }),
    fetch(`${service.url}/rest/v1/vertical_catalog_settings?id=eq.primary&select=*`, { ...publicCache, headers })
  ]).catch(() => [null, null] as const);
  if (!response?.ok) return { configured: false, entries: fallbackCatalogEntries, settings: fallbackCatalogSettings };
  const rows = await response.json() as Record<string, unknown>[];
  const settingsRows = settingsResponse?.ok ? await settingsResponse.json() as Record<string, unknown>[] : [];
  const setting = settingsRows[0];
  const settings = setting ? { speedSeconds: Math.max(12, Math.min(90, Number(setting.speed_seconds || 36))), paused: Boolean(setting.paused) } : fallbackCatalogSettings;
  return { configured: true, entries: rows.map((row) => ({ id: String(row.id), title: String(row.title), description: String(row.description || ""), category: String(row.category) as CatalogEntry["category"], imageUrl: String(row.image_url || "/branding/optimized/mask-logo-512.png"), displayDate: String(row.display_date || ""), destinationUrl: row.destination_url ? String(row.destination_url) : null, actionLabel: row.action_label ? String(row.action_label) : null, status: String(row.status) as CatalogEntry["status"], pinned: Boolean(row.pinned), sortOrder: Number(row.sort_order || 0), publishAt: row.publish_at ? String(row.publish_at) : null, expiresAt: row.expires_at ? String(row.expires_at) : null })), settings };
}
