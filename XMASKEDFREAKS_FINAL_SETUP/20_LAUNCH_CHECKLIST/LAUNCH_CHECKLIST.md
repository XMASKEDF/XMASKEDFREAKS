# Launch Checklist

## Before Real Money

- [ ] NOT DONE — Approved Segpay or CCBill account and documentation.
- [ ] NOT DONE — Signed webhook/callback tests and idempotency verification.
- [ ] NOT DONE — Wallet, coins, refunds, chargebacks, and reconciliation staging tests.
- [ ] NOT DONE — Admin payout provider and approval workflow.

## Before Public Domain

- [ ] NOT DONE — Domain, HTTPS, DNS, CDN, WAF, and origin verification.
- [ ] NOT DONE — Supabase migrations/RLS/storage verified in staging.
- [ ] NOT DONE — Backups, PITR, restore test, and rollback recorded.

## Before Live Traffic

- [ ] NOT DONE — Streaming provider and OBS health callbacks verified.
- [ ] NOT DONE — Rate limits, bot policy, game challenge-off invariant, and anti-cheat verified.
- [ ] NOT DONE — External monitoring and incident alert routing connected.

## Before Email Campaigns

- [ ] NOT DONE — Email provider, sender authentication, consent, unsubscribe, and delivery tests.

## Before Printify Fulfillment

- [ ] NOT DONE — Printify token/shop/webhook configuration and reconciliation tests.

## Before Production Sales

- [ ] NOT DONE — Final build, typecheck, lint, focused tests, smoke tests, and launch-readiness review.
