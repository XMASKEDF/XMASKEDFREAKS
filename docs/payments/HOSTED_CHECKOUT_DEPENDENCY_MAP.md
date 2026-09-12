# Hosted Checkout Dependency Map

## Existing system

| Area | Current owner | Payment dependency | Preservation decision |
| --- | --- | --- | --- |
| Cart and checkout modals | `components/purchase/*` | Spends existing coins only | Preserve unchanged |
| Audio purchases | `app/api/audio-clips/route.ts` | Atomic wallet deduction and entitlement | Preserve |
| Merchandise purchases | `app/api/merch/route.ts` | Quote, inventory, shipping, tax, wallet deduction, local order | Preserve |
| Printify | `app/api/jobs/printify/route.ts` | Receives already-paid local orders | Preserve and never call from browser |
| Coin package UI | `components/LiveRoom.tsx` | Previously called the payment scaffold and could simulate a credit | Replace with hosted redirect initiation |
| Payment scaffold | `app/api/payments/route.ts` | Accepted fake saved-card/token fields and development confirmation | Permanently disabled with HTTP 410; unused token-pricing helper removed |
| Wallet credit | `credit_token_wallet` RPC | Could be invoked by the old test confirmation | Replace hosted payments with payment-bound atomic RPC |
| Account payment methods | `components/LiveRoom.tsx` | Demo masked Visa and fake processor tokens | Remove demo state and replace with hosted-payment disclosure |
| Orders and downloads | Commerce RPCs and `purchase_entitlements` | Depend on wallet spending, not card processing | Preserve |
| Notifications and email | `customer_notifications`, `email_delivery_jobs` | Trigger after completed actions | Connect only after verified server confirmation |
| Analytics | `analytics_events` | Existing checkout and fulfillment events | Add non-sensitive hosted-payment events |
| ADMIN | `/admin`, `/admin/orders` | Processor readiness only | Add protected Hosted Payments Center |
| Reliability | `/admin/reliability` | Generic provider health | Add hosted payment incidents and reconciliation findings |

## Card-data audit

No real card input existed, but `LiveRoom` displayed simulated saved-card controls and generated fake processor customer/payment tokens. Those controls must not remain reachable. The hosted architecture transmits only an internal payment reference to a future provider adapter; provider-specific fields remain unimplemented until official documentation is supplied.

## Separation of responsibility

- **Buying coins:** authenticated server initiation → provider-hosted page → verified server callback → atomic wallet credit.
- **Spending coins:** existing cart → server quote/validation → atomic wallet deduction/order/entitlement.
- A browser return page never confirms either flow.
