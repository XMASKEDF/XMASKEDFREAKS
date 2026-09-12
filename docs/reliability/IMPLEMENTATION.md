# Website Reliability and Incident Management

## Verified in code

- Protected `/admin/reliability` command center with 16 focused panels.
- Server-side ADMIN session and `admin.operations.manage` permission checks.
- Five severity levels and a detected-to-resolved incident workflow.
- Stable fingerprints that group repeated errors while retaining immutable occurrences.
- Correlation references, sanitized report export, administrator assignment, closure notes, alerts, action history, incident links, and postmortem storage.
- Browser exception, rejected promise, resource, and media failure reporting with rate limits and one-minute client deduplication.
- Route error isolation for the application shell, ADMIN, Account, Live, Merch, Audio Clips, Paintings, Search, and Notifications.
- Internal checks distinguish reachable, functional, latency, and unverified states.
- Public `/api/health` exposes only status, deployment version, and timestamp.
- Wallet consistency scan, spending holds for mismatched wallets, and append-only incident evidence. The scanner never modifies balances or ledger rows.
- Email and Printify retry limits, circuit breakers, preserved review queues, and terminal-failure incidents.
- Deduplicated severity 4/5 administrator emails and a cron-protected daily summary queued through the existing email worker.
- Confirmed circuit reset as the only executable recovery action. High-risk financial, security, deletion, restore, and deployment actions are refused.
- Maintenance controls remain in the existing protected operations panel and valid jobs/orders are preserved.

## Deployment requirements

1. Apply `supabase/migrations/20260729_reliability_incident_management.sql`.
2. Set `RELIABILITY_IP_SALT` and `DEPLOYMENT_VERSION`.
3. Configure the existing Supabase service credentials.
4. Configure scheduled email, Printify, maintenance, and cleanup jobs with `CRON_SECRET`.
5. Connect a real payment processor before enabling payment health.
6. Connect backup and deployment evidence providers before launch.
7. Perform and record a real restore test. A successful backup without a restore test is not launch proof.

## Important boundary

The migration will place any wallet whose current balance does not equal its completed signed ledger total on a spending hold. Existing painting purchase functions reduce coins without adding `wallet_transactions` rows, so affected accounts will correctly require reconciliation. Do not release a hold until the missing transaction history is reconstructed through an approved, audited repair.

## Incident workflow

`Detected → Investigating → Contained → Monitoring → Resolved`

Alternative terminal states are `False Positive`, `Requires Vendor`, and `Requires Admin Action`. Severity 4 and 5 incidents require closure notes. Financial records, administrator permissions, customer data, production deployments, and database restores never receive automatic repair.

## Retention defaults

| Evidence | Retention |
| --- | ---: |
| Browser and performance evidence | 30 days |
| Application errors | 90 days |
| Security evidence | 365 days |
| Financial incidents and admin actions | 2,555 days |

Retention settings are stored in `reliability_retention_settings`. Purging requires an approved server-side job and administrator authorization; no destructive purge job is enabled by this implementation.

## Honest verification status

- Local typecheck, lint, build, and reliability tests: recorded in `docs/Launch-Bible/11_BUILD_BIBLE.md`.
- Supabase migration applied to production: **UNVERIFIED**.
- Provider probes, production alerts, scheduled reports, and deployment history: **UNVERIFIED** until connected.
- Backup existence and restoration: **UNVERIFIED** and launch-blocking.
- Payment processing: **MISSING** in the current repository.
