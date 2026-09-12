# Email Provider Setup

`lib/email/provider.ts` defines the email abstraction. The repository expects `EMAIL_API_URL`, `EMAIL_API_KEY`, and `EMAIL_FROM`; `ADMIN_SUPPORT_EMAIL`, `DEPOSIT_ALERT_EMAIL`, `SUPPORT_ESCALATION_ENDPOINT`, and `CRON_SECRET` support specific workflows.

Owner/provider action: select an approved transactional email provider, verify the sender/domain, configure SPF/DKIM/DMARC, and place credentials in server-only deployment secrets.

Required tests: account emails, support escalation, live notifications, newsletter consent/unsubscribe, upcoming notifications, and deposit alerts. Delivery must be reported unavailable until provider responses are verified.
