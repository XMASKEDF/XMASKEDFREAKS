# Hosted Checkout Implementation

## Current State

The application is provider-neutral and fails closed by default.

- `PAYMENT_PROVIDER=disabled` is the production-safe default.
- `PAYMENT_PROVIDER=test` is available only outside production and requires a server-only secret.
- `PAYMENT_PROVIDER=segpay` and `PAYMENT_PROVIDER=ccbill` deliberately return unavailable until official, approved integration documentation and credentials are supplied.
- No frontend component requests card number, expiration date, CVV, raw credentials, or processor login data.
- The prior `/api/payments` browser-token scaffold returns HTTP 410 and cannot credit a wallet.

## Customer Flow

1. Customer chooses an enabled coin package and accepts the Coin Usage disclosure and checkout terms.
2. `/api/payments/hosted` authenticates the customer and re-reads the package from server configuration.
3. The server creates a pending `hosted_payments` record containing the expected amount, currency, and coin totals.
4. The provider adapter returns an approved hosted checkout URL.
5. The customer enters payment details only on the provider site.
6. The return page displays server status but cannot fulfill the payment.
7. A verified, deduplicated provider callback invokes `confirm_hosted_coin_payment`.
8. That database transaction locks the payment and wallet, validates amount/currency/provider/environment, adds coins exactly once, writes the ledger, marks the payment confirmed, and queues receipt/analytics records.

## Failure Behavior

- Disabled provider: customer receives setup-in-progress text; no payment attempt is created.
- Invalid callback signature: rejected and raised as a Reliability incident.
- Duplicate callback: acknowledged without a duplicate credit.
- Amount, currency, provider, purpose, or environment mismatch: payment moves to reconciliation review; no credit.
- Verified confirmation but database failure: incident raised at emergency severity; no browser retry can invent a credit.
- Return page reached without callback: remains processing; no credit.

## Provider Contract Still Required

Before Segpay or CCBill can be implemented, provide:

1. Chosen provider and the official integration guide approved for this business category.
2. Merchant/account identifiers and sandbox credentials.
3. Written approval for coin packages and any approved countries/currencies.
4. Official hosted-checkout endpoint and exact approved request fields.
5. Callback/postback endpoint requirements and signature/authentication algorithm.
6. Provider event IDs, transaction IDs, status values, and retry behavior.
7. Required callback acknowledgment body/status.
8. Success/cancel return URL rules.
9. Amount/price-point/package mapping requirements.
10. Refund, dispute, chargeback, and reconciliation APIs, if approved.

Do not add provider field names from memory or examples from unrelated merchants.

## Deployment Checklist

- Apply `20260729_hosted_checkout_provider_neutral.sql`.
- Set `APP_URL` to the canonical HTTPS site origin.
- Keep `PAYMENT_PROVIDER=disabled` until a provider adapter passes sandbox tests.
- Configure the provider callback to `/api/webhooks/payments/{provider}` only after verification is implemented.
- Schedule `/api/jobs/payment-reconciliation` with `CRON_SECRET`.
- Confirm ADMIN `/admin/payments` and Reliability payment views.
- Test success, decline, cancellation, expiry, duplicate callback, invalid signature, amount mismatch, environment mismatch, callback-before-return, return-before-callback, and provider outage.
- Re-run typecheck, lint, tests, and production build.
