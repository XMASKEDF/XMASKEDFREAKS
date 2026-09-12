# Domain / DNS / Cloudflare Setup

Owner/provider action is required for the production domain. Configure DNS, HTTPS certificates, origin protection, CDN caching, WAF rules, Turnstile if approved, webhook callback URLs, redirect destinations, and email SPF/DKIM/DMARC records.

Do not change DNS automatically from this repository. Test cache headers, signed private-media behavior, realtime behavior, payment callbacks, and `/live` through the real domain before launch.
