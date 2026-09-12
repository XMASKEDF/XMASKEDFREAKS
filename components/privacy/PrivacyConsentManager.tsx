"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  COOKIE_CONSENT_COOKIE,
  COOKIE_CONSENT_DELAY_SECONDS,
  COOKIE_CONSENT_LIFETIME_DAYS,
  COOKIE_CONSENT_STORAGE_KEY,
  defaultPrivacyConsent,
  hasValidConsent,
  consentForStorage,
  type PrivacyConsent
} from "@/lib/privacy-consent";

type ConsentContextValue = {
  consent: PrivacyConsent;
  ready: boolean;
  pending: boolean;
  gpcDetected: boolean;
  openPreferences: () => void;
  acceptOptional: () => void;
  rejectOptional: () => void;
  savePreferences: (next: Pick<PrivacyConsent, "analytics" | "functional" | "marketing" | "advertising">) => void;
};

const ConsentContext = createContext<ConsentContextValue | null>(null);

export function usePrivacyConsent() {
  const context = useContext(ConsentContext);
  if (!context) throw new Error("usePrivacyConsent must be used inside PrivacyConsentProvider");
  return context;
}

function detectGpc() {
  return typeof navigator !== "undefined" && (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

function persistConsent(consent: PrivacyConsent, lifetimeDays = COOKIE_CONSENT_LIFETIME_DAYS) {
  const value = consentForStorage(consent);
  window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, value);
  document.cookie = `${COOKIE_CONSENT_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=${Math.max(1, lifetimeDays) * 86400}; SameSite=Lax`;
  window.dispatchEvent(new CustomEvent("xmf-privacy-consent", { detail: consent }));
  void fetch("/api/privacy/consent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(consent), keepalive: true }).catch(() => undefined);
}

function PrivacyChoices({ onClose }: { onClose: () => void }) {
  const { consent, gpcDetected, savePreferences } = usePrivacyConsent();
  const [choices, setChoices] = useState({ analytics: consent.analytics, functional: consent.functional, marketing: consent.marketing, advertising: consent.advertising });
  const update = (key: keyof typeof choices) => setChoices((current) => ({ ...current, [key]: !current[key] }));
  const categories = [
    ["analytics", "Analytics", "Optional measurement for page usage, referrals, feature usage, and conversions. No optional analytics loads before approval."],
    ["functional", "Functional", "Optional convenience features and nonessential remembered preferences."]
  ] as const;

  return <div className="privacy-consent-dialog" role="dialog" aria-modal="true" aria-labelledby="privacy-preferences-title">
    <header><div><p className="kicker">PRIVACY</p><h2 id="privacy-preferences-title">COOKIE PREFERENCES</h2></div><button className="privacy-consent-close" type="button" onClick={onClose} aria-label="Close privacy preferences">×</button></header>
    <p className="privacy-consent-lede">Necessary technologies stay on so the site can operate. Choose which optional categories you allow.</p>
    <section className="privacy-consent-category is-required"><div><strong>Necessary</strong><p>Security, authentication, age-gate state, checkout continuity, language preference, and this choice are always on.</p></div><span>ALWAYS ON</span></section>
    {categories.map(([key, title, description]) => <details className="privacy-consent-category" key={key}><summary><span><strong>{title}</strong><small>{description}</small></span><label className="privacy-consent-switch"><input type="checkbox" checked={choices[key]} onChange={() => update(key)} /><span aria-hidden="true" /></label></summary><p>What it does: {description} Third parties: none are configured for this category.</p></details>)}
    {gpcDetected ? <p className="privacy-consent-gpc" role="status">Global Privacy Control detected. Optional sale, sharing, marketing, and advertising choices remain off.</p> : null}
    <div className="privacy-consent-actions"><button className="primary" type="button" onClick={() => { savePreferences(choices); onClose(); }}>SAVE MY CHOICES</button><a href="/policies#privacy">Privacy Policy</a><a href="/policies#cookies">Cookie Policy</a></div>
  </div>;
}

export default function PrivacyConsentProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = useState<PrivacyConsent>(() => defaultPrivacyConsent(false));
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [ageVerified, setAgeVerified] = useState(false);
  const [config, setConfig] = useState({ enabled: true, popupDelaySeconds: COOKIE_CONSENT_DELAY_SECONDS, consentVersion: "1.0", consentLifetimeDays: COOKIE_CONSENT_LIFETIME_DAYS });
  const gpcDetected = consent.gpc;

  const commit = useCallback((next: PrivacyConsent) => {
    setConsent(next);
    setPending(false);
    persistConsent(next, config.consentLifetimeDays);
  }, [config.consentLifetimeDays]);

  useEffect(() => {
    const gpc = detectGpc();
    const stored = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    void fetch("/api/privacy/settings", { cache: "no-store" }).then((response) => response.json()).then((settings: { enabled?: boolean; popupDelaySeconds?: number; consentVersion?: string; consentLifetimeDays?: number }) => setConfig({ enabled: settings.enabled !== false, popupDelaySeconds: Math.max(5, Number(settings.popupDelaySeconds || COOKIE_CONSENT_DELAY_SECONDS)), consentVersion: String(settings.consentVersion || "1.0"), consentLifetimeDays: Math.max(1, Number(settings.consentLifetimeDays || COOKIE_CONSENT_LIFETIME_DAYS)) })).catch(() => undefined);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as unknown;
        if (hasValidConsent(parsed, config.consentVersion)) {
          setConsent({ ...parsed, gpc: gpc || parsed.gpc === true, marketing: gpc ? false : parsed.marketing, advertising: gpc ? false : parsed.advertising });
          setReady(true);
          setAgeVerified(window.localStorage.getItem("xmf-age-ok") === "true");
          return;
        }
      } catch { /* Treat unreadable local state as no consent. */ }
    }
    setConsent(defaultPrivacyConsent(gpc, config.consentVersion));
    const preview = new URLSearchParams(window.location.search).get("privacy-preview") === "1";
    setAgeVerified(window.localStorage.getItem("xmf-age-ok") === "true" || preview);
    if (preview && !stored) setPending(true);
    setReady(true);
  }, [config.consentVersion]);

  useEffect(() => {
    const onAgeVerified = () => setAgeVerified(true);
    const onStorage = (event: StorageEvent) => { if (event.key === "xmf-age-ok" && event.newValue === "true") setAgeVerified(true); };
    window.addEventListener("xmf-age-verified", onAgeVerified);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener("xmf-age-verified", onAgeVerified); window.removeEventListener("storage", onStorage); };
  }, []);

  useEffect(() => {
    if (!ready || !config.enabled || hasValidConsent(consent, config.consentVersion) || !ageVerified || pending) return;
    let elapsed = 0;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (document.fullscreenElement) return;
      elapsed += 1;
      if (elapsed >= config.popupDelaySeconds) { setPending(true); window.clearInterval(interval); }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [ageVerified, config.consentVersion, config.enabled, config.popupDelaySeconds, consent, pending, ready]);

  const value = useMemo<ConsentContextValue>(() => ({
    consent,
    ready,
    pending,
    gpcDetected,
    openPreferences: () => setPreferencesOpen(true),
    acceptOptional: () => commit({ ...consent, analytics: true, functional: true, marketing: gpcDetected ? false : true, advertising: gpcDetected ? false : true, timestamp: new Date().toISOString() }),
    rejectOptional: () => commit({ ...consent, analytics: false, functional: false, marketing: false, advertising: false, timestamp: new Date().toISOString() }),
    savePreferences: (next) => commit({ ...consent, ...next, marketing: gpcDetected ? false : next.marketing, advertising: gpcDetected ? false : next.advertising, timestamp: new Date().toISOString() })
  }), [commit, consent, gpcDetected, pending, ready]);

  return <ConsentContext.Provider value={value}>
    {children}
    {ready ? <PrivacySettingsLink /> : null}
    {ready && (pending || preferencesOpen) ? <div className="privacy-consent-overlay" onClick={(event) => { if (event.currentTarget === event.target && preferencesOpen) setPreferencesOpen(false); }}>
      {preferencesOpen ? <PrivacyChoices onClose={() => setPreferencesOpen(false)} /> : <section className="privacy-consent-dialog" role="dialog" aria-modal="true" aria-labelledby="privacy-consent-title">
        <p className="kicker">XMASKEDFREAKS</p><h2 id="privacy-consent-title">COOKIE &amp; PRIVACY CHOICES</h2><p>Necessary technologies operate the site. Optional analytics help us understand usage, and optional marketing or tracking technologies are controlled by you.</p><p>You can accept optional cookies, reject them, or customize your preferences. Your choice is remembered and can be changed later.</p>
        <div className="privacy-consent-actions"><button className="primary" type="button" onClick={value.acceptOptional}>ACCEPT OPTIONAL COOKIES</button><button className="secondary" type="button" onClick={value.rejectOptional}>REJECT OPTIONAL COOKIES</button><button className="secondary" type="button" onClick={() => setPreferencesOpen(true)}>COOKIE PREFERENCES</button></div><p className="privacy-consent-links"><a href="/policies#privacy">Privacy Policy</a><a href="/policies#cookies">Cookie Policy</a></p>
      </section>}
    </div> : null}
  </ConsentContext.Provider>;
}

export function PrivacySettingsLink() {
  const { openPreferences } = usePrivacyConsent();
  return <button className="privacy-settings-link" type="button" onClick={openPreferences}>Privacy Settings</button>;
}
