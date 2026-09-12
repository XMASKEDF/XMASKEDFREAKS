# 03 Environment Bible

Source: `.env.example` and `process.env` usage.

## Required Server Only

| Variable | Purpose | Example Placeholder | Where Used | Risk | Verification Method |
| --- | --- | --- | --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase writes/admin REST access | `replace-with-server-only-service-role-key` | `middleware.ts`, `lib/admin-auth.ts`, API routes | Critical | Confirm never bundled client-side; test server routes. |
| `ADMIN_SETUP_SECRET` | First admin creation gate | `replace-with-long-random-setup-secret` | `lib/admin-auth.ts`, `app/admin/setup/page.tsx` | Critical | Create first admin once; confirm setup locks after admin exists. |
| `ADMIN_DEV_AUTH_ENABLED` | Enables the authenticated local development account only outside production | `false` | `lib/admin-dev-bypass.ts`, `lib/admin-auth.ts` | Critical | Confirm production rejects the development path. |
| `ADMIN_DEV_EMAIL` | Development administrator identifier | `owner@example.com` | `lib/admin-auth.ts` | High | Keep in ignored local server env only. |
| `ADMIN_DEV_PASSWORD_HASH` | bcrypt hash for the development administrator; never plaintext | bcrypt placeholder | `lib/admin-auth.ts` | Critical | Verify bcrypt login and confirm no client bundle reference. |
| `ADMIN_DEV_SESSION_SECRET` | HMAC signing key for development admin sessions | 32+ random characters | `lib/admin-auth.ts` | Critical | Confirm tampered session tokens fail. |
| `ADMIN_DEVICE_SALT` | Salt for privacy-conscious administrator device hashes | random placeholder | `lib/admin-auth.ts` | High | Rotate per environment and verify raw fingerprint is not exposed. |
| `ADMIN_DEV_EMAIL_2FA` | Development-only 2FA switch; default disabled | `false` | `lib/admin-auth.ts` | High | Keep false until database and email delivery are connected. |
| `GEO_IP_HASH_SALT` | Hash IP/device signals | `replace-with-long-random-geo-hash-salt` | `app/api/geo/route.ts` | High | Confirm non-default salt in production. |

## Required Public

| Variable | Purpose | Example Placeholder | Where Used | Risk | Verification Method |
| --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public Supabase project URL | `https://your-project.supabase.co` | Supabase clients, middleware, server routes | High | Browser and server Supabase smoke tests. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key | `replace-with-supabase-anon-key` | `lib/supabase/client.ts` | High | RLS access tests from browser. |
| `NEXT_PUBLIC_SITE_URL` | Site base URL | `http://localhost:3000` | Env template only in current code | Medium | Confirm production URL in env. |

## Live And Redirect

| Variable | Purpose | Example Placeholder | Where Used | Risk | Verification Method |
| --- | --- | --- | --- | --- | --- |
| `OBS_STATUS_ENDPOINT` | Server-readable live status | `https://your-obs-status-endpoint.example/status` | `app/go/route.ts` | Critical | Confirm endpoint returns active JSON and `/go` routes live. |
| `OBS_LIVE` | Manual live boolean fallback | `false` | `app/go/route.ts`, `app/api/live-notifications/route.ts` | High | Toggle in staging and verify behavior. |
| `OBS_STREAM_ACTIVE` | Secondary manual live boolean | `false` | `app/go/route.ts` | High | Toggle in staging. |
| `NOTIFICATION_SANDBOX_STREAM_ACTIVE` | Notification test flag | `false` | `app/api/live-notifications/route.ts` | Medium | Keep false in production unless testing. |
| `FANSLY_URL` | Offline redirect destination | `https://fansly.com/your-profile` | `app/go/route.ts` | High | Verify legal configured URL. |
| `CLIPS4SALE_URL` | Offline redirect destination | `https://www.clips4sale.com/studio/your-studio-id/your-studio` | `app/go/route.ts` | High | Verify legal configured URL. |
| `REDIRECT_MANUAL_DESTINATION` | Force offline route | `automatic` | `app/go/route.ts` | Medium | Test `automatic`, `clips4sale`, `fansly`. |
| `REDIRECT_CLIPS_PERCENT` | Offline split | `60` | `app/go/route.ts` | Medium | Test deterministic bucket distribution. |
| `REDIRECT_OFFLINE_BLOCKS` | Offline schedule JSON | JSON array | `app/go/route.ts` | Medium | Validate JSON parse in staging. |
| `REDIRECT_OVERRIDE_URL` | Reserved placeholder | empty | Not used by current code | Low | Remove or implement before relying on it. |

## AI And Support

| Variable | Purpose | Example Placeholder | Where Used | Risk | Verification Method |
| --- | --- | --- | --- | --- | --- |
| `OPENAI_API_KEY` | Visitor support AI | `replace-with-openai-api-key-or-leave-empty` | `app/api/support/route.ts` | Medium | Confirm no secret appears in client bundle/logs. |
| `OPENAI_SUPPORT_MODEL` | Support model name | `gpt-4.1-mini` | `app/api/support/route.ts` | Medium | Verify model availability before launch. |
| `CLAUDE_API_KEY` | Claude control key | placeholder | `app/api/claude/control/route.ts` | High | Test admin-only route. |
| `ANTHROPIC_API_KEY` | Alternate Claude key | placeholder | `app/api/claude/control/route.ts` | High | Test admin-only route. |
| `CLAUDE_CONTROL_MODEL` | Claude model name | `claude-3-5-sonnet-latest` | `app/api/claude/control/route.ts` | Medium | Verify current model before launch. |
| `SUPPORT_ESCALATION_ENDPOINT` | Escalation webhook | empty | `app/api/support/route.ts` | Medium | Test delivery. |
| `ADMIN_SUPPORT_EMAIL` | Support destination metadata | `admin@example.com` | `app/api/support/route.ts` | Medium | Verify real mailbox. |
| `DEPOSIT_ALERT_EMAIL` | Fallback support/deposit email | `admin@example.com` | `app/api/support/route.ts` | Medium | Verify real mailbox. |
| `EMAIL_API_URL` | Approved transactional email endpoint for admin 2FA and password reset | provider endpoint | `lib/email/provider.ts` | Critical | Complete a staging login and reset delivery test. |
| `EMAIL_API_KEY` | Server-only transactional email credential | secret placeholder | `lib/email/provider.ts` | Critical | Secret scan and provider delivery test. |
| `EMAIL_FROM` | Verified sender for security email | `XMASKEDFREAKS <security@example.com>` | `lib/email/provider.ts` | High | Confirm domain authentication and inbox delivery. |

## Payments

| Variable | Purpose | Example Placeholder | Where Used | Risk | Verification Method |
| --- | --- | --- | --- | --- | --- |
| `PAYMENT_STEP_UP_AMOUNT` | Verification threshold | `75` | `app/api/payments/route.ts` | High | Test quote response. |
| `PAYMENT_RISK_THRESHOLD` | Risk threshold | `70` | `app/api/payments/route.ts` | High | Test quote response. |

## Provider-Hosted Checkout

| Variable | Purpose | Example | Used by | Risk | Verification |
| --- | --- | --- | --- | --- | --- |
| `APP_URL` | Canonical origin for payment return URLs | `https://example.com` | hosted initiation | High | Confirm HTTPS production origin. |
| `PAYMENT_PROVIDER` | Selects `disabled`, `test`, `segpay`, or `ccbill` | `disabled` | provider adapter | Critical | Must remain disabled until approved integration tests pass. |
| `PAYMENT_DISABLED_CUSTOMER_MODE` | Safe unavailable presentation | `setup_in_progress` | customer state | Low | Inspect wallet checkout. |
| `PAYMENT_TEST_SECRET` | Development-only callback HMAC | random 24+ chars | test adapter | Critical | Never expose publicly or enable test provider in production. |
| `SEGPAY_MERCHANT_ID` | Reserved server-only Segpay merchant identifier | empty | `lib/payments/segpay.ts` placeholder | Critical | UNVERIFIED until official merchant documentation is supplied. |
| `SEGPAY_PRODUCT_CODE` | Reserved server-only Segpay package/product code | empty | `lib/payments/segpay.ts` placeholder | High | UNVERIFIED; use only approved provider catalog values. |
| `SEGPAY_HOSTED_CHECKOUT_URL` | Reserved server-only Segpay hosted checkout origin | empty | `lib/payments/segpay.ts` placeholder | Critical | UNVERIFIED; never place in browser configuration. |
| `SEGPAY_POSTBACK_SECRET` | Reserved server-only Segpay callback verification secret | empty | Segpay callback placeholder | Critical | UNVERIFIED; callback signing rules must be confirmed. |
| `SEGPAY_RETURN_URL` | Reserved server-only Segpay return URL | empty | `lib/payments/segpay.ts` placeholder | High | Confirm HTTPS production origin before activation. |
| `CCBILL_ACCOUNT_NUMBER` | Reserved server-only CCBill account identifier | empty | `lib/payments/ccbill.ts` placeholder | Critical | UNVERIFIED until official merchant documentation is supplied. |
| `CCBILL_SUBACCOUNT_NUMBER` | Reserved server-only CCBill sub-account identifier | empty | `lib/payments/ccbill.ts` placeholder | Critical | UNVERIFIED; never place in browser configuration. |
| `CCBILL_FLEXFORM_ID` | Reserved server-only CCBill hosted-form identifier | empty | `lib/payments/ccbill.ts` placeholder | High | UNVERIFIED until the approved hosted flow is selected. |
| `CCBILL_API_BASE_URL` | Reserved server-only CCBill API origin | empty | `lib/payments/ccbill.ts` placeholder | Critical | UNVERIFIED; validate against official documentation. |
| `CCBILL_WEBHOOK_SECRET` | Reserved server-only CCBill callback verification secret | empty | CCBill callback placeholder | Critical | UNVERIFIED; callback signing rules must be confirmed. |
| `CCBILL_RETURN_URL` | Reserved server-only CCBill return URL | empty | `lib/payments/ccbill.ts` placeholder | High | Confirm HTTPS production origin before activation. |

All Segpay/CCBill values are **UNVERIFIED placeholders** and do not activate a provider. `PAYMENT_PROVIDER=disabled` remains the production-safe default.

## Middleware Security

| Variable | Purpose | Example Placeholder | Where Used | Risk | Verification Method |
| --- | --- | --- | --- | --- | --- |
| `SECURITY_WHITELIST_IPS` | Allow list | empty comma list | `middleware.ts` | High | Test with known IPs. |
| `SECURITY_BLACKLIST_IPS` | IP block list | empty comma list | `middleware.ts` | High | Test block response. |
| `SECURITY_BLACKLIST_COUNTRIES` | Country block list | empty comma list | `middleware.ts` | High | Requires trusted country header/CDN. |
| `SECURITY_BLACKLIST_USER_AGENTS` | Bot UA block list | empty comma list | `middleware.ts` | Medium | Test user-agent rule. |

## Environment Groups

| Environment | Required State |
| --- | --- |
| Development | Supabase dev project or local fallback; AI/payment/email can stay empty if not testing. |
| Testing | Separate Supabase project, fake/test payment provider once implemented, sandbox OBS status endpoint. |
| Staging | Mirrors production env names with test credentials and real CDN/WAF. |
| Production | All critical env values populated, secret-scanned, rotated, and verified. |

## Provider Configuration Batch 1

The Admin Infrastructure Center reports configuration-only status for these existing provider variables. It never displays values or treats configuration as a successful live health check.

| Variable | Provider | Visibility | Requirement | Current local status |
| --- | --- | --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare edge/WAF | Server-only | Required | Missing |
| `CDN_PROVIDER` | Cloudflare CDN | Server-only | Required for Cloudflare delivery | Missing |
| `CDN_PUBLIC_BASE_URL` | Cloudflare CDN | Public URL | Required for CDN delivery | Missing |
| `CDN_PURGE_URL` | Cloudflare CDN | Server-only | Optional targeted purge | Missing |
| `CDN_PURGE_TOKEN` | Cloudflare CDN | Server-only | Optional targeted purge | Missing |
| `STREAM_HEALTH_URL` | Streaming provider | Server-only | Required | Missing |
| `STREAM_PLAYBACK_BASE_URL` | Streaming provider | Public playback base | Required | Missing |
| `PRINTIFY_INTEGRATION_MODE` | Printify | Server-only | Required (`disabled`, `test`, or `live`) | Missing; remains disabled |
| `PRINTIFY_API_TOKEN` | Printify | Server-only | Required | Missing |
| `PRINTIFY_SHOP_ID` | Printify | Server-only | Required | Missing |
| `PRINTIFY_WEBHOOK_SECRET` | Printify | Server-only | Required | Missing |
| `CRON_SECRET` | Scheduled Printify jobs | Server-only | Required | Missing |
| `EMAIL_API_URL` | Approved email provider | Server-only | Required | Missing |
| `EMAIL_API_KEY` | Approved email provider | Server-only | Required | Missing |
| `EMAIL_FROM` | Approved email provider | Server-only | Required | Missing |

Batch 1 status is **PROVIDER CONFIG PENDING**. No Cloudflare operation, Printify order, production email, or payment settlement is enabled by this documentation or status summary.
