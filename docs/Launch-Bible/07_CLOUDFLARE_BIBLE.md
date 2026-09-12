# 07 Cloudflare Bible

Status: **MISSING / PARTIAL**

## Evidence Present

- `lib/config.ts` includes `cloudflare` as a video provider and builds Cloudflare Stream HLS URLs.
- `middleware.ts` reads `cf-connecting-ip` and `cf-ipcountry`.
- Cost config mentions Cloudflare WAF/bot checks.

## Missing Cloudflare Production Items

| Area | Status | Notes |
| --- | --- | --- |
| Domain DNS | MISSING | No DNS configuration in repo. |
| SSL/TLS | MISSING | No Cloudflare SSL config evidence. |
| Cache rules | MISSING | No cache rules or headers policy. |
| Workers | MISSING | No worker source or `wrangler.toml`. |
| Pages | MISSING | No Pages deployment config. |
| Turnstile | MISSING | No package, env, or component. |
| Firewall/WAF | MISSING | Middleware exists, but no Cloudflare rule export/config. |
| R2 | MISSING | No R2 bucket config or SDK. |
| DDoS mitigation | UNVERIFIED | Must be configured in Cloudflare dashboard. |
| Image/media optimization | UNVERIFIED | No config evidence. |

## Launch Requirements

1. Point `XMASKEDFREAKS.COM` DNS to the deployment target.
2. Enable SSL full strict.
3. Add WAF and bot rules for admin/API routes.
4. Add Turnstile or equivalent to admin login/setup and sensitive public forms.
5. Configure cache bypass for authenticated/admin/payment/API routes.
6. Configure cache for static assets only.
7. Verify `cf-connecting-ip` and `cf-ipcountry` headers are trusted only behind Cloudflare.
8. Add incident rollback DNS procedure.

