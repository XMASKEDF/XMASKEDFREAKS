# Global Style Loading Recovery

Date verified: 2026-07-20

## Outcome

The intermittent raw-HTML presentation was reproduced, traced, and repaired. The authoritative stylesheet was not missing and did not contain a compilation failure. The failure was caused by development and production processes sharing `.next`: a production build replaced generated chunks while an older development server continued serving HTML and runtime data that referenced the previous CSS hash. Requests for that deleted stylesheet returned `404`, leaving the browser with structurally correct HTML and no application styling.

## Evidence

| Check | Result |
| --- | --- |
| Authoritative App Router | `app/` only; no competing `src/app` or Pages Router |
| Global stylesheet import | `app/layout.tsx` imports `./globals.css` exactly once |
| CSS compilation | Production CSS chunk generated and post-build validation passed |
| Tailwind/PostCSS | Not used by this application; no missing Tailwind pipeline |
| Service worker | None found; no service-worker stylesheet interception |
| Asset prefix/base path | None configured; generated asset URLs remain root-relative |
| Theme/provider shell | Preserved in the root layout |
| Browser symptom | Stale HTML/runtime requested a deleted generated CSS hash |
| Contributing state | Multiple generated build trees and an orphaned process on port 3000 |

## Permanent Corrections

1. Development now writes to `.next-development`.
2. Production build and start now use `.next-production`.
3. A managed development launcher records the active process and prevents duplicate dev servers.
4. Production builds refuse to run while the managed development server is active. This prevents a long build from destabilizing a live local preview even though its chunks are isolated.
5. Generated `.next*` directories and the local PID marker are ignored by source control.
6. The root layout retains one unconditional global CSS import and a stable `background-ui-layer` above the Matrix renderer.
7. Base CSS provides a black, readable fallback before advanced styling or the Matrix canvas initializes.
8. Development mode checks the CSS sentinel, shell style, and stylesheet load failures and reports a focused diagnostic without creating a reload loop.
9. Production builds fail if the root layout does not emit a CSS chunk containing the required design tokens and black background.
10. A styled global error boundary remains usable even if the normal stylesheet cannot load.

## Files Changed

- `app/layout.tsx`
- `app/globals.css`
- `app/global-error.tsx`
- `components/StyleHealthCheck.tsx`
- `components/background/GlobalBackgroundClient.tsx`
- `components/background/BackgroundProvider.tsx`
- `lib/global-error-copy.ts`
- `next.config.mjs`
- `package.json`
- `tsconfig.json`
- `.gitignore`
- `scripts/dev-server.mjs`
- `scripts/assert-no-dev-server.mjs`
- `scripts/check-style-build.mjs`
- `tests/style-integrity.test.mjs`

## Verification Results

| Verification | Result |
| --- | --- |
| `pnpm run test:styles` | PASS, 5/5 |
| `pnpm run typecheck` | PASS |
| `pnpm run lint` | PASS, zero warnings |
| `pnpm run build` | PASS, 49 routes |
| Production CSS integrity check | PASS |
| `/` | 200 |
| `/games` | 200 |
| `/games/slither` | 200 |
| `/audio-clips` | 200 |
| `/admin/login` | 200 |
| `/admin/setup` | 200 |
| `/sandbox` | 200 |
| `/admin` while signed out | 307 to protected login flow |

Chromium browser checks confirmed a black body, loaded design token `--green: #7dff9b`, one Matrix canvas, a styled application shell, no horizontal overflow at desktop or 375px mobile width, and no hydration error. A forced Matrix renderer failure left the application shell and content usable.

Safari desktop and iOS Safari remain **UNVERIFIED** in this environment. They require device/browser testing before public launch.

## Operating Procedure

- Use `pnpm run dev` for the local preview at `http://localhost:3000`.
- Stop the local preview before `pnpm run build`; the prebuild guard intentionally blocks concurrent production builds.
- Use `pnpm run start` only after a successful production build.
- Do not manually point development and production at the same `NEXT_DIST_DIR`.
- If styling is ever suspected, run `pnpm run test:styles`, inspect stylesheet requests for `404`, and confirm only one managed local server owns port 3000.

## Remaining Launch Context

The style-loading regression is resolved. This does not change the broader launch-readiness decision: payment, authorization, administrator 2FA, paid-access enforcement, migration, and production infrastructure blockers documented elsewhere still prevent public launch.
