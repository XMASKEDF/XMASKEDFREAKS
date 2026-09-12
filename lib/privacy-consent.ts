export const COOKIE_CONSENT_VERSION = "1.0";
export const COOKIE_CONSENT_STORAGE_KEY = "xmf-cookie-consent";
export const COOKIE_CONSENT_COOKIE = "xmf_cookie_consent";
export const COOKIE_CONSENT_DELAY_SECONDS = 46;
export const COOKIE_CONSENT_LIFETIME_DAYS = 180;

export type ConsentCategory = "necessary" | "analytics" | "functional" | "marketing" | "advertising";

export type PrivacyConsent = {
  consentVersion: string;
  necessary: true;
  analytics: boolean;
  functional: boolean;
  marketing: boolean;
  advertising: boolean;
  gpc: boolean;
  timestamp: string;
};

export const defaultPrivacyConsent = (gpc = false, consentVersion = COOKIE_CONSENT_VERSION): PrivacyConsent => ({
  consentVersion,
  necessary: true,
  analytics: false,
  functional: false,
  marketing: false,
  advertising: false,
  gpc,
  timestamp: ""
});

export function hasValidConsent(value: unknown, expectedVersion = COOKIE_CONSENT_VERSION): value is PrivacyConsent {
  if (!value || typeof value !== "object") return false;
  const consent = value as Partial<PrivacyConsent>;
  return consent.consentVersion === expectedVersion && consent.necessary === true && typeof consent.timestamp === "string" && Boolean(consent.timestamp);
}

export function consentForStorage(consent: PrivacyConsent) {
  return JSON.stringify(consent);
}
