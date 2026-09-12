"use client";

import BrandLogo from "@/components/BrandLogo";
import { useI18n } from "@/components/I18nProvider";
import AdminAudioClipsManager from "@/components/admin/AdminAudioClipsManager";
import type { AudioProductRecord } from "@/lib/audio-store/catalog";

export default function AdminAudioClipsShell({ products, configured, username }: { products: AudioProductRecord[]; configured: boolean; username: string }) {
  const { t } = useI18n();
  return <main className="admin-page admin-audio-page"><header className="admin-header"><BrandLogo href="/admin" priority /><div><p className="kicker">{t("audioAdmin.kicker")}</p><h1>{t("audioAdmin.title")}</h1><p>{t("audioAdmin.signedIn", { username })}</p></div><a className="secondary admin-link-button" href="/admin">{t("audioAdmin.back")}</a></header><AdminAudioClipsManager initialProducts={products} configured={configured} /></main>;
}
