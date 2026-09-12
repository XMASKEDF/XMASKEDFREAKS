# Translation Coverage Audit

Audit date: 2026-07-19

## Verified architecture

- One root `I18nProvider` controls client locale, messages, document language, document direction, persistence, and cross-component updates.
- The adult gate and footer use the same preferred-language state. The removed language-search field remains absent.
- Supported registry: English, Spanish, French, German, Portuguese, Japanese, Korean, Simplified Chinese, Arabic, and Russian.
- The Tip Menu uses stable option IDs and translated display phrases. Token values and deduction rules are unchanged.
- Maya receives the normalized selected locale. All ten locales have a localized safe fallback response; configured AI receives an explicit language instruction.
- Arabic switches the document to RTL. Controls use targeted RTL styling without reversing media playback behavior.
- Published database overrides and missing-key reports have protected storage tables. ADMIN can edit and export translations at `/admin/translations`.
- English fallback never renders a raw translation key; unknown keys receive a readable fallback and are reported.

## Measured repository coverage

- UI TSX files inspected: 54.
- Files using the pre-existing translator before this work: 4.
- Legacy hardcoded JSX candidates measured during the audit: 624 before focused conversion.
- English base catalog: 212 keys.
- Existing Spanish base catalog: 109 keys.
- Existing French, German, and Portuguese base catalogs: 54 keys each.
- New Japanese, Korean, Simplified Chinese, Arabic, and Russian foundation catalogs: 43 keys each.
- Tip/support core domain: all ten locales include the complete nine-option Tip Menu phrase set.

## Route status

| Area | Status | Evidence |
| --- | --- | --- |
| Adult gate | COMPLETE for core gate controls | `components/LiveRoom.tsx`, base locale catalogs |
| Live navigation/status | PARTIAL | Existing keys are translated; legacy live/admin text remains |
| Tip Menu | COMPLETE for menu controls and preset phrases | `components/TipMenu.tsx`, `public/locales/core/*` |
| Maya widget | COMPLETE for controls; PARTIAL for generated subject matter | `components/SupportWidget.tsx`, support API locale prompt |
| Games catalog/play shell | PARTIAL | Catalog, shared shell, controls, instructions, accessibility labels, Slither HUD, pause, leaderboard, and game-over UI are translated; a few canvas-rendered status words and dynamic game messages remain |
| Wallet/Add Coins/access window | PARTIAL | Package selection, balances, refill/resume, and the 25-minute decision screen are translated in all ten locales; payment-method history and account-security copy still contain legacy strings |
| FAQ/legal | PARTIAL | Existing five catalogs are broader; five new locales use English fallback for long-form copy |
| ADMIN | PARTIAL | Translation Manager is protected; legacy ADMIN console remains primarily English |
| Emails/notifications | UNVERIFIED | No complete provider-backed delivery pipeline exists in the repository |
| Database content | PARTIAL | Schema and override transport exist; each dynamic content editor must adopt `content_translations` |

## Dynamic systems that bypassed translation

The audit found hardcoded state messages in `LiveRoom`, game canvas/HUD components, ADMIN routes, payment API response messages, media controls, and support routing. Stable-code localization is now used for the Tip API client path. Remaining systems are recorded as launch debt and must be converted by domain; they are not marked complete.

The wallet/access and shared-games conversions reduced the automated legacy candidate measurement from 995 to 908. The committed ceiling is now 908, so the build fails if future work reverses that reduction.

## Safety and fallback

Language changes do not alter prices, token quantities, wallet balances, access timers, redirects, game scores, or payment identifiers. A missing or failed locale bundle preserves the route and uses English. Missing keys are sent to `/api/i18n/missing` when storage is configured.
