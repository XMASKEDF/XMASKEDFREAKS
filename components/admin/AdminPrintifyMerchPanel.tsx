"use client";

import { useState } from "react";
import type { MerchLanguage, MerchProduct } from "@/lib/commerce/types";

export default function AdminPrintifyMerchPanel({ initialProducts, languages }: { initialProducts: MerchProduct[]; languages: MerchLanguage[] }) {
  const [products, setProducts] = useState(initialProducts);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState("Provider credentials remain server-only. Save mappings here after confirming them in Printify.");

  function patchProduct(id: string, patch: Partial<MerchProduct>) {
    setProducts((current) => current.map((product) => product.id === id ? { ...product, ...patch } : product));
  }

  function patchVariant(productId: string, variantId: string, patch: Partial<MerchProduct["variants"][number]>) {
    setProducts((current) => current.map((product) => product.id === productId ? {
      ...product,
      variants: product.variants.map((variant) => variant.id === variantId ? { ...variant, ...patch } : variant)
    } : product));
  }

  async function save(product: MerchProduct) {
    setBusyId(product.id);
    const response = await fetch("/api/admin/merch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "fulfillment-save", product })
    });
    const result = await response.json().catch(() => ({})) as { error?: string; products?: MerchProduct[] };
    if (response.ok && result.products) {
      setProducts(result.products);
      setStatus("Fulfillment mapping, language assignments, and availability were saved and audit logged.");
    } else {
      setStatus(result.error || "The fulfillment mapping could not be saved.");
    }
    setBusyId(null);
  }

  return <section className="admin-commerce-panel admin-printify-panel">
    <header><div><p className="kicker">ADMIN · PRINTIFY</p><h2>Coins-Only Fulfillment</h2><p>Map products and variants without exposing provider credentials. A product cannot enter live physical checkout until both product and variant availability are enabled.</p></div></header>
    <p className="admin-inline-status" role="status">{status}</p>
    <div className="admin-printify-grid">{products.map((product) => {
      const retiredCategory = product.categoryName === "Archived category";
      const productionCosts = product.variants.flatMap((variant) => variant.productionCostMinor === null ? [] : [variant.productionCostMinor]);
      const highestCost = productionCosts.length ? Math.max(...productionCosts) : null;
      const priceCents = product.coinPrice * 50;
      return <article key={product.id}>
        <header><strong>{product.name}</strong><span>{retiredCategory ? "RETIRED CATEGORY" : product.fulfillmentEnabled ? "ENABLED" : "BLOCKED"}</span></header>
        <div className="admin-field-row">
          <label>Printify product ID<input disabled={retiredCategory} value={product.printifyProductId || ""} onChange={(event) => patchProduct(product.id, { printifyProductId: event.target.value || null })} /></label>
          <label>Blueprint ID<input disabled={retiredCategory} type="number" min={0} value={product.printifyBlueprintId || 0} onChange={(event) => patchProduct(product.id, { printifyBlueprintId: Number(event.target.value) || null })} /></label>
          <label>Provider ID<input disabled={retiredCategory} type="number" min={0} value={product.printifyProviderId || 0} onChange={(event) => patchProduct(product.id, { printifyProviderId: Number(event.target.value) || null })} /></label>
        </div>
        <fieldset><legend>Published language filters</legend>{languages.filter((language) => language.enabled).map((language) => <label className="check-row" key={language.id}><input type="checkbox" checked={product.languageCodes.includes(language.code)} onChange={(event) => patchProduct(product.id, { languageCodes: event.target.checked ? [...product.languageCodes, language.code] : product.languageCodes.filter((code) => code !== language.code) })} />{language.nativeLabel} ({language.code})</label>)}</fieldset>
        {retiredCategory ? <p className="admin-warning">This product belongs to the retired Shorts category. Printify fulfillment is disabled; historical orders and provider references remain preserved.</p> : <label className="check-row"><input type="checkbox" checked={product.fulfillmentEnabled} onChange={(event) => patchProduct(product.id, { fulfillmentEnabled: event.target.checked })} />Enable Printify fulfillment for checkout</label>}
        <div className="admin-margin-preview"><strong>Price equivalent: ${(priceCents / 100).toFixed(2)}</strong><span>{highestCost === null ? "Production cost not synchronized" : `Highest mapped production cost: $${(highestCost / 100).toFixed(2)}`}</span><small>{highestCost === null ? "Margin is UNVERIFIED." : `Pre-shipping margin: $${((priceCents - highestCost) / 100).toFixed(2)}. Shipping and tax are quoted separately to the customer.`}</small></div>
        <details><summary>Variant fulfillment mappings ({product.variants.length})</summary><div className="admin-variant-list">{product.variants.map((variant) => <article key={variant.id}>
          <div className="admin-field-row">
            <label>Size<input value={variant.size || ""} onChange={(event) => patchVariant(product.id, variant.id, { size: event.target.value || null })} /></label>
            <label>Color<input value={variant.color || ""} onChange={(event) => patchVariant(product.id, variant.id, { color: event.target.value || null })} /></label>
            <label>Style<input value={variant.style || ""} onChange={(event) => patchVariant(product.id, variant.id, { style: event.target.value || null })} /></label>
            <label>Fit<input value={variant.fit || ""} onChange={(event) => patchVariant(product.id, variant.id, { fit: event.target.value || null })} /></label>
            <label>Material<input value={variant.material || ""} onChange={(event) => patchVariant(product.id, variant.id, { material: event.target.value || null })} /></label>
          </div>
          <div className="admin-field-row">
            <label>Printify variant ID<input type="number" min={0} value={variant.printifyVariantId || 0} onChange={(event) => patchVariant(product.id, variant.id, { printifyVariantId: Number(event.target.value) || null })} /></label>
            <label>Provider SKU<input value={variant.providerSku || ""} onChange={(event) => patchVariant(product.id, variant.id, { providerSku: event.target.value || null })} /></label>
            <label>Production cost, cents<input type="number" min={0} value={variant.productionCostMinor || 0} onChange={(event) => patchVariant(product.id, variant.id, { productionCostMinor: Number(event.target.value) || null })} /></label>
          </div>
          <label className="check-row"><input type="checkbox" checked={variant.fulfillmentAvailable} onChange={(event) => patchVariant(product.id, variant.id, { fulfillmentAvailable: event.target.checked })} />Available for Printify checkout</label>
        </article>)}</div></details>
        <button className="primary" type="button" disabled={retiredCategory || busyId === product.id} onClick={() => void save(product)}>{busyId === product.id ? "Saving…" : "Save fulfillment mapping"}</button>
      </article>;
    })}</div>
  </section>;
}
