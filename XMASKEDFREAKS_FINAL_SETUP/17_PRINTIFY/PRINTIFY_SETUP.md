# Printify Setup

The project has a provider-neutral POD layer, Printify product/provider/inventory/shipping/order/reconciliation management, Admin queue actions, and coins-only physical merch rules.

`PRINTIFY_INTEGRATION_MODE` remains disabled until `PRINTIFY_API_TOKEN`, `PRINTIFY_SHOP_ID`, and `PRINTIFY_WEBHOOK_SECRET` are supplied and verified. Manual merch catalog management and Printify fulfillment are separate paths. Test product mapping, variants, inventory, shipping, order idempotency, retries, tracking reconciliation, and failure escalation in sandbox before enabling production fulfillment.
