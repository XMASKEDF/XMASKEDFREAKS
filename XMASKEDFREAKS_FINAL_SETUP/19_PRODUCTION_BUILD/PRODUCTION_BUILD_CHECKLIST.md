# Production Build Checklist

Use only Node `20.20.2`, Corepack pnpm `10.12.1`, and this repository.

1. Confirm no production build or second dev server occupies required ports.
2. Confirm environment presence without printing values.
3. `corepack pnpm install --frozen-lockfile`
4. `corepack pnpm typecheck`
5. `corepack pnpm lint`
6. Run focused and required test suites.
7. `corepack pnpm build`
8. Confirm `.next-production/BUILD_ID` exists and run the style postcheck.
9. Start only the built server when ready; keep port 3001 free.
10. Smoke-test `/`, `/live`, `/merch`, `/games`, `/wallet`, `/admin`, payment-disabled behavior, CSS/JS assets, and health endpoints.

The build must not be made successful by disabling lint, typechecking, or security checks.
