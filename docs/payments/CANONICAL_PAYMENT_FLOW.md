# Canonical Payment Flow

## Current Rule

The platform does not display a visitor-facing or admin-facing currency converter.

All visible checkout amounts are presented in the platform canonical currency: USD.
Server payment preparation converts those amounts into integer minor units before a processor intent is prepared.

## Visitor Interface

Visitors should see only the controls needed to complete payment:

- Amount
- Payment method
- Receipt email
- Save-card preference
- Do-not-save-card preference
- Secure payment notice
- Final payment action

Visitors should not see country selectors, currency selectors, exchange rates, rate timestamps, estimated conversion fees, settlement-currency previews, or manual conversion refresh controls.

## Server Authority

`lib/config.ts` is the canonical source for approved coin packages. `/api/payments/hosted` re-reads the package and stores integer minor-unit pricing before redirecting to a provider-hosted page.

The browser may submit the payment purpose, amount, receipt email, selected payment method token, and card-saving preference. The server independently validates:

- payment purpose
- minimum and maximum amount
- decimal precision
- canonical currency
- integer minor-unit amount
- supported payment method type
- receipt email format

The browser must not submit or control exchange rates, converted amounts, processor totals, settlement currency, or fee calculations.

## Processor Draft

`app/api/payments/route.ts` prepares a processor draft containing:

- `amountMinor`
- `currency`
- `processorAmount`
- `processorCurrency`
- safe customer/payment-token references
- idempotency key
- metadata with canonical amount and payment context

The current repository does not include a live Stripe SDK call or signed webhook implementation. Those remain launch blockers until real processor credentials, hosted fields, webhook signatures, and idempotency are connected.

## Fallback Behavior

If payment localization data or country detection is unavailable, the platform remains in canonical USD presentation. The removed converter interface must not return as a fallback.
