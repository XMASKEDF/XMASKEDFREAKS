# External Services Checklist

Status: **NOT PRODUCTION WIRED**

## Services Required Before Launch

| Service | Current Code State | Launch Need | Status |
| --- | --- | --- | --- |
| Supabase Auth/Database | Client/server code and SQL schema present | Real project, keys, schema applied, RLS verified | Blocking |
| Payment processor | Generic validation endpoint only | Hosted fields/tokenization, webhooks, idempotency, disputes/refunds | Blocking |
| Email delivery | Live notification API returns estimates only | Provider, unsubscribe, suppression, delivery logs | Blocking |
| OBS live-status source | Env/status endpoint support exists | Reliable endpoint or signed server callback | Blocking |
| Video streaming provider | Mux/Bunny/Cloudflare config UI exists | Choose provider, playback URLs, signed/protected delivery if needed | High |
| CDN/WAF/DDoS | Middleware scaffolding exists | Cloudflare or equivalent in front of app | High |
| AI providers | OpenAI/Claude routes exist | Keys, budget limits, logging, approval boundaries | High |
| Exchange rates | Static demo rates | Real provider and cache policy | High |
| Storage/media | No upload pipeline verified | Secure playlist/banner/video storage | High |
| Analytics/monitoring | Database tables and dashboard cards | Error monitoring, uptime, performance telemetry | High |

## Do Not Launch Paid Traffic Until

1. Payment processor is wired end to end in test mode.
2. Webhook signatures and idempotency are verified.
3. Email opt-in/unsubscribe compliance is verified.
4. OBS live detection is reliable and not manually guessed.
5. CDN/WAF is configured before origin traffic.
6. Supabase service-role key is never exposed client-side.

