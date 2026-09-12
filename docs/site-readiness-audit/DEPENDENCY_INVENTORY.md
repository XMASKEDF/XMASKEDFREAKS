# Dependency Inventory

## Package Manager

Status: **BLOCKED**

No lockfile was found. The README and scripts imply npm, but npm is not available in the current shell. The next maintainer should use npm unless a different package manager is deliberately chosen, then commit the generated lockfile.

Recommended first install command:

```bash
npm install
```

Required follow-up:

```bash
npm run typecheck
npm run lint
npm run build
```

## Runtime Dependencies

| Package | Version | Purpose | License / Cost Notes | Risk |
| --- | --- | --- | --- | --- |
| `next` | `^14.2.15` | App framework, routing, API routes, middleware | Open-source, MIT | Must lock exact version and run build. |
| `react` | `^18.3.1` | UI runtime | Open-source, MIT | Standard. |
| `react-dom` | `^18.3.1` | React DOM rendering | Open-source, MIT | Standard. |
| `@supabase/supabase-js` | `^2.45.4` | Server/client Supabase API | Open-source, MIT; hosted Supabase may cost money | Service-role use must stay server-only. |
| `@supabase/ssr` | `^0.5.2` | Browser/server auth client support | Open-source, MIT | Verify auth flow after install. |
| `bcryptjs` | `^2.4.3` | Admin password hashing | Open-source, MIT | JS bcrypt is acceptable for setup prototype; consider native/Argon2 for hardened production. |

## Development Dependencies

| Package | Version | Purpose | Risk |
| --- | --- | --- | --- |
| `typescript` | `^5.6.3` | Type checking | Cannot run without install. |
| `eslint` | `^8.57.1` | Linting | Version is older major; acceptable if locked, but consider upgrade planning. |
| `eslint-config-next` | `^14.2.15` | Next lint rules | Must match Next major. |
| `@types/node` | `^22.7.5` | Node types | Bundled runtime observed as Node 24; production should pin supported Node LTS. |
| `@types/react` | `^18.3.11` | React types | Standard. |
| `@types/react-dom` | `^18.3.0` | React DOM types | Standard. |

## Import Scan

External imports found in source are covered by package dependencies or Node built-ins:

- `next`, `next/server`, `next/headers`, `next/navigation`
- `react`
- `@supabase/ssr`
- `@supabase/supabase-js`
- `bcryptjs`
- Node built-in `crypto`

No missing external package import was detected by static scan.

## Dependency Policy Finding

The project already includes `OPEN_SOURCE_POLICY.md` and `DEPENDENCY_REVIEW_TEMPLATE.md`. Those documents should become part of the development process before adding Stripe, email, exchange-rate, analytics, monitoring, or video-provider SDKs.

## Required Before Launch

1. Choose package manager.
2. Generate lockfile.
3. Install dependencies.
4. Run typecheck/lint/build.
5. Run dependency audit after lockfile exists.
6. Document every new paid provider using `DEPENDENCY_REVIEW_TEMPLATE.md`.

