# Payment Provider Setup

The application has a hosted, provider-neutral payment adapter with inactive Segpay and CCBill adapters. Production is disabled by default. The project does not store raw card data.

Required: select Segpay or CCBill, obtain merchant approval and official documentation, configure provider-specific merchant/product, hosted checkout, callback/return, and postback/webhook signing values from `.env.example`, register HTTPS callback URLs, then verify amount, currency, environment, signature, idempotency, refund, chargeback, and reconciliation behavior in sandbox.

**CODE READY:** adapter boundary and unavailable-provider behavior exist.

**PROVIDER ACCOUNT REQUIRED:** merchant account, approval, callback rules, and credentials.

**REAL SETTLEMENT:** not enabled.
