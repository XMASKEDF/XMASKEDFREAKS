# Admin Tool Status

The operationalization package is classified from implemented routes, server validation, persistence boundaries, and provider adapters. A provider dependency does not turn completed software into display-only scaffolding.

| Tool | Before | After | Software status | External dependency |
|---|---|---|---|---|
| Live Stream & OBS | PARTIAL | PARTIAL - PROVIDER | Safe Live/OBS state and diagnostics are exposed in the protected workstation. | OBS and streaming-provider configuration |
| Theater Mode & Audio Priority | DISPLAY ONLY / PARTIAL | COMPLETE | Persisted Admin settings, public Live consumption, validation, and audit events. | None for the software path |
| Background Music & Live Lobby | DISPLAY ONLY | COMPLETE | Shared Media Library references, playlist ordering, enable/disable, ducking settings, and graceful unavailable-track handling. | Approved media assets and storage for playback |
| Redirect Manager | PARTIAL | COMPLETE | Persisted rules, approved destinations, timing/priority validation, routing consumption, and existing redirect logging. | None for the software path |
| Campaign Tracking | PARTIAL | COMPLETE | Campaign definitions and normalized destinations use the existing analytics attribution fields. | None for the software path |
| Geo-Targeting & World Clocks | DISPLAY ONLY | COMPLETE - SOFTWARE | Aggregate country/timezone/active/unique/returning view with no raw IP or exact coordinates. | Production geo provider remains optional |
| Live Notifications & Email | PARTIAL | PARTIAL - PROVIDER | Resend queue handoff, cooldown, idempotency, status, failure, and fail-closed handling. | Resend key, sender/domain verification, and delivery policy |
| Customer Support & FAQ | PARTIAL | COMPLETE | Protected case workstation, filters, FAQ editing, escalation links, and appeal state. | Connected Support Case data in the deployed database |
| Payment Processor Readiness | PARTIAL | PARTIAL - PROVIDER | Safe CCBill/Segpay readiness and reconciliation surfaces; hosted checkout remains fail-closed. | Approval, credentials, official docs, and test transactions |
| Coin Usage Policy | PARTIAL | COMPLETE | Admin presentation/policy editor with server-enforced immutable 1 coin = $0.50. | None for the software path |
| Wallet & Coin Packages | PARTIAL | COMPLETE | One six-slot catalog, server-normalized package authority, bonus limits, and hosted-checkout revalidation/idempotency. | Provider activation for real charges |
| Bank Payouts | PARTIAL | COMPLETE - INTERNAL | Existing payout/accounting records remain available for expected/pending/held/reconciled tracking. | Approved settlement provider and verification |
| Creator Deposit Schedule | PARTIAL | COMPLETE - INTERNAL | Durable Admin schedule settings and run-state fields are available for internal preparation. | Worker deployment and bank settlement provider |
| 25-Minute Contribution Rule | PARTIAL | STALE / SUPERSEDED | No new implementation. Obsolete Admin backlog item retired so it cannot compete with current Live policy. | None |
| Moderation & Kick Rules | PARTIAL | COMPLETE | Existing manual chat, Live restriction, site-ban, audit, and appeal tools are surfaced without an automated language classifier. | None for the software path |
| Performance & Power Optimization | PARTIAL | COMPLETE - SOFTWARE | Existing reliability/client telemetry is represented as bounded aggregate Admin diagnostics with configurable retention. | Production telemetry retention service is optional |
| Sandbox Mode | PARTIAL | COMPLETE | Protected scenario console records explicitly isolated application-side simulations and provider failure cases. | None for safe software simulation |

The existing Admin Audit Log remains the security/operations history. The new operational events table is only the bounded change evidence for this workstation and contains no secrets.
