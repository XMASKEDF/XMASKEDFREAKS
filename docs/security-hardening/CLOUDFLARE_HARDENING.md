# Cloudflare Production Hardening

Status: **UNVERIFIED — requires the production Cloudflare account and origin details.**

1. Proxy the public hostname through Cloudflare, use Full (strict) TLS, enable HTTPS redirects, and issue an origin certificate.
2. Restrict origin ingress to Cloudflare IP ranges and the deployment provider’s required health channel where practical.
3. Enable managed WAF rules and bot protections. Start new custom rules in log/challenge mode before blocking.
4. Rate-limit Admin login, password reset, support, search, checkout creation, wallet actions, downloads, uploads, analytics, and live-viewer writes separately.
5. Never cache `/admin*`, `/api/admin*`, `/account*`, `/payments*`, wallet/checkout APIs, personalized notifications, or signed downloads.
6. Permit verified provider callbacks and scheduled jobs without browser Origin headers, but retain signature/secret verification and payload limits at the application.
7. Cache immutable static assets only. Purge/revalidate public HTML when maintenance state changes; do not cache `/maintenance` permanently.
8. Alert on origin errors, WAF spikes, Admin-path attacks, callback failures, and rate-limit surges.
9. Verify CSP reports and third-party hosts in staging before narrowing `connect-src`, `media-src`, or `frame-src` further.

The application middleware is defense in depth. It is not a substitute for edge DDoS filtering or a distributed rate-limit store.
