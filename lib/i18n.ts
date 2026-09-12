import defaultMessages from "@/public/locales/en.json";
import defaultCoreMessages from "@/public/locales/core/en.json";
import defaultWalletMessages from "@/public/locales/wallet/en.json";
import defaultGameMessages from "@/public/locales/games/en.json";
import defaultStoreMessages from "@/public/locales/store/en.json";
import localeManifest from "@/public/locales/manifest.json";

export type LocaleCode = string;
export type Messages = Record<string, string>;

export type LocaleOption = {
  code: LocaleCode;
  name: string;
  nativeName: string;
  regions: string[];
  direction: "ltr" | "rtl";
  enabled: boolean;
};

export const fallbackLocale = "en";
export const languageStorageKey = "xmf-language";
export const languageCookieName = "xmf_language";
export const languageOptions = localeManifest as LocaleOption[];
export const fallbackMessages = { ...(defaultMessages as Messages), ...(defaultCoreMessages as Messages), ...(defaultWalletMessages as Messages), ...(defaultGameMessages as Messages), ...(defaultStoreMessages as Messages) };

export function normalizeLocale(value?: string | null) {
  if (!value) return fallbackLocale;
  const normalized = value.toLowerCase().replace("_", "-");
  const exact = languageOptions.find((locale) => locale.code.toLowerCase() === normalized);
  if (exact) return exact.code;
  const short = normalized.split("-")[0];
  const languageMatch = languageOptions.find((locale) => locale.code.toLowerCase().split("-")[0] === short);
  return languageMatch?.code || fallbackLocale;
}

function regionFromLocale(value?: string | null) {
  const parts = (value || "").split(/[-_]/);
  return parts[1]?.toUpperCase() || "";
}

function localeFromRegion(region: string) {
  if (!region) return fallbackLocale;
  return languageOptions.find((locale) => locale.regions.includes(region))?.code || fallbackLocale;
}

function timezoneRegion() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone?.split("/")[0]?.toUpperCase() || "";
  } catch {
    return "";
  }
}

export function detectPreferredLocale() {
  if (typeof window === "undefined") return fallbackLocale;
  const saved = window.localStorage.getItem(languageStorageKey);
  if (saved) return normalizeLocale(saved);
  const cookie = document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${languageCookieName}=`));
  if (cookie) return normalizeLocale(decodeURIComponent(cookie.split("=").slice(1).join("=")));
  const navigatorLocales = navigator.languages?.length ? navigator.languages : [navigator.language];
  const browserMatch = navigatorLocales.map(normalizeLocale).find((locale) => locale !== fallbackLocale);
  if (browserMatch) return browserMatch;
  const regionMatch = localeFromRegion(regionFromLocale(navigator.language));
  if (regionMatch !== fallbackLocale) return regionMatch;
  const zone = timezoneRegion();
  if (zone === "EUROPE") return "en";
  if (zone === "AMERICA") return "en";
  return fallbackLocale;
}

export async function loadLocaleMessages(locale: LocaleCode) {
  const normalized = normalizeLocale(locale);
  if (normalized === fallbackLocale) return fallbackMessages;
  try {
    const [baseResponse, coreResponse, walletResponse, gameResponse, storeResponse, overrideResponse] = await Promise.all([
      fetch(`/locales/${normalized}.json`, { cache: "no-store" }),
      fetch(`/locales/core/${normalized}.json`, { cache: "no-store" }),
      fetch(`/locales/wallet/${normalized}.json`, { cache: "no-store" }),
      fetch(`/locales/games/${normalized}.json`, { cache: "no-store" }),
      fetch(`/locales/store/${normalized}.json`, { cache: "no-store" }),
      fetch(`/api/i18n/messages?locale=${encodeURIComponent(normalized)}`, { cache: "no-store" })
    ]);
    const base = baseResponse.ok ? await baseResponse.json() as Messages : {};
    const core = coreResponse.ok ? await coreResponse.json() as Messages : {};
    const wallet = walletResponse.ok ? await walletResponse.json() as Messages : {};
    const games = gameResponse.ok ? await gameResponse.json() as Messages : {};
    const store = storeResponse.ok ? await storeResponse.json() as Messages : {};
    const overridePayload = overrideResponse.ok ? await overrideResponse.json() as { messages?: Messages } : {};
    return { ...fallbackMessages, ...base, ...core, ...wallet, ...games, ...store, ...(overridePayload.messages || {}) };
  } catch {
    return fallbackMessages;
  }
}

export function createTranslator(messages: Messages, logMissing?: (key: string) => void) {
  return (key: string, values: Record<string, string | number> = {}) => {
    const template = messages[key] || fallbackMessages[key] || humanizeTranslationKey(key);
    if (!messages[key] && !fallbackMessages[key]) logMissing?.(key);
    return Object.entries(values).reduce(
      (text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)),
      template
    );
  };
}

export function humanizeTranslationKey(key: string) {
  const leaf = key.split(".").pop() || "Message unavailable";
  return leaf.replace(/[-_]/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function rememberLocale(locale: LocaleCode) {
  if (typeof window === "undefined") return;
  const normalized = normalizeLocale(locale);
  window.localStorage.setItem(languageStorageKey, normalized);
  document.cookie = `${languageCookieName}=${normalized}; path=/; max-age=31536000; SameSite=Lax`;
  document.documentElement.lang = normalized;
  document.documentElement.dir = getLocaleDirection(normalized);
}

export function getLocaleDirection(locale: LocaleCode): "ltr" | "rtl" {
  return languageOptions.find((item) => item.code === normalizeLocale(locale))?.direction || "ltr";
}

export function formatLanguageLabel(nativeName: string, englishName: string) {
  const native = nativeName.trim();
  const english = englishName.trim();
  if (!native) return english || fallbackMessages["footer.language"] || "Language";
  if (!english || native.localeCompare(english, undefined, { sensitivity: "accent" }) === 0) return native;
  return `${native} (${english})`;
}

export function getLocaleLabel(locale: LocaleCode) {
  const option = languageOptions.find((item) => item.code === normalizeLocale(locale));
  return option ? formatLanguageLabel(option.nativeName, option.name) : formatLanguageLabel("English", "English");
}

export function formatCurrency(amount: number, locale: LocaleCode, currency = "USD") {
  return new Intl.NumberFormat(normalizeLocale(locale), {
    style: "currency",
    currency
  }).format(amount);
}

export function formatNumber(value: number, locale: LocaleCode) {
  return new Intl.NumberFormat(normalizeLocale(locale)).format(value);
}
