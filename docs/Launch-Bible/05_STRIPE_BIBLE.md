# 05 Payment Processor Bible

> Historical filename retained for Launch Bible link stability. Stripe is not the selected provider. The application now targets a provider-hosted checkout through a neutral adapter for a future Segpay or CCBill decision.

Status: **NOT SELECTED**

Repository evidence shows no Stripe implementation and no production Segpay/CCBill implementation. Stripe is intentionally not selected. The provider-neutral hosted-checkout boundary, normalized event model, inactive Segpay/CCBill adapter placeholders, and shared callback pipeline are implemented; production provider details remain **UNVERIFIED**.

## Evidence Checked

- `package.json` has no `stripe` dependency.
- `.env.example` has no `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, or webhook secret.
- No `/api/stripe/*` route exists.
- No webhook route exists.
- No Checkout Session creation exists.
- No Customer Portal route exists.
- No Stripe metadata constants exist.
- `app/api/payments/route.ts` returns a generic `processorMode: "vault-token-only"` response but does not call Stripe.

## Required Stripe Model

| Area | Required For Launch | Current Status |
| --- | --- | --- |
| Products | Coin packages, paid access, wallet deposits if modeled as products | MISSING |
| Prices | Amount tiers from code/config | MISSING |
| Checkout | Hosted checkout or Payment Element | MISSING |
| Webhooks | `payment_intent.succeeded`, failures, refunds, chargebacks | MISSING |
| Customer Vault | Saved payment method consent and customer IDs | MISSING |
| Customer Portal | Manage saved methods if used | MISSING |
| Refunds | Restricted refund workflow | MISSING |
| Metadata | user/session/package/access IDs | MISSING |
| Idempotency | Duplicate payment/webhook protection | PARTIAL schema only |
| Test mode | End-to-end test card flow | MISSING |
| Live mode | Production account readiness | MISSING |

## Launch Checklist

1. Add Stripe dependency only after dependency policy approval.
2. Add env variables for publishable key, secret key, webhook secret, and mode.
3. Create server-only Checkout/PaymentIntent route.
4. Add webhook route with raw body signature verification.
5. Store only Stripe customer/payment method IDs and safe card metadata.
6. Use `payment_webhook_events.processor_event_id` for dedupe.
7. Credit wallet/coins only inside verified webhook handler.
8. Add test-mode smoke tests.
9. Add failure-state UI for declined card, 3DS required, canceled checkout, webhook delay, duplicate event, refund, chargeback.
10. Do not enable live mode until webhook, ledger, and refund policy are verified.
