import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import GlobalRewardNotifications from "@/components/GlobalRewardNotifications";
import NewsletterPrompt from "@/components/NewsletterPrompt";
import { BrandingProvider } from "@/components/BrandingProvider";
import GlobalBackgroundClient from "@/components/background/GlobalBackgroundClient";
import { getSiteBrandingSettings } from "@/lib/media/branding";
import { getSiteBackgroundSettings } from "@/lib/media/backgrounds";
import I18nProvider from "@/components/I18nProvider";
import StyleHealthCheck from "@/components/StyleHealthCheck";
import AccountProvider from "@/components/account/AccountProvider";
import PersistentAccountWidget from "@/components/account/PersistentAccountWidget";
import NotificationCenter from "@/components/notifications/NotificationCenter";
import AnalyticsBeacon from "@/components/AnalyticsBeacon";
import ReliabilityClientReporter from "@/components/reliability/ReliabilityClientReporter";
import ContributionActivityTracker from "@/components/ContributionActivityTracker";
import RouteTransition from "@/components/RouteTransition";
import GlobalCartBoundary from "@/components/purchase/GlobalCartBoundary";
import PrivacyConsentProvider from "@/components/privacy/PrivacyConsentManager";
import MotionProvider from "@/components/motion/MotionProvider";
import { getLocaleDirection, languageCookieName, normalizeLocale } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "XMASKEDFREAKS.COM",
  description: "Live room frontend with Supabase auth and database hooks.",
  icons: {
    icon: "/favicon.png",
    apple: "/branding/optimized/mask-logo-256.png"
  },
  robots: {
    index: false,
    follow: false
  }
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [branding, background] = await Promise.all([getSiteBrandingSettings(), getSiteBackgroundSettings()]);
  const locale = normalizeLocale(cookies().get(languageCookieName)?.value);
  return (
    <html lang={locale} dir={getLocaleDirection(locale)} data-deployment-version={process.env.DEPLOYMENT_VERSION || process.env.VERCEL_GIT_COMMIT_SHA || "local"}>
      <body data-xmf-root="ready">
        <MotionProvider>
          <GlobalBackgroundClient settings={background} />
          <I18nProvider initialLocale={locale}>
          <PrivacyConsentProvider>
          <div className="background-ui-layer" data-xmf-app-shell="styled">
            <BrandingProvider settings={branding}>
              <AccountProvider>
              <PersistentAccountWidget />
              <NotificationCenter />
                <AnalyticsBeacon />
                <ReliabilityClientReporter />
                <ContributionActivityTracker />
                <GlobalRewardNotifications />
                <NewsletterPrompt />
                <RouteTransition><GlobalCartBoundary>{children}</GlobalCartBoundary></RouteTransition>
              </AccountProvider>
            </BrandingProvider>
          </div>
          </PrivacyConsentProvider>
          </I18nProvider>
        </MotionProvider>
        {process.env.NODE_ENV === "development" ? <StyleHealthCheck /> : null}
      </body>
    </html>
  );
}
