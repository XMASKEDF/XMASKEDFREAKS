# 12 Launch Day Playbook

Status: **UNVERIFIED PLAYBOOK**

This playbook is not executable until blockers in the master checklist are resolved.

## T-48 Hours

- Freeze code.
- Confirm `npm run lint`, `npm run typecheck`, `npm run build` pass.
- Confirm Supabase backups and restore drill.
- Confirm Stripe test-mode payments and webhooks.
- Confirm Cloudflare DNS/WAF/caching.
- Confirm OBS live endpoint.

Rollback trigger: any Critical test fails.

## T-24 Hours

- Verify production env values.
- Rotate setup/admin secrets if needed.
- Confirm first admin account and 2FA.
- Run RLS access tests.
- Test wallet/coin purchase in test mode.
- Test email notification unsubscribe.

Rollback trigger: payment, login, or admin access failure.

## T-12 Hours

- Run full staging smoke test.
- Verify `/go` live/offline behavior.
- Verify support escalation.
- Verify moderation kick flow.
- Verify mobile/theater mode.

Rollback trigger: protected content bypass or payment mismatch.

## T-6 Hours

- Confirm CDN/WAF active.
- Confirm monitoring alerts.
- Confirm backup snapshot.
- Confirm incident contacts.

Rollback trigger: origin receives direct abusive traffic or monitoring unavailable.

## T-3 Hours

- Disable nonessential experiments.
- Confirm cost dashboard thresholds.
- Confirm stream provider health.

Rollback trigger: stream instability or provider health failure.

## T-1 Hour

- Final payment test.
- Final login/admin test.
- Final OBS live-status test.
- Confirm support inbox monitored.

Rollback trigger: any money/auth/live-status failure.

## Launch

- Enable production live status.
- Monitor ADMIN, payments, Supabase, Cloudflare, stream, support.
- Keep rollback operator assigned.

Rollback trigger: payment double-credit, unauthorized admin access, stream outage over 5 minutes, database error spike, or security incident.

## Post Launch: First 24 Hours

- Review logs hourly.
- Reconcile payments and wallet.
- Watch cost spikes.
- Review security events.
- Review support escalations.

## 48 Hours

- Verify backups.
- Reconcile Stripe and database.
- Review conversion analytics.

## One Week

- Run incident retrospective.
- Prioritize technical debt.
- Tune WAF/rate limits.

## One Month

- Review costs, chargebacks, retention, refunds, support patterns, and database growth.

