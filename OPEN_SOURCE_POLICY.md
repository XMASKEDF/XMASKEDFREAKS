# Open-Source-First And Cost-Efficient Development Policy

This platform uses an open-source-first, cost-aware development policy. The goal is to keep XMASKEDFREAKS fast, secure, maintainable, scalable, and visually polished while minimizing recurring costs and unnecessary technical complexity.

## Default Decision Order

1. Use native browser capabilities, Next.js features, server-side code, CSS, or existing project dependencies when they solve the problem safely.
2. If a dependency is needed, prefer a well-maintained open-source package with a permissive license such as MIT, Apache 2.0, or BSD.
3. If a hosted service is needed, prefer modular provider-agnostic integration boundaries so the service can be replaced later.
4. Use paid services only when they are necessary for reliability, security, performance, compliance, scale, or user experience.

Do not choose the cheapest option when it reduces reliability, security, performance, accessibility, or user experience.

## New Dependency Review

Every new dependency must have a clear purpose and a short review covering:

- Package name
- Feature or problem solved
- License
- Maintenance status and release activity
- Documentation quality
- Security considerations and known advisories
- Approximate bundle/runtime impact
- Whether it duplicates an existing dependency
- Whether it is free, open-source, commercial, or dual-licensed
- Why it was chosen
- Removal or replacement plan

Avoid abandoned packages, duplicate libraries, large packages for tiny features, and packages that make the app harder to audit.

## Paid Service Review

Before introducing any paid API, hosted service, or commercial integration, document:

- Why the service is necessary
- Open-source or free alternatives considered
- Expected monthly cost
- Pricing model
- Usage limits and free-tier limits
- Scaling risks
- Vendor-lock-in concerns
- Security/compliance concerns
- Failure mode if the service is down
- Steps required to replace it later

Free tiers may be used for production testing only when their limits will not disrupt the platform unexpectedly.

## Current Dependency Snapshot

| Package | Purpose | License / Cost Note | Policy Status |
| --- | --- | --- | --- |
| Next.js | Application framework | Open-source framework, verify current license during upgrades | Approved core dependency |
| React / React DOM | UI rendering | Open-source, verify current license during upgrades | Approved core dependency |
| Supabase JS / SSR | Auth/database client | Open-source client; hosted Supabase may create service costs | Approved, keep provider boundary modular |
| bcryptjs | Password/PIN hashing scaffold | Open-source package, low bundle concern when server-side | Approved server-side utility |
| TypeScript / ESLint | Development quality | Development-only tooling | Approved dev dependencies |

## Operating Rules

- Run dependency audits regularly.
- Remove unused packages.
- Keep provider secrets server-side only.
- Never expose private API keys, banking details, full card numbers, CVV, or unencrypted payment credentials.
- Keep costs visible in the admin Cost Dashboard.
- Keep integrations replaceable through small config/API boundaries.
