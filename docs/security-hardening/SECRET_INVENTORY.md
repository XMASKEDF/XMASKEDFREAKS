# Secret Inventory

No secret values are recorded here.

| Secret | Scope | Purpose | Rotation trigger |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Restricted database, Auth, and storage operations | Suspected exposure, staff/provider incident, scheduled rotation |
| `ADMIN_SETUP_SECRET` | Server only | One-time first Admin creation | Immediately after first setup or any exposure |
| `ADMIN_DEV_PASSWORD_HASH` | Development only | Local authenticated Super Admin password hash | Developer access change or suspected exposure |
| `ADMIN_DEV_SESSION_SECRET` | Development only | Signs local Admin sessions | Developer access change or suspected exposure |
| `ADMIN_DEVICE_SALT` | Server only | Admin device-signal hashing | Security incident; rotation invalidates comparison continuity |
| `PAYMENT_TEST_SECRET` | Development/test only | Signs local hosted-payment callback simulations | Test sharing or exposure |
| Future provider webhook secret | Server only | Verifies Segpay/CCBill callbacks | Provider rotation or suspected callback compromise |
| `PRINTIFY_API_TOKEN` | Server only | Printify API access | Provider/staff change or suspected exposure |
| `PRINTIFY_WEBHOOK_SECRET` | Server only | Printify callback verification | Provider rotation or suspected exposure |
| `CRON_SECRET` | Server only | Authenticates background jobs | Exposure or scheduling-provider change |
| `SIGNED_DOWNLOAD_SECRET` | Server only | Signs temporary download access | Exposure or download incident |
| `EMAIL_API_KEY` | Server only | Transactional email | Provider/staff change or exposure |
| `OPENAI_API_KEY`, `CLAUDE_API_KEY`, `ANTHROPIC_API_KEY` | Server only | AI adapters | Exposure, vendor rotation, or staff change |
| `GEO_IP_HASH_SALT`, `ANALYTICS_HASH_SALT`, `RELIABILITY_IP_SALT`, `POLICY_ACCEPTANCE_SALT` | Server only | Privacy-preserving identifiers | Privacy incident; preserve migration implications |
| `TAX_API_KEY` | Server only | Tax quote adapter | Provider rotation or exposure |

Rules: production values belong in the hosting secret manager; staging and development use separate values; values never use `NEXT_PUBLIC_`; logs and screenshots must redact them; rotation is followed by session/callback/download verification.
