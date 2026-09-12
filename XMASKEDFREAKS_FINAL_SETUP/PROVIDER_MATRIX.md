# Provider Matrix

| System | Provider | Adapter exists? | Selected? | Account required? | Credentials required? | Current status | Next owner action |
|---|---|---:|---:|---:|---:|---|---|
| Database/auth | Supabase | Yes | No evidence | Yes | Yes | YELLOW | Configure Supabase |
| Payments | Segpay | Yes, inactive | No | Yes | Yes | RED | Obtain approval and docs |
| Payments | CCBill | Yes, inactive | No | Yes | Yes | RED | Obtain approval and docs |
| Email | Existing HTTP email adapter | Yes | No | Yes | Yes | RED | Select approved provider |
| Cache | Redis-compatible | Yes | No | Yes | Yes | YELLOW | Configure Redis in production |
| Edge/WAF | Cloudflare/Turnstile-compatible | Yes | No | Yes | Yes | YELLOW | Configure provider and test edge |
| Streaming | Provider-neutral | Yes | No | Yes | Yes | RED | Select provider and connect OBS |
| Object storage | S3-compatible | Yes | No | Yes | Yes | YELLOW | Configure private bucket |
| CDN | Provider-neutral | Yes | No | Yes | Yes | YELLOW | Configure CDN base/purge |
| Backups/PITR | Provider-neutral | Yes | No | Yes | Yes | RED | Configure and restore-test |
| Deployment | Provider-neutral | Yes | No | Yes | Yes | YELLOW | Connect deployment health/rollback |
| Printify | Printify | Yes | No | Yes | Yes | YELLOW | Configure token/shop/webhook |
| Malware scanning | HTTP scanner adapter | Yes | No | Yes | Yes | YELLOW | Connect scanner |
| External monitoring | HTTP monitor adapter | Yes | No | Yes | Yes | YELLOW | Connect monitor |
