"use client";

import Image from "next/image";
import BrandLogo from "@/components/BrandLogo";
import { useI18n } from "@/components/I18nProvider";

export default function MaintenanceExperience({ settings }: { settings: { title: string; message: string; imageUrl: string; expectedReturnAt: string | null; supportUrl: string } }) {
  const { locale, t } = useI18n();
  const expected = settings.expectedReturnAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(settings.expectedReturnAt)) : null;
  return <main className="maintenance-page"><section><BrandLogo href="/" priority />{settings.imageUrl ? <Image src={settings.imageUrl} alt="" width={720} height={360} /> : null}<div className="maintenance-status"><span aria-hidden="true" />{t("killSwitch.status")}</div><p className="kicker">{t("killSwitch.kicker")}</p><h1>{settings.title || t("killSwitch.title")}</h1><p>{settings.message || t("killSwitch.message")}</p>{expected ? <time dateTime={settings.expectedReturnAt || undefined}>{t("killSwitch.expected", { time: expected })}</time> : null}<div><a className="secondary" href={settings.supportUrl}>{t("killSwitch.support")}</a><a className="primary" href="/">{t("killSwitch.retry")}</a></div></section></main>;
}
