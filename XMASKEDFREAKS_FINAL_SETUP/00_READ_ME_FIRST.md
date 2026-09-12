# XMASKEDFREAKS Final Setup Kit

This folder is the owner’s final setup and launch-readiness manual. It collects the exact external configuration, migration, permission, provider, testing, and launch work still required by the repository.

## Current State

The application contains the Next.js site, Admin routes, provider-neutral adapters, wallet/tip/commerce foundations, security controls, games, reliability tooling, and migrations. Local development uses Node `20.20.2` and Corepack pnpm `10.12.1`.

The repository does not contain production secrets. Supabase, payment settlement, email delivery, WAF/Turnstile, Redis, streaming, backup, deployment, and external monitoring remain configuration-dependent. Some Admin command cards still need operational work before they can be called fully real.

## Completion Order

1. **Repository permissions**: verify normal owner write access for generated caches; current local verification is green.
2. **Supabase**: configure public URL/anon key and server-only service role key.
3. **Database migrations**: back up, apply in order, and verify each migration in staging first.
4. **Core infrastructure providers**: storage, CDN, cache, WAF, streaming, backups, workers, monitoring.
5. **Payment/email**: complete approved processor and email-provider onboarding.
6. **Admin operationalization**: finish the remaining partial/display-only tools listed in section 12.
7. **Production verification**: complete the technical checks in section 19, using an isolated build when the development server is active; track remote migration, deployment, and processor review gates separately. The current local/code verification is technically green; remote access and deployment configuration remain owner-gated.
8. **Enable real commerce**: only after provider webhooks, reconciliation, fraud controls, and rollback tests pass.

Never place secrets, payment credentials, bank information, or private tokens in this folder.

## README Item #7 - Blocker Clearance

### Technical verification

- Node `20.20.2` and Corepack pnpm `10.12.1` are verified.
- Typecheck, lint, i18n checks, the relevant infrastructure/application suites, and the readiness/security suites pass.
- Local Supabase reset applied all 52 local migrations through `20260911130000_remaining_integrations`. The missing `supabase/seed.sql` message is a non-fatal warning because no seed file is required for this verification.
- The production build passed in an isolated copy using the same source and dependency tree. The isolated `.next-production/BUILD_ID` was produced and the generated global CSS postcheck passed. The active development server was not stopped.
- Public route and browser smoke checks show the real styled site, including the age gate, Live UI, navigation, and storefront routes. No raw HTML, hydration, or application-error state was observed in the checked routes.

### External production configuration

- `npx supabase@2.116.0` is available as a development tool through a temporary local cache. Remote migration listing and `db push --dry-run` require `SUPABASE_ACCESS_TOKEN`; no token was supplied and no remote operation was attempted.
- The documented deployment path is Vercel (see the root README), but no Vercel project, production environment, domain/DNS/TLS setup, CDN/WAF, durable queue/cache, monitoring, backup/PITR, or external media-processing configuration is connected in this workspace. These remain owner/provider setup items, not application-code failures.
- `README ITEM #7 TECHNICAL STATUS: GREEN` for the current source, local migrations, isolated production artifact, and review-site plan. Remote migration history is explicitly owner-blocked until `SUPABASE_ACCESS_TOKEN` is supplied; no remote operation has been attempted.
- The public review site can be deployed with payment processing disabled after the Vercel project, production environment, reviewed migration application, canonical HTTPS URL, and required public-content smoke checks are supplied.

### Processor review requirements

- Payment settlement remains disabled and fail-closed. CCBill and Segpay remain `AWAITING APPROVAL` / `AWAITING PROCESSOR CONNECTION`.
- Resend, storage/CDN, and Live/OBS may remain disabled for an initial public review deployment where the existing safe fallback is acceptable. Their production activation still requires the corresponding owner/provider configuration.
- README item #8, real commerce activation, remains intentionally deferred.

## Action Labels

- **OWNER ACTION**: obtain approval, account access, or a secret and place it in the approved secret manager.
- **PROVIDER ACTION**: approve the merchant account, webhook, domain, or service configuration.
- **CODEX ACTION**: run repository checks, connect an already-supported configuration, or implement a documented missing tool.
- **AUTOMATIC SYSTEM ACTION**: runtime behavior that occurs after configuration and verification.
