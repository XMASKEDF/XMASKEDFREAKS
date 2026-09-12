# Deployment Setup

Required runtime: Node `20.20.2`, Corepack pnpm `10.12.1`. Use `corepack pnpm` only. Do not upgrade Node to satisfy a command.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test:infrastructure
corepack pnpm test:security
corepack pnpm build
corepack pnpm start
```

The production build must not compete with an active development server. Verify deployment health, release version, rollback target, environment secrets, and migrations before promotion.
