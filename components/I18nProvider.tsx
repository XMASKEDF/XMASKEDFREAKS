"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  createTranslator,
  detectPreferredLocale,
  fallbackMessages,
  getLocaleDirection,
  loadLocaleMessages,
  normalizeLocale,
  rememberLocale,
  type LocaleCode,
  type Messages
} from "@/lib/i18n";

type I18nContextValue = {
  locale: LocaleCode;
  messages: Messages;
  direction: "ltr" | "rtl";
  setLocale: (locale: LocaleCode) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export default function I18nProvider({ children, initialLocale = "en" }: { children: ReactNode; initialLocale?: LocaleCode }) {
  const [locale, setLocaleState] = useState(() => normalizeLocale(initialLocale));
  const [messages, setMessages] = useState<Messages>(fallbackMessages);

  const setLocale = useCallback((nextLocale: LocaleCode) => {
    const normalized = normalizeLocale(nextLocale);
    setLocaleState(normalized);
    rememberLocale(normalized);
    window.dispatchEvent(new CustomEvent("xmf:language-change", { detail: normalized }));
  }, []);

  useEffect(() => {
    const detected = detectPreferredLocale();
    setLocaleState((current) => detected === current ? current : detected);
  }, []);

  useEffect(() => {
    let active = true;
    rememberLocale(locale);
    loadLocaleMessages(locale).then((nextMessages) => {
      if (active) setMessages(nextMessages);
    });
    return () => { active = false; };
  }, [locale]);

  useEffect(() => {
    const onLanguageChange = (event: Event) => {
      const nextLocale = (event as CustomEvent<string>).detail;
      if (nextLocale) setLocaleState(normalizeLocale(nextLocale));
    };
    window.addEventListener("xmf:language-change", onLanguageChange);
    return () => window.removeEventListener("xmf:language-change", onLanguageChange);
  }, []);

  const t = useMemo(() => createTranslator(messages, (key) => {
    void fetch("/api/i18n/missing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, locale, route: window.location.pathname })
    }).catch(() => undefined);
  }), [locale, messages]);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    messages,
    direction: getLocaleDirection(locale),
    setLocale,
    t
  }), [locale, messages, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
