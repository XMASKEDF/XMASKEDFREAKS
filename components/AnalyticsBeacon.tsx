"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useI18n } from "@/components/I18nProvider";
import { usePrivacyConsent } from "@/components/privacy/PrivacyConsentManager";

export default function AnalyticsBeacon() {
  const pathname = usePathname();
  const { locale } = useI18n();
  const { consent, ready } = usePrivacyConsent();
  useEffect(() => {
    if (!ready || !consent.analytics) return;
    const params = new URLSearchParams(window.location.search);
    const referrerHost = document.referrer ? new URL(document.referrer).hostname : "direct";
    const source = params.get("utm_source") || (referrerHost === "direct" ? "direct" : /google\./i.test(referrerHost) ? "google" : /bing\./i.test(referrerHost) ? "bing" : /twitter\.com|x\.com|instagram\.com|reddit\.com/i.test(referrerHost) ? "social" : /clips4sale/i.test(referrerHost) ? "clips4sale" : /fansly/i.test(referrerHost) ? "fansly" : "referral");
    const payload = JSON.stringify({
      eventType: "page_view",
      eventKey: `${crypto.randomUUID()}:${pathname}`,
      pagePath: pathname,
      languageCode: locale,
      deviceType: window.matchMedia("(max-width: 680px)").matches ? "mobile" : window.matchMedia("(max-width: 1024px)").matches ? "tablet" : "desktop",
      referrerHost,
      source,
      medium: params.get("utm_medium") || (source === "direct" ? "none" : "referral"),
      campaign: params.get("utm_campaign") || null,
      content: params.get("utm_content") || null,
      landingPage: window.location.pathname,
      environment: window.location.pathname === "/sandbox" ? "sandbox" : "production"
    });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/analytics/events", new Blob([payload], { type: "application/json" }));
    else void fetch("/api/analytics/events", { method: "POST", headers: { "content-type": "application/json" }, body: payload, keepalive: true });
  }, [consent.analytics, locale, pathname, ready]);
  return null;
}
