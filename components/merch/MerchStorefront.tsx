"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import FavoriteButton from "@/components/account/FavoriteButton";
import RecentViewTracker from "@/components/account/RecentViewTracker";
import RestockRequest from "@/components/merch/RestockRequest";
import MerchCategoryEmblem from "@/components/merch/MerchCategoryEmblem";
import PurchaseModals from "@/components/purchase/PurchaseModals";
import PurchaseProvider, { usePurchase } from "@/components/purchase/PurchaseProvider";
import PaginationControls from "@/components/catalog/PaginationControls";
import StoreHeader from "@/components/store/StoreHeader";
import { useI18n } from "@/components/I18nProvider";
import { merchPurchaseProduct, type MerchCategory, type MerchLanguage, type MerchProduct } from "@/lib/commerce/types";
import { formatLanguageLabel } from "@/lib/i18n";
import type { PurchaseProduct, PurchaseServerState } from "@/lib/purchase/types";

type Selection = { variantId: string; quantity: number };
type MerchFilters = {
  colors: string[];
  sizes: string[];
  styles: string[];
  fits: string[];
  materials: string[];
  languages: string[];
  inStock: boolean;
  international: boolean;
};
const emptyFilters: MerchFilters = { colors: [], sizes: [], styles: [], fits: [], materials: [], languages: [], inStock: false, international: false };
type MultiFilterKey = "colors" | "sizes" | "styles" | "fits" | "materials" | "languages";
const filterParams: Array<[MultiFilterKey, string]> = [["colors", "color"], ["sizes", "size"], ["styles", "style"], ["fits", "fit"], ["materials", "material"], ["languages", "language"]];
function categoryLabel(category: MerchCategory) { const labels: Record<string, string> = { clothes: "Shirts", shirt: "Shirts", hats: "Hats", mugs: "Mugs", hoodies: "Hoodies", shoes: "Shoes", stickers: "Etc." }; return labels[category.slug.toLowerCase()] || category.name; }

function MerchContent({ categories, languages }: { categories: MerchCategory[]; languages: MerchLanguage[] }) {
  const { t } = useI18n();
  const { products, cartItems, summary, busy, status, openCart, addProduct } = usePurchase();
  const [categoryId, setCategoryId] = useState(categories[0]?.id || "");
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [detailId, setDetailId] = useState<string | null>(null);
  const [filters, setFilters] = useState<MerchFilters>(emptyFilters);
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [sort, setSort] = useState("featured");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filtersReady, setFiltersReady] = useState(false);
  const options = useMemo(() => {
    const variantValues = (key: "color" | "size" | "style" | "fit" | "material") => Array.from(new Set(products.flatMap((product) => product.variants?.flatMap((variant) => variant[key] ? [variant[key] as string] : []) || []))).sort((a, b) => a.localeCompare(b));
    return { colors: variantValues("color"), sizes: variantValues("size"), styles: variantValues("style"), fits: variantValues("fit"), materials: variantValues("material") };
  }, [products]);
  const visible = useMemo(() => {
    const minimum = priceMin === "" ? null : Number(priceMin);
    const maximum = priceMax === "" ? null : Number(priceMax);
    const selectedVariantFilters = [
      ["color", filters.colors],
      ["size", filters.sizes],
      ["style", filters.styles],
      ["fit", filters.fits],
      ["material", filters.materials]
    ] as const;
    const filtered = products.filter((product) => {
      if (categoryId && product.categoryId !== categoryId) return false;
      if (minimum !== null && Number.isFinite(minimum) && product.coinPrice < minimum) return false;
      if (maximum !== null && Number.isFinite(maximum) && product.coinPrice > maximum) return false;
      if (filters.languages.length && !filters.languages.some((code) => product.languageCodes?.includes(code))) return false;
      if (filters.international && !product.internationalShippingAllowed) return false;
      if (filters.inStock && Number(product.inventoryQuantity || 0) < 1 && !product.variants?.some((variant) => variant.inventoryQuantity > 0)) return false;
      const hasVariantFilter = selectedVariantFilters.some(([, values]) => values.length);
      if (hasVariantFilter && !product.variants?.some((variant) => selectedVariantFilters.every(([key, values]) => !values.length || Boolean(variant[key]) && values.includes(String(variant[key]))))) return false;
      return true;
    });
    return filtered.sort((a, b) => sort === "price-asc" ? a.coinPrice - b.coinPrice : sort === "price-desc" ? b.coinPrice - a.coinPrice : sort === "name" ? a.name.localeCompare(b.name) : Number(Boolean(b.published)) - Number(Boolean(a.published)));
  }, [categoryId, filters, priceMax, priceMin, products, sort]);
  const detail = products.find((product) => product.id === detailId) || null;
  const pageItems = visible.slice((page - 1) * pageSize, page * pageSize);
  const accountProduct = (product: PurchaseProduct) => ({
    id: product.id,
    productType: "merch",
    title: product.name,
    imageUrl: product.thumbnailUrl,
    href: "/merch"
  });

  useEffect(() => {
    const remembered = window.localStorage.getItem("xmf-last-merch-category");
    if (remembered && categories.some((category) => category.id === remembered && category.active && !category.hidden)) setCategoryId(remembered);
  }, [categories]);

  useEffect(() => {
    if (categoryId) window.localStorage.setItem("xmf-last-merch-category", categoryId);
    setPage(1);
  }, [categoryId]);

  useEffect(() => { setPage((current) => Math.min(current, Math.max(1, Math.ceil(visible.length / pageSize)))); }, [pageSize, visible.length]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = { ...emptyFilters };
    for (const [key, param] of filterParams) next[key] = params.get(param)?.split(",").filter(Boolean) || [];
    next.inStock = params.get("stock") === "in";
    next.international = params.get("shipping") === "international";
    setFilters(next);
    setPriceMin(params.get("min") || "");
    setPriceMax(params.get("max") || "");
    setSort(params.get("sort") || "featured");
    setFiltersReady(true);
  }, []);

  useEffect(() => {
    if (!filtersReady) return;
    const url = new URL(window.location.href);
    for (const [key, param] of filterParams) filters[key].length ? url.searchParams.set(param, filters[key].join(",")) : url.searchParams.delete(param);
    priceMin ? url.searchParams.set("min", priceMin) : url.searchParams.delete("min");
    priceMax ? url.searchParams.set("max", priceMax) : url.searchParams.delete("max");
    sort !== "featured" ? url.searchParams.set("sort", sort) : url.searchParams.delete("sort");
    filters.inStock ? url.searchParams.set("stock", "in") : url.searchParams.delete("stock");
    filters.international ? url.searchParams.set("shipping", "international") : url.searchParams.delete("shipping");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [filters, filtersReady, priceMax, priceMin, sort]);

  function selection(productId: string) { return selections[productId] || { variantId: "", quantity: 1 }; }
  function patchSelection(productId: string, patch: Partial<Selection>) { setSelections((current) => ({ ...current, [productId]: { ...selection(productId), ...patch } })); }
  function toggleFilter(key: MultiFilterKey, value: string) { setFilters((current) => ({ ...current, [key]: current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value] })); }
  function clearFilters() { setFilters(emptyFilters); setPriceMin(""); setPriceMax(""); setSort("featured"); }
  function availableInventory(product: PurchaseProduct) { const selected = selection(product.id); return selected.variantId ? product.variants?.find((variant) => variant.id === selected.variantId)?.inventoryQuantity ?? 0 : product.inventoryQuantity ?? 0; }
  async function add(productId: string, button: HTMLButtonElement) {
    const product = products.find((item) => item.id === productId); if (!product) return;
    const selected = selection(productId); const variant = product.variants?.find((item) => item.id === selected.variantId);
    if (product.requiresSize && !variant) return;
    const options = variant ? [{ id: "size", name: t("merch.size"), value: variant.size || "—" }, ...(variant.color ? [{ id: "color", name: t("merch.color"), value: variant.color }] : [])] : [];
    await addProduct(productId, button, { variantId: variant?.id || null, quantity: selected.quantity, options });
  }
  return <main className="merch-page"><StoreHeader active="merch" cartCount={summary.itemCount} cartItems={cartItems} onCart={openCart} />
    <section className="merch-hero"><div><p className="kicker">{t("merch.kicker")}</p><h1>{t("merch.title")}</h1><p>{t("merch.intro")}</p><p className="merch-shopping-notes">{t("merch.shoppingNotes")}</p></div><aside><span>{t("audioStore.wallet")}</span><strong>{summary.balance === null ? "—" : t("audioStore.coins", { count: summary.balance })}</strong><small>{t("merch.coinOnly")}</small></aside></section>
    <div className="merch-layout"><div className="merch-sidebar"><nav className="merch-categories" aria-label={t("merch.categories")}>{categories.filter((category) => category.active && !category.hidden).map((category) => <button className={category.id === categoryId ? "is-active" : ""} type="button" onClick={() => setCategoryId(category.id)} key={category.id}><MerchCategoryEmblem category={category} />{categoryLabel(category)}</button>)}</nav>
      <aside className="merch-filter-panel" aria-label={t("merch.filters")}>
        <div className="merch-filter-heading"><strong>{t("merch.filters")}</strong><button type="button" onClick={clearFilters}>{t("merch.clearFilters")}</button></div>
        <details><summary>{t("merch.priceRange")}</summary><div className="merch-price-filter"><label>{t("merch.minimumCoins")}<input type="number" min="0" inputMode="numeric" value={priceMin} onChange={(event) => setPriceMin(event.target.value)} /></label><label>{t("merch.maximumCoins")}<input type="number" min="0" inputMode="numeric" value={priceMax} onChange={(event) => setPriceMax(event.target.value)} /></label></div></details>
        <details><summary>{t("merch.sortBy")}</summary><label className="merch-filter-select"><span className="sr-only">{t("merch.sortBy")}</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="featured">{t("merch.sortFeatured")}</option><option value="price-asc">{t("merch.sortPriceLow")}</option><option value="price-desc">{t("merch.sortPriceHigh")}</option><option value="name">{t("merch.sortName")}</option></select></label></details>
        {([["colors", t("merch.color"), options.colors], ["sizes", t("merch.size"), options.sizes], ["styles", t("merch.style"), options.styles], ["fits", t("merch.fit"), options.fits], ["materials", t("merch.material"), options.materials]] as const).map(([key, label, values]) => <details key={key}><summary>{label}</summary><div className="merch-filter-options">{values.length ? values.map((value) => <label key={value}><input type="checkbox" checked={filters[key].includes(value)} onChange={() => toggleFilter(key, value)} />{value}</label>) : <small>{t("merch.noFilterOptions")}</small>}</div></details>)}
        <details><summary>{t("merch.language")}</summary><div className="merch-filter-options">{languages.filter((language) => language.enabled && language.published).map((language) => <label key={language.id}><input type="checkbox" checked={filters.languages.includes(language.code)} onChange={() => toggleFilter("languages", language.code)} />{formatLanguageLabel(language.nativeLabel, language.label)}</label>)}</div></details>
        <details><summary>{t("merch.moreFilters")}</summary><div className="merch-filter-options"><label><input type="checkbox" checked={filters.inStock} onChange={(event) => setFilters((current) => ({ ...current, inStock: event.target.checked }))} />{t("merch.inStockOnly")}</label><label><input type="checkbox" checked={filters.international} onChange={(event) => setFilters((current) => ({ ...current, international: event.target.checked }))} />{t("merch.internationalOnly")}</label></div></details>
      </aside>
      </div><section className="merch-products" aria-label={t("merch.products")}>
      <p className="merch-status" role="status" aria-live="polite">{status}</p><PaginationControls page={page} pageSize={pageSize} totalItems={visible.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} /><div className="merch-grid">{pageItems.map((product, index) => { const selected = selection(product.id); const inventory = selected.variantId ? product.variants?.find((variant) => variant.id === selected.variantId)?.inventoryQuantity ?? 0 : product.requiresSize ? product.variants?.filter((variant) => variant.active).reduce((sum, variant) => sum + variant.inventoryQuantity, 0) ?? 0 : product.inventoryQuantity ?? 0; const soldOut = inventory < 1; const low = inventory > 0 && inventory <= Number(product.lowStockThreshold || 0); const stockLabel = soldOut ? (product.restockAt ? "Restocking soon" : t("merch.soldOut")) : low ? (product.showExactInventory ? t("merch.lowStock", { count: inventory }) : "Low stock") : t("merch.inStock"); return <article className="merch-card" key={product.id}><FavoriteButton product={accountProduct(product)} /><button className="merch-image" type="button" onClick={() => setDetailId(product.id)} aria-label={t("merch.viewDetails", { product: product.name })}><Image src={product.thumbnailUrl} alt={product.name} fill priority={index === 0} sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 33vw" /></button><div className="merch-card-meta"><span>{product.categoryName}</span><b className={soldOut ? "sold-out" : low ? "low-stock" : "in-stock"}>{stockLabel}</b></div><h2>{product.name}</h2><p>{product.description}</p><strong className="merch-price">{t("audioStore.coins", { count: product.coinPrice })}</strong>{product.requiresSize ? <label>{t("merch.size")}<select value={selected.variantId} onChange={(event) => patchSelection(product.id, { variantId: event.target.value })}><option value="">{t("merch.selectSize")}</option>{product.variants?.filter((variant) => variant.active && variant.inventoryQuantity > 0).map((variant) => <option value={variant.id} key={variant.id}>{variant.size}{variant.color ? ` · ${variant.color}` : ""}{product.showExactInventory ? ` · ${variant.inventoryQuantity} ${t("merch.available")}` : ""}</option>)}</select></label> : null}<label>{t("purchase.quantity")}<select value={selected.quantity} onChange={(event) => patchSelection(product.id, { quantity: Number(event.target.value) })}>{Array.from({ length: Math.max(1, Math.min(Number(product.maxQuantity || 1), inventory || 1)) }, (_, quantity) => <option value={quantity + 1} key={quantity + 1}>{quantity + 1}</option>)}</select></label>{soldOut && product.restockNotificationsEnabled ? <RestockRequest productId={product.id} variants={product.variants} /> : null}<div className="merch-card-actions"><button className="secondary" type="button" onClick={() => setDetailId(product.id)}>{t("merch.details")}</button><button className="primary" type="button" disabled={busy || soldOut || (product.requiresSize && !selected.variantId)} onClick={(event) => void add(product.id, event.currentTarget)}>{t("merch.addToCart")}</button></div></article>; })}</div>{!visible.length ? <p className="merch-empty-filter" role="status">{t("merch.noMatches")}</p> : null}</section></div>
    {detail ? <div className="merch-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setDetailId(null); }}><RecentViewTracker product={accountProduct(detail)} /><section className="merch-detail" role="dialog" aria-modal="true" aria-labelledby="merch-detail-title"><button className="purchase-modal-close" type="button" onClick={() => setDetailId(null)} aria-label={t("common.close")}>×</button><div className="merch-detail-image"><Image src={detail.thumbnailUrl} alt={detail.name} fill sizes="50vw" /></div><div><p className="kicker">{detail.categoryName}</p><h2 id="merch-detail-title">{detail.name}</h2><p>{detail.fullDescription}</p><strong>{t("audioStore.coins", { count: detail.coinPrice })}</strong><dl><div><dt>{t("merch.sku")}</dt><dd>{detail.sku}</dd></div><div><dt>{t("merch.shipping")}</dt><dd>{detail.internationalShippingAllowed ? t("merch.international") : t("merch.domesticOnly")}</dd></div></dl>{detail.requiresSize ? <label>{t("merch.size")}<select value={selection(detail.id).variantId} onChange={(event) => patchSelection(detail.id, { variantId: event.target.value })}><option value="">{t("merch.selectSize")}</option>{detail.variants?.filter((variant) => variant.active && variant.inventoryQuantity > 0).map((variant) => <option value={variant.id} key={variant.id}>{variant.size}{variant.color ? ` · ${variant.color}` : ""} · {variant.inventoryQuantity} {t("merch.available")}</option>)}</select></label> : null}<label>{t("purchase.quantity")}<select value={selection(detail.id).quantity} onChange={(event) => patchSelection(detail.id, { quantity: Number(event.target.value) })}>{Array.from({ length: Math.max(1, Math.min(Number(detail.maxQuantity || 1), availableInventory(detail) || 1)) }, (_, quantity) => <option value={quantity + 1} key={quantity + 1}>{quantity + 1}</option>)}</select></label><div className="merch-card-actions"><button className="secondary" type="button" onClick={() => setDetailId(null)}>{t("common.close")}</button><button className="primary" type="button" disabled={busy || (detail.requiresSize && !selection(detail.id).variantId)} onClick={(event) => void add(detail.id, event.currentTarget)}>{t("merch.addToCart")}</button></div></div></section></div> : null}
    <PurchaseModals />
  </main>;
}

export default function MerchStorefront({ categories, products, languages }: { categories: MerchCategory[]; products: MerchProduct[]; languages: MerchLanguage[] }) {
  const developmentPreviewState = useMemo<PurchaseServerState<MerchProduct>>(() => ({ products, authenticated: true, tokenBalance: 1200, cartProductIds: [], cartLines: [], purchases: [] }), [products]);
  return <PurchaseProvider endpoint="/api/merch" initialProducts={products} normalizeProduct={merchPurchaseProduct} developmentPreviewState={developmentPreviewState}><MerchContent categories={categories} languages={languages} /></PurchaseProvider>;
}
