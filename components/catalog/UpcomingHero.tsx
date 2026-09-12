"use client";

import { useI18n } from "@/components/I18nProvider";

export default function UpcomingHero() {
  const { t } = useI18n();
  return <section className="upcoming-hero"><p className="kicker">{t("upcoming.kicker")}</p><h1>{t("upcoming.title")}</h1><p>{t("upcoming.intro")}</p></section>;
}
