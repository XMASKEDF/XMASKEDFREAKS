# Backups / PITR Setup

The provider-neutral backup interface reports configuration and restore-test evidence. It does not claim backups when `BACKUP_PROVIDER=NONE`.

Owner/provider action: configure encrypted database backups, PITR, media backup, retention, status endpoint, provider token, and a staging restore workflow. Record the last successful backup and restore test. Never restore over production without an approved incident/change process.
