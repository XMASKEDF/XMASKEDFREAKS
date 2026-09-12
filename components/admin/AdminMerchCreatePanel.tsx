"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import ImagePicker from "@/components/admin/media/ImagePicker";
import type { MerchCategory } from "@/lib/commerce/types";
import type { MediaAsset } from "@/lib/media/types";

type ProductStatus = "draft" | "published" | "hidden" | "out_of_stock" | "archived";
type CreateDraft = {
  name: string;
  categoryId: string;
  mainImageUrl: string;
  additionalImageUrls: string[];
  price: string;
  shippingCost: string;
  shippingMode: "manual" | "provider" | "free";
  bio: string;
  inventoryQuantity: string;
  status: ProductStatus;
  fulfillmentType: "manual" | "printify";
  sku: string;
  requiresSize: boolean;
  internationalShippingAllowed: boolean;
  quantityLimit: string;
};

const emptyDraft = (categories: MerchCategory[]): CreateDraft => ({
  name: "",
  categoryId: categories.find((category) => category.active && !category.hidden)?.id || categories[0]?.id || "",
  mainImageUrl: "",
  additionalImageUrls: [],
  price: "",
  shippingCost: "0.00",
  shippingMode: "manual",
  bio: "",
  inventoryQuantity: "0",
  status: "draft",
  fulfillmentType: "manual",
  sku: "",
  requiresSize: false,
  internationalShippingAllowed: false,
  quantityLimit: "1"
});

function coinPreview(price: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(price.trim())) return null;
  const cents = Math.round(Number(price) * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? Math.ceil(cents / 50) : null;
}

export default function AdminMerchCreatePanel({ categories, busy, onSubmit }: { categories: MerchCategory[]; busy: boolean; onSubmit: (payload: Record<string, unknown>) => Promise<boolean> }) {
  const [draft, setDraft] = useState(() => emptyDraft(categories));
  const [validation, setValidation] = useState("");
  const [pickerTarget, setPickerTarget] = useState<"main" | "additional" | null>(null);
  const coins = useMemo(() => coinPreview(draft.price), [draft.price]);
  const selectedCategory = categories.find((category) => category.id === draft.categoryId);
  const patch = (next: Partial<CreateDraft>) => setDraft((current) => ({ ...current, ...next }));

  function chooseImage(asset: MediaAsset) {
    if (pickerTarget === "main") patch({ mainImageUrl: asset.publicUrl });
    if (pickerTarget === "additional" && !draft.additionalImageUrls.includes(asset.publicUrl)) patch({ additionalImageUrls: [...draft.additionalImageUrls, asset.publicUrl] });
    setPickerTarget(null);
  }

  function validate(status: ProductStatus) {
    if (!draft.name.trim()) return "PRODUCT NAME REQUIRED";
    if (!draft.categoryId) return "SELECT A CATEGORY";
    if (!draft.mainImageUrl) return "PRODUCT IMAGE REQUIRED";
    if (!/^\d+(?:\.\d{1,2})?$/.test(draft.price.trim()) || Number(draft.price) <= 0) return "INVALID PRICE";
    if (!/^\d+(?:\.\d{1,2})?$/.test(draft.shippingCost.trim()) || Number(draft.shippingCost) < 0) return "INVALID SHIPPING COST";
    if (status === "published" && !draft.bio.trim()) return "PRODUCT BIO REQUIRED BEFORE PUBLISHING";
    return "";
  }

  async function submit(status: ProductStatus) {
    const error = validate(status);
    setValidation(error);
    if (error) return;
    const saved = await onSubmit({ action: "product-create", productEntry: { ...draft, status } });
    if (saved) { setDraft(emptyDraft(categories)); setValidation(""); }
  }

  function removeAdditional(index: number) { patch({ additionalImageUrls: draft.additionalImageUrls.filter((_, itemIndex) => itemIndex !== index) }); }
  function setAdditionalAsMain(index: number) {
    const nextMain = draft.additionalImageUrls[index];
    const previousMain = draft.mainImageUrl;
    patch({ mainImageUrl: nextMain, additionalImageUrls: [previousMain, ...draft.additionalImageUrls.filter((_, itemIndex) => itemIndex !== index)].filter((url) => Boolean(url && url !== nextMain)).slice(0, 12) });
  }
  function moveAdditional(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= draft.additionalImageUrls.length) return;
    const next = [...draft.additionalImageUrls]; [next[index], next[target]] = [next[target], next[index]]; patch({ additionalImageUrls: next });
  }

  return <section id="admin-add-merch-item" className="admin-commerce-panel admin-merch-create" aria-labelledby="admin-add-merch-title">
    <header><div><p className="kicker">ADMIN · COMMERCE · MERCH</p><h2 id="admin-add-merch-title">ADD MERCH ITEM</h2><p>Create a draft or publish a product through the existing catalog, Media Library, inventory, cart, checkout, and fulfillment systems.</p></div><strong className="admin-merch-create-badge">1 COIN = $0.50</strong></header>
    {validation ? <p className="admin-form-error" role="alert">{validation}</p> : null}
    <div className="admin-merch-create-layout">
      <div className="admin-merch-create-fields">
        <label>PRODUCT NAME<input value={draft.name} maxLength={140} onChange={(event) => patch({ name: event.target.value })} placeholder="Masked Signature Hoodie" /></label>
        <label>CATEGORY<select value={draft.categoryId} onChange={(event) => patch({ categoryId: event.target.value })}>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
        <div className="admin-field-row"><label>PRICE (USD)<input value={draft.price} inputMode="decimal" placeholder="45.00" onChange={(event) => patch({ price: event.target.value })} />{coins === null ? <small>Enter a USD amount.</small> : <small>COIN PRICE: {coins} coins</small>}</label><label>SHIPPING COST<input value={draft.shippingCost} inputMode="decimal" placeholder="8.50" onChange={(event) => patch({ shippingCost: event.target.value })} /></label></div>
        <div className="admin-field-row"><label>SHIPPING MODE<select value={draft.shippingMode} onChange={(event) => patch({ shippingMode: event.target.value as CreateDraft["shippingMode"] })}><option value="manual">MANUAL</option><option value="provider">PRINTIFY / PROVIDER</option><option value="free">FREE</option></select></label><label>FULFILLMENT<select value={draft.fulfillmentType} onChange={(event) => patch({ fulfillmentType: event.target.value as CreateDraft["fulfillmentType"] })}><option value="manual">MANUAL</option><option value="printify">PRINTIFY</option></select></label></div>
        <label>PRODUCT BIO<textarea rows={6} maxLength={2000} value={draft.bio} onChange={(event) => patch({ bio: event.target.value })} placeholder="Premium heavyweight hoodie featuring the XMASKEDFREAKS mask emblem." /></label>
        <div className="admin-field-row"><label>INVENTORY / QUANTITY<input value={draft.inventoryQuantity} inputMode="numeric" onChange={(event) => patch({ inventoryQuantity: event.target.value })} /></label><label>SKU (OPTIONAL)<input value={draft.sku} maxLength={100} onChange={(event) => patch({ sku: event.target.value })} placeholder="Auto-generated" /></label></div>
        <div className="admin-field-row"><label>STATUS<select value={draft.status} onChange={(event) => patch({ status: event.target.value as ProductStatus })}><option value="draft">DRAFT</option><option value="published">PUBLISHED</option><option value="hidden">HIDDEN</option><option value="out_of_stock">OUT OF STOCK</option><option value="archived">ARCHIVED</option></select></label><label>QUANTITY LIMIT<input value={draft.quantityLimit} inputMode="numeric" onChange={(event) => patch({ quantityLimit: event.target.value })} /></label></div>
        <div className="admin-switch-grid"><label><input type="checkbox" checked={draft.requiresSize} onChange={(event) => patch({ requiresSize: event.target.checked })} /> Clothing sizes / variants</label><label><input type="checkbox" checked={draft.internationalShippingAllowed} onChange={(event) => patch({ internationalShippingAllowed: event.target.checked })} /> International shipping</label></div>
        <div className="admin-merch-create-actions"><button className="secondary" type="button" disabled={busy} onClick={() => void submit("draft")}>SAVE DRAFT</button><button className="primary" type="button" disabled={busy} onClick={() => void submit("published")}>PUBLISH</button></div>
      </div>
      <aside className="admin-merch-create-media"><div className="admin-merch-image-controls"><div><strong>PRODUCT IMAGES</strong><small>Main image is shown on the visitor product card.</small></div><button className="secondary" type="button" onClick={() => setPickerTarget("main")}>Choose main image</button></div>{draft.mainImageUrl ? <div className="admin-merch-main-image"><Image unoptimized src={draft.mainImageUrl} alt={`${draft.name || "Product"} preview`} fill sizes="(max-width: 760px) 100vw, 34vw" /></div> : <div className="admin-merch-main-image admin-merch-image-empty">MAIN PRODUCT IMAGE REQUIRED</div>}{draft.mainImageUrl ? <button className="secondary danger" type="button" onClick={() => patch({ mainImageUrl: "" })}>Remove main image</button> : null}<div className="admin-merch-additional"><div className="admin-merch-image-controls"><div><strong>ADDITIONAL IMAGES</strong><small>{draft.additionalImageUrls.length}/12 gallery images</small></div><button className="secondary" type="button" onClick={() => setPickerTarget("additional")}>Add image</button></div>{draft.additionalImageUrls.map((url, index) => <div className="admin-merch-additional-row" key={url}><Image unoptimized src={url} alt="Additional product preview" width={64} height={64} /><span>Image {index + 1}</span><button type="button" onClick={() => setAdditionalAsMain(index)}>Set main</button><button type="button" onClick={() => moveAdditional(index, -1)} disabled={index === 0}>↑</button><button type="button" onClick={() => moveAdditional(index, 1)} disabled={index === draft.additionalImageUrls.length - 1}>↓</button><button type="button" onClick={() => removeAdditional(index)}>Remove</button></div>)}</div><div className="admin-merch-preview"><p className="kicker">VISITOR PREVIEW</p><article className="merch-card"><div className="admin-merch-preview-image">{draft.mainImageUrl ? <Image unoptimized src={draft.mainImageUrl} alt="Visitor card preview" fill sizes="(max-width: 760px) 100vw, 22vw" /> : null}</div><div className="merch-card-meta"><span>{selectedCategory?.name || "Category"}</span><b className="in-stock">{draft.inventoryQuantity && Number(draft.inventoryQuantity) > 0 ? "In stock" : "Draft"}</b></div><h2>{draft.name || "Product name"}</h2><p>{draft.bio || "Product bio appears here."}</p><strong className="merch-price">{coins === null ? "— coins" : `${coins} coins`}</strong></article></div></aside>
    </div>
    <ImagePicker open={Boolean(pickerTarget)} category="merchandise" title={pickerTarget === "main" ? "Choose main product image" : "Add product image"} onClose={() => setPickerTarget(null)} onSelect={chooseImage} />
  </section>;
}
