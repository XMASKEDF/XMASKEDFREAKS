# Environment Variable Matrix

`.env.example` was updated with placeholders only. No real secrets were written.

## Required For Core App

| Variable | Used By | Required | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase browser/server clients, middleware, API routes | Yes | Public project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser Supabase client | Yes | Public anon key; enforce RLS. |
| `NEXT_PUBLIC_SITE_URL` | Deployment/site references | Yes | Set to production domain. |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin auth, logging, server API routes | Yes | Server-only. Never expose to browser. |
| `ADMIN_SETUP_SECRET` | First admin setup | Yes | Long random secret; rotate after setup if possible. |

## AI / Support

| Variable | Used By | Required | Notes |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | `/api/support` | Optional for demo, required for AI support | Empty value falls back to local canned replies. |
| `OPENAI_SUPPORT_MODEL` | `/api/support` | Optional | Defaults to `gpt-4.1-mini`. |
| `CLAUDE_API_KEY` | `/api/claude/control` | Optional for fallback, required for real Claude control | Server-only. |
| `ANTHROPIC_API_KEY` | `/api/claude/control` | Optional alternate | Server-only. |
| `CLAUDE_CONTROL_MODEL` | `/api/claude/control` | Optional | Defaults to `claude-3-5-sonnet-latest`. Verify current model before production. |
| `SUPPORT_ESCALATION_ENDPOINT` | `/api/support` | Optional | Webhook/email bridge endpoint. |
| `ADMIN_SUPPORT_EMAIL` | `/api/support` | Recommended | Admin support destination. |
| `DEPOSIT_ALERT_EMAIL` | `/api/support` fallback | Recommended | Deposit/support alert fallback. |

## Live / Redirect

| Variable | Used By | Required | Notes |
| --- | --- | --- | --- |
| `OBS_LIVE` | `/go`, live notification API | Required if no status endpoint | Manual boolean fallback. |
| `OBS_STREAM_ACTIVE` | `/go` | Optional | Second manual boolean fallback. |
| `OBS_STATUS_ENDPOINT` | `/go` | Required for production automation | Must return JSON with `live`, `active`, or `streaming` true. |
| `NOTIFICATION_SANDBOX_STREAM_ACTIVE` | `/api/live-notifications` | Optional | Test-only flag. |
| `FANSLY_URL` | `/go`, access redirects | Yes | Offline destination. |
| `CLIPS4SALE_URL` | `/go`, access redirects | Yes | Offline destination. |
| `REDIRECT_OVERRIDE_URL` | Existing env placeholder | Optional | Currently not read by `/go`; keep only if future route uses it. |
| `REDIRECT_MANUAL_DESTINATION` | `/go` | Optional | `automatic`, `clips4sale`, or `fansly`. |
| `REDIRECT_CLIPS_PERCENT` | `/go` | Yes | Default `60`. |
| `REDIRECT_OFFLINE_BLOCKS` | `/go` | Optional | JSON array of offline routing blocks. |

## Payments / Geo / Security

| Variable | Used By | Required | Notes |
| --- | --- | --- | --- |
| `PAYMENT_STEP_UP_AMOUNT` | `/api/payments` | Recommended | Additional verification threshold. |
| `PAYMENT_RISK_THRESHOLD` | `/api/payments` | Recommended | Risk score threshold. |
| `GEO_IP_HASH_SALT` | `/api/geo` | Yes for production | Replace local fallback to avoid predictable hashes. |
| `SECURITY_WHITELIST_IPS` | `middleware.ts` | Optional | Comma-separated allow list. |
| `SECURITY_BLACKLIST_IPS` | `middleware.ts` | Optional | Comma-separated block list. |
| `SECURITY_BLACKLIST_COUNTRIES` | `middleware.ts` | Optional | Comma-separated country codes. |
| `SECURITY_BLACKLIST_USER_AGENTS` | `middleware.ts` | Optional | Comma-separated user-agent tokens. |

## Missing Provider Env

No real payment processor, email provider, exchange-rate provider, video CDN, analytics, or error-monitoring credentials are referenced by code today. That means those integrations are not production-wired yet. Add only after selecting providers and documenting them under the open-source/cost policy.

## Count

Previously missing from `.env.example`: **17** variables.  
Missing from `.env.example` after update for variables currently read by code: **0**.

