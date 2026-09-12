# Setup Status

`GREEN` means verified in repository or local checks. `YELLOW` means partially ready or configuration-required. `RED` means a launch-blocking dependency or safety issue.

| Area | Status | Current evidence | Next action |
|---|---|---|---|
| Repository permissions | GREEN | Owner is `calebyoung`; current normal typecheck/lint writes now succeed | Verified in current environment |
| Supabase | YELLOW | Supabase CLI `2.116.0` is available through an isolated local npx cache; remote commands still require `SUPABASE_ACCESS_TOKEN` | OWNER ACTION: provide the approved access token when remote status verification is scheduled |
| Migrations | YELLOW | Local reset applied all 52 migrations through `20260911130000_remaining_integrations`; remote history remains unverified | OWNER ACTION: verify remote history in the approved environment before applying anything |
| Authentication | GREEN | Admin auth, sessions, role checks, lockout, and audit paths exist | CODEX ACTION: rerun protected-route tests after provider setup |
| Admin | YELLOW | Many real panels; remaining partial/display-only tools documented | CODEX ACTION: complete section 12 plan |
| Payments | RED | Segpay/CCBill adapters are intentionally unavailable until configured | OWNER/PROVIDER ACTION: approved processor account |
| Email | RED | Provider abstraction exists; delivery credentials absent | OWNER/PROVIDER ACTION: configure approved email provider |
| Redis/cache | YELLOW | Local fallback works; Redis adapter exists | OWNER ACTION: configure production cache |
| WAF/Bot | YELLOW | Local bot/rate-limit controls work; Cloudflare/Turnstile absent | PROVIDER ACTION: configure edge protection |
| Storage/CDN | YELLOW | Local storage works; production provider absent | OWNER/PROVIDER ACTION: configure private storage/CDN |
| Media processing | YELLOW | Validation/quarantine exists; malware scanner absent | PROVIDER ACTION: connect scanner |
| Streaming | RED | Provider slots exist; stream provider/OBS health not configured | OWNER ACTION: select and configure provider |
| Backups | RED | Backup interface exists; provider/PITR not configured | PROVIDER ACTION: configure and restore-test backups |
| Monitoring | YELLOW | Reliability Center and local telemetry exist | OWNER ACTION: connect external monitor |
| Deployment | YELLOW | Isolated production build and CSS postcheck pass; deployment provider, domain, production environment, and CI are not configured in the repository | OWNER ACTION: configure the approved deployment target and production environment |
| Printify | YELLOW | Enterprise adapter and Admin management exist; credentials absent | OWNER/PROVIDER ACTION: configure Printify |
| Production build | GREEN | Isolated build completed under Node `20.20.2`; the isolated `.next-production/BUILD_ID` was produced and the CSS postcheck passed without stopping port 3000 | Verified for the current source state; run the built server only in a scheduled release window |
| Production sales | RED | Real settlement is disabled | PROVIDER ACTION: complete payment approval and webhook verification |
