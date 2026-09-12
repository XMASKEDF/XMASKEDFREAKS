"use client";

import Image from "next/image";
import StoreHeader from "@/components/store/StoreHeader";
import { useI18n } from "@/components/I18nProvider";
import { safeExternalUrl, type ExternalPlatformSettings } from "@/lib/external-platforms";

export default function FanslyPage({ settings }: { settings: ExternalPlatformSettings }) {
  const { t } = useI18n();
  const destination = safeExternalUrl(settings.fanslyUrl, "fansly.com");
  return (
    <main className="external-store-page fansly-route-page">
      <StoreHeader />
      <section className="fansly-route-hero">
        <div className="fansly-route-image">
          <Image src={settings.fanslyHeroImage || "/branding/optimized/mask-logo-1024.png"} alt={t("fansly.heroAlt")} fill priority sizes="(max-width: 760px) 100vw, 48vw" />
        </div>
        <div>
          <p className="kicker">{t("fansly.kicker")}</p>
          <h1>{settings.fanslyHandle}</h1>
          <h2>{t("fansly.crazyEight")}</h2>
          <p>{settings.fanslyBiography}</p>
          <ul>
            <li>{t("fansly.benefitOne")}</li>
            <li>{t("fansly.benefitTwo")}</li>
            <li>{t("fansly.benefitThree")}</li>
          </ul>
        </div>
      </section>
      <section className="fansly-preview-section" aria-labelledby="fansly-preview-title">
        <header>
          <p className="kicker">{t("fansly.kicker")}</p>
          <h2 id="fansly-preview-title">{t("fansly.crazyEight")}</h2>
        </header>
        <div className="fansly-preview-grid">
          {Array.from({ length: 6 }, (_, index) => (
            <article className="fansly-locked-preview" aria-label={`Locked Crazy 8 preview ${index + 1}`} key={index}>
              <span aria-hidden="true">▣</span>
              <small>Locked preview {String(index + 1).padStart(2, "0")}</small>
            </article>
          ))}
        </div>
        {settings.fanslyEnabled && destination ? (
          <a className="primary fansly-preview-cta" href={destination} target="_blank" rel="noopener noreferrer" data-outbound-platform="fansly">
            {settings.fanslyButtonLabel}
          </a>
        ) : (
          <p className="status-line">{t("fansly.buttonUnavailable")}</p>
        )}
      </section>
    </main>
  );
}
