# Pre-Launch Operations Runbook

## Deployment Order
1. Create a backup and confirm the restore target.
2. Apply existing migrations in filename order, ending with `20260723_prelaunch_operations.sql`.
3. Configure required environment variables from `.env.example`.
4. Deploy the application and verify `/api/health`.
5. Create the first ADMIN through `/admin/setup`, enroll 2FA, and remove the development bypass.
6. Publish legally reviewed policy versions.
7. Configure the email provider and call `/api/jobs/email` with the cron secret.
8. Schedule `/api/jobs/prelaunch` at least every five minutes.
9. Run the complete validation commands and a real test purchase in processor test mode.

## Scheduled Jobs
- `/api/jobs/email`: every minute; retries queued mail up to five attempts.
- `/api/jobs/prelaunch`: every five minutes; releases expired inventory reservations, publishes scheduled policies, and enforces analytics retention.
- Existing auction finalization and payment webhook jobs remain separate and must retain their current schedules.

## Backup and Recovery
- Enable managed daily Postgres backups and point-in-time recovery before accepting money.
- Enable object-storage versioning or replicate originals and protected digital files.
- Preserve orders, wallet transactions, audit events, policy versions, and acceptance records indefinitely unless counsel approves a retention change.
- Restore into staging first, run consistency queries, then redirect production only after checkout, wallet, downloads, and ADMIN login pass.
- Perform and document one full recovery rehearsal before launch and quarterly afterward.

## Rollback
- Disable maintenance/customer communication triggers if a queue defect is found.
- Revert the application deployment before changing data.
- The migration is additive: retain tables and history, disable new routes/workers, and archive new records rather than dropping data.
- Never roll back wallet/order rows manually. Reconcile through an audited compensating transaction.

## Monitoring
Alert on non-200 health responses, database disconnects, failed email jobs, checkout errors, wallet failures, inventory adjustment rejections, media upload failures, scheduled job failures, and elevated 5xx rates. The health endpoint exposes configuration booleans only, never secrets.
