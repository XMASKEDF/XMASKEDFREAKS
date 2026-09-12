# 02 Dependency Bible

## Project Runtime

| Item | Evidence | Status | Notes |
| --- | --- | --- | --- |
| Node.js | `package.json` has no engines; bundled local Node is `v24.14.0` from prior Phase 2 | UNVERIFIED | Production Node version is not pinned. Use an LTS version and add `engines`. |
| Next.js | `package.json` dependency `next: ^14.2.15` | UNVERIFIED | Package not installed locally. |
| React | `react: ^18.3.1`, `react-dom: ^18.3.1` | UNVERIFIED | Package not installed locally. |
| TypeScript | `typescript: ^5.6.3` | UNVERIFIED | Typecheck blocked by missing dependencies. |
| Supabase JS | `@supabase/supabase-js: ^2.45.4` | UNVERIFIED | Package not installed locally. |
| Supabase SSR | `@supabase/ssr: ^0.5.2` | UNVERIFIED | Package not installed locally. |
| bcrypt | `bcryptjs: ^2.4.3` | UNVERIFIED | JS-only dependency avoids native Apple Silicon build issues, but production security review is still required. |

## Package Manager And Lockfiles

| Item | Status | Evidence |
| --- | --- | --- |
| npm | UNVERIFIED | README uses npm commands, but npm was not available in the execution PATH during Phase 2. |
| pnpm | PARTIAL | Bundled `pnpm 11.7.0` was available through the Codex runtime. |
| lockfile | MISSING | No `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, or `bun.lockb` found. |
| `node_modules` | MISSING | No local dependency install exists. |

## npm Packages Required

| Package | Version | Required By | Status |
| --- | --- | --- | --- |
| `next` | `^14.2.15` | `app/*`, API routes, middleware | UNVERIFIED |
| `react` | `^18.3.1` | Components | UNVERIFIED |
| `react-dom` | `^18.3.1` | Next client render | UNVERIFIED |
| `@supabase/ssr` | `^0.5.2` | `lib/supabase/client.ts` | UNVERIFIED |
| `@supabase/supabase-js` | `^2.45.4` | `app/api/stream-settings/route.ts`, `app/api/support/route.ts` | UNVERIFIED |
| `bcryptjs` | `^2.4.3` | `lib/admin-auth.ts` | UNVERIFIED |
| `typescript` | `^5.6.3` | `npm run typecheck` | UNVERIFIED |
| `eslint` | `^8.57.1` | `npm run lint` | UNVERIFIED |
| `eslint-config-next` | `^14.2.15` | Next lint config | UNVERIFIED |
| `@types/node` | `^22.7.5` | TypeScript Node types | UNVERIFIED |
| `@types/react` | `^18.3.11` | TypeScript React types | UNVERIFIED |
| `@types/react-dom` | `^18.3.0` | TypeScript React DOM types | UNVERIFIED |

## Native Packages

No native npm packages are declared. `bcryptjs` is JavaScript-only. Apple Silicon compatibility is therefore **UNVERIFIED but no native build risk is visible in `package.json`**.

## Stripe

Status: **MISSING**

No `stripe` package, Stripe env variables, webhook route, checkout route, customer portal route, or Stripe metadata model exists in the repository.

## Cloudflare

Status: **PARTIAL / UNVERIFIED**

Evidence exists only as:

- `lib/config.ts` video provider type includes `cloudflare`.
- `resolveVideoSource` can build a Cloudflare Stream HLS URL.
- Middleware reads Cloudflare headers such as `cf-connecting-ip` and `cf-ipcountry`.

No DNS, Workers, Pages, R2, Turnstile, WAF, cache rule, or deployment configuration exists.

## X Integration

Status: **MISSING**

Evidence exists only as referral classification in `lib/geo.ts`. There is no X OAuth, posting, callback, media upload, or API package.

## CLI Tools And Code Generators

| Tool | Status | Notes |
| --- | --- | --- |
| Supabase CLI | MISSING | No config or migrations directory. |
| Stripe CLI | MISSING | No webhook testing configuration. |
| Cloudflare Wrangler | MISSING | No `wrangler.toml`. |
| Prisma/codegen | MISSING | No code generator found. |
| Vercel CLI/config | MISSING | No `vercel.json`. |

