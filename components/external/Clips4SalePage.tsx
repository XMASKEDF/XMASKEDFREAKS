"use client";

import Image from "next/image";
import StoreHeader from "@/components/store/StoreHeader";
import { useI18n } from "@/components/I18nProvider";
import { safeExternalUrl, type Clips4SaleItem, type ExternalPlatformSettings } from "@/lib/external-platforms";

export default function Clips4SalePage({ settings, clips }: { settings: ExternalPlatformSettings; clips: Clips4SaleItem[] }) {
  const { t } = useI18n();
  const storeUrl = safeExternalUrl(settings.clipsStoreUrl, "clips4sale.com");
  return <main className="external-store-page clips4sale-page"><StoreHeader /><section className="external-store-hero"><p className="kicker">{t("clips.kicker")}</p><h1>{t("clips.pageTitle")}</h1><p>{settings.clipsBiography}</p>{storeUrl ? <a className="primary" href={storeUrl} target="_blank" rel="noopener noreferrer">{settings.clipsButtonLabel}</a> : null}</section><section className="clip-grid external-clip-grid" aria-label={t("clips.catalogLabel")}>{clips.filter((clip) => clip.published).map((clip, index) => { const productUrl = clip.productUrl ? safeExternalUrl(clip.productUrl, "clips4sale.com") : null; const contents = <><span className="external-clip-image"><Image src={clip.thumbnailUrl || "/branding/optimized/mask-logo-512.png"} alt={clip.title} fill priority={index === 0} sizes="(max-width: 700px) 100vw, 33vw" /><small>{clip.duration}</small></span><strong>{clip.title}</strong><p>{clip.description}</p><small>{productUrl ? t("clips.openProduct") : t("clips.productPending")}</small></>; return productUrl ? <a className="clip-card" href={productUrl} target="_blank" rel="noopener noreferrer" data-outbound-platform="clips4sale" key={clip.id}>{contents}</a> : <article className="clip-card is-unlinked" key={clip.id}>{contents}</article>; })}</section></main>;
}
