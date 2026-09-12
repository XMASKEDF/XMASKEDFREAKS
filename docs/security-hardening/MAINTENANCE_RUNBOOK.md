# Emergency Maintenance Runbook

## Activate

1. Sign in as Super Admin and open **ADMIN → Security** or **ADMIN → Pre-launch → Maintenance**.
2. Review scope. Full shutdown is the default; use a narrower scope when it safely contains the incident.
3. Enter a private reason, safe public message, estimated return time, current password, and the exact word `MAINTENANCE`.
4. Confirm the server response says **Maintenance Mode is active**. Check the state version and audit history.
5. In production, verify one public route, one blocked API, Admin access, legal pages, health, payment callback reachability, and reconciliation processing.

Maintenance preserves carts, sessions, completed orders, wallet records, pending payments, callback processing, and queued Printify jobs. It does not reverse payments or delete data.

## Restore

1. Review Security Center and Reliability Center incidents.
2. Select **RESTORE PUBLIC ACCESS**, provide a restoration reason, current password, and `MAINTENANCE`.
3. The server checks application, database, authentication, storage, wallet integrity, payments, Printify, jobs, and required environment state.
4. Resolve failed critical checks. A Super Admin emergency override requires a separate written reason and is recorded prominently.
5. Verify public routes, checkout initiation, live route, account access, and edge caches after restoration.

## Automatic triggers

Automatic shutdown is disabled by default. The schema can retain reviewed thresholds, but no automatic trigger should be enabled without approved incident criteria, alert delivery, and a tested recovery owner.
