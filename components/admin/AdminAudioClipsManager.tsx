"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { useI18n } from "@/components/I18nProvider";
import type { AudioProductRecord } from "@/lib/audio-store/catalog";
import DirectMediaUpload from "@/components/admin/media/DirectMediaUpload";

function readableBytes(value: number | null, locale: string) {
  if (!value) return "—";
  const unit = value >= 1024 * 1024 ? "megabyte" : "kilobyte";
  return new Intl.NumberFormat(locale, { style: "unit", unit, maximumFractionDigits: 1 }).format(value / (unit === "megabyte" ? 1024 * 1024 : 1024));
}

export default function AdminAudioClipsManager({ initialProducts, configured }: { initialProducts: AudioProductRecord[]; configured: boolean }) {
  const { t, locale } = useI18n();
  const [products, setProducts] = useState(initialProducts);
  const [status, setStatus] = useState(configured ? t("audioAdmin.privateStorage") : t("audioAdmin.notConfigured"));
  const [busySlot, setBusySlot] = useState<number | null>(null);

  function patchLocal(id: string, patch: Partial<AudioProductRecord>) {
    setProducts((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  async function save(event: FormEvent, product: AudioProductRecord) {
    event.preventDefault();
    const initial = initialProducts.find((item) => item.id === product.id);
    if (initial && Math.abs(product.coinPrice - initial.coinPrice) >= Math.max(100, initial.coinPrice * 0.5) && !window.confirm(t("audioAdmin.confirmPrice"))) return;
    setBusySlot(product.slotNumber); setStatus("");
    const response = await fetch("/api/admin/audio-clips", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: product.id, name: product.name, description: product.description, coinPrice: product.coinPrice, active: product.active, published: product.published, allowRepurchase: product.allowRepurchase }) });
    const result = await response.json().catch(() => ({})) as { error?: string; products?: AudioProductRecord[] };
    if (response.ok && result.products) { setProducts(result.products); setStatus(t("audioAdmin.saved")); } else setStatus(result.error || t("audioStore.checkoutFailed"));
    setBusySlot(null);
  }

  async function refreshProducts() {
    const response = await fetch("/api/admin/audio-clips", { cache: "no-store" });
    const result = await response.json().catch(() => ({})) as { products?: AudioProductRecord[] };
    if (response.ok && result.products) { setProducts(result.products); setStatus(t("audioAdmin.saved")); }
  }

  async function remove(product: AudioProductRecord, kind: "all" | "thumbnail" | "preview" | "product" = "all") {
    if (!window.confirm(t(kind === "all" ? "audioAdmin.confirmRemove" : "audioAdmin.confirmAsset"))) return;
    setBusySlot(product.slotNumber);
    const response = await fetch(`/api/admin/audio-clips?id=${encodeURIComponent(product.id)}&kind=${kind}`, { method: "DELETE" });
    const result = await response.json().catch(() => ({})) as { error?: string; products?: AudioProductRecord[] };
    if (response.ok && result.products) { setProducts(result.products); setStatus(t("audioAdmin.removed")); } else setStatus(result.error || t("audioStore.checkoutFailed"));
    setBusySlot(null);
  }

  return <>
    <p className="admin-audio-status" role="status" aria-live="polite">{status}</p>
    <section className="admin-audio-grid" aria-label={t("audioAdmin.title")}>{products.map((product) => <form className="admin-audio-card" onSubmit={(event) => void save(event, product)} key={product.slotNumber}>
      <header><div><p className="kicker">{t("audioAdmin.slot", { number: product.slotNumber })}</p><h2>{product.name}</h2></div><span className={product.active && product.published ? "status-on" : "status-off"}>{product.active && product.published ? t("audioStore.available") : t("audioStore.unavailable")}</span></header>
      <div className="admin-audio-thumbnail"><Image src={product.thumbnailUrl} alt={product.name} fill sizes="360px" /></div>
      <label>{t("audioAdmin.name")}<input value={product.name} maxLength={140} required onChange={(event) => patchLocal(product.id, { name: event.target.value })} /></label>
      <label>{t("audioAdmin.description")}<textarea value={product.description} maxLength={2000} rows={4} onChange={(event) => patchLocal(product.id, { description: event.target.value })} /></label>
      <label>{t("audioAdmin.price")}<input type="number" min={1} max={100000} step={1} required value={product.coinPrice} onChange={(event) => patchLocal(product.id, { coinPrice: Math.floor(Number(event.target.value)) })} /></label>
      <div className="admin-audio-switches"><label><input type="checkbox" checked={product.active} onChange={(event) => patchLocal(product.id, { active: event.target.checked })} /> {t("audioAdmin.active")}</label><label><input type="checkbox" checked={product.published} onChange={(event) => patchLocal(product.id, { published: event.target.checked })} /> {t("audioAdmin.published")}</label><label><input type="checkbox" checked={product.allowRepurchase} onChange={(event) => patchLocal(product.id, { allowRepurchase: event.target.checked })} /> {t("audioAdmin.repurchase")}</label></div>
      <div className="admin-audio-file-info"><strong>{t("audioAdmin.status")}</strong><span>{product.productFilePath ? t("audioAdmin.fileInfo", { format: product.fileExtension?.toUpperCase() || "—", size: readableBytes(product.fileSize, locale) }) : t("audioAdmin.noFile")}</span><small>{product.originalFilename || "—"}</small></div>
      <div className="admin-audio-uploads">
        <div><DirectMediaUpload accept="image/jpeg,image/png,image/webp,image/avif" mediaClass="IMAGE" label={t("audioAdmin.uploadThumbnail")} disabled={busySlot !== null && busySlot !== product.slotNumber} metadata={{ categoryId: "other", displayName: `${product.name} thumbnail`, requestedStatus: "published", assignment: { resourceType: "audio_product", resourceId: product.id, role: "thumbnail" } }} onComplete={() => void refreshProducts()} />{product.thumbnailPath ? <button type="button" onClick={() => void remove(product, "thumbnail")}>{t("audioAdmin.removeThumbnail")}</button> : null}</div>
        <div><DirectMediaUpload accept=".mp3,.m4a,.wav,.aac,.mp4,audio/*,video/mp4" mediaClass="AUDIO" label={t("audioAdmin.uploadProduct")} disabled={busySlot !== null && busySlot !== product.slotNumber} metadata={{ categoryId: "other", displayName: product.name, requestedStatus: "private", assignment: { resourceType: "audio_product", resourceId: product.id, role: "product" } }} onComplete={() => void refreshProducts()} />{product.productFilePath ? <button type="button" onClick={() => void remove(product, "product")}>{t("audioAdmin.removeFile")}</button> : null}</div>
        <div><DirectMediaUpload accept=".mp3,.m4a,.wav,.aac,.mp4,audio/*,video/mp4" mediaClass="AUDIO" label={t("audioAdmin.uploadPreview")} disabled={busySlot !== null && busySlot !== product.slotNumber} metadata={{ categoryId: "other", displayName: `${product.name} preview`, requestedStatus: "private", assignment: { resourceType: "audio_product", resourceId: product.id, role: "preview" } }} onComplete={() => void refreshProducts()} />{product.previewFilePath ? <button type="button" onClick={() => void remove(product, "preview")}>{t("audioAdmin.removePreview")}</button> : null}</div>
      </div>
      <div className="admin-audio-actions"><button className="primary" type="submit" disabled={busySlot === product.slotNumber}>{busySlot === product.slotNumber ? t("audioAdmin.uploading", { kind: t("audioAdmin.status") }) : t("audioAdmin.save")}</button><button className="secondary danger" type="button" disabled={busySlot === product.slotNumber} onClick={() => void remove(product, "all")}>{t("audioAdmin.remove")}</button></div>
    </form>)}</section>
  </>;
}
