# Platform Localization

## Permanent development rule

“From this point forward, every new page, component, feature, system message, game, Admin control, and visitor-facing string must use the built-in translation system. No English-only additions are permitted.”

`I18nProvider` is the single client-side source of locale state. Server-rendered routes read the `xmf_language` cookie. The explicit visitor choice is stored in the cookie and local storage, then written to `profiles.preferred_language` by the existing authenticated profile sync.

Locale metadata lives only in `public/locales/manifest.json`. Base messages live in `public/locales/<locale>.json`; domain messages live below `public/locales/<domain>/<locale>.json`. English is the graceful fallback. Published ADMIN overrides are loaded from `translation_entries` without modifying stable IDs, token values, prices, or access rules.

Use `const { locale, t } = useI18n()` in client components. Never use a translated phrase as an API, database, payment, game, or analytics identifier. Server APIs return stable error codes; clients translate those codes.

Run `pnpm run check:i18n` before committing. It validates the registry, required core translations, and prevents the measured legacy hardcoded-text baseline from increasing.
