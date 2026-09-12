# Admin Remaining Implementation

The application-side integration package is complete for the current Sandbox intervention. The table below separates source code that is ready from actions that intentionally wait for provider approval, credentials, DNS, or deployment.

## Code complete

| Area | Current state |
|---|---|
| CCBill / Segpay | Provider-neutral adapters, capability/readiness reporting, shared verified callback boundary, idempotency, and fail-closed behavior are implemented. No provider capability is advertised until its approved contract is supplied. |
| Resend notifications | Read-only health probe, one-recipient Admin test action, queued/provider-accepted/failed states, and no-false-delivered handling are implemented. |
| Payouts / deposits | Durable schedule claim, run history, deterministic idempotency, ledger aggregation, payout preparation, and `BLOCKED_PROVIDER` state are implemented. No bank settlement is attempted. |
| Shared media publication | Ready-image validation, public/private storage separation, publication lifecycle events, stable public references, and storage-unconfigured fail-safe behavior are implemented. |

## Waiting on provider or deployment

| Area | External dependency |
|---|---|
| Live / OBS | Approved OBS/streaming credentials and endpoint contract are required for a provider-specific health probe. |
| CCBill / Segpay | Business approval, credentials, sandbox access, and documented callback/reconciliation contracts are required before enabling either adapter. |
| Resend | Sender-domain verification, approved key, and a deliberate Admin test send are required before production delivery. API acceptance is never reported as delivery. |
| Payout settlement | An approved settlement processor, destination verification, and a deployed worker trigger are required. The internal eight-hour schedule is not a bank-deposit promise. |
| Storage / CDN | Production public/private storage, CDN base URL, access policy, and deployment configuration are required. Local storage remains development-only. |
