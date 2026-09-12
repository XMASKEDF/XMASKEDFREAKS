import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getHostedCheckoutProvider } from "../lib/payments/provider.ts";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFileSync(new URL(path, root), "utf8");

test("legacy browser-token payment route is permanently disabled", () => {
  const route = source("app/api/payments/route.ts");
  assert.match(route, /LEGACY_PAYMENT_ROUTE_DISABLED/);
  assert.match(route, /status: 410/);
  assert.doesNotMatch(route, /credit_token_wallet|paymentToken|customerId|testMode/);
});

test("coin initiation re-reads the package and never trusts browser pricing", () => {
  const route = source("app/api/payments/hosted/route.ts");
  assert.match(route, /getOperationalCoinPackage/);
  assert.match(route, /quoteCoinPackage/);
  assert.match(route, /purpose !== "coin_purchase"/);
  assert.match(route, /expected_amount_minor: quote\.amountCents/);
  assert.match(route, /expected_total_coins: quote\.totalCoins/);
  assert.doesNotMatch(route, /body\.(amount|currency|baseCoins|bonusCoins|totalCoins)/);
});

test("visitor checkout has no card-entry or simulated saved-card controls", () => {
  const room = source("components/LiveRoom.tsx");
  assert.match(room, /Your payment will be completed securely on our payment provider’s website/);
  assert.match(room, /\/api\/payments\/hosted/);
  assert.doesNotMatch(room, /pm_demo|pm_token|4242|1881|Save this card|New card through processor vault/);
  assert.doesNotMatch(room, /<input[^>]+(?:card|cvv|cvc|expir)/i);
});

test("only a verified callback can invoke atomic coin fulfillment", () => {
  const callback = source("app/api/webhooks/payments/[provider]/route.ts");
  const returnPage = source("components/payments/HostedPaymentReturn.tsx");
  assert.match(callback, /verifyCallback/);
  assert.match(callback, /confirm_hosted_coin_payment/);
  assert.match(callback, /provider_event_id/);
  assert.match(returnPage, /Returning to this page does not confirm a payment/);
  assert.doesNotMatch(returnPage, /credit_token_wallet|confirm_hosted_coin_payment/);
});

test("database credit is atomic, idempotent, immutable, and mismatch-safe", () => {
  const migration = source("supabase/migrations/20260729090500_hosted_checkout_provider_neutral.sql");
  const fn = migration.match(/create or replace function public\.confirm_hosted_coin_payment[\s\S]*?create or replace function public\.scan_hosted_payment_reconciliation/)?.[0] || "";
  assert.match(fn, /for update/);
  assert.match(fn, /wallet_transactions_hosted_payment_unique|hosted_payment_id/);
  assert.match(fn, /RECONCILIATION_MISMATCH/);
  assert.match(fn, /update public\.token_wallets set balance_tokens=next_balance/);
  assert.match(fn, /insert into public\.wallet_transactions/);
  assert.match(fn, /set status='CONFIRMED'/);
  assert.match(migration, /hosted_payment_events_immutable/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on function public\.confirm_hosted_coin_payment/);
});

test("provider placeholders fail closed without invented Segpay or CCBill contracts", () => {
  const provider = source("lib/payments/provider.ts");
  assert.match(provider, /PAYMENT_PROVIDER/);
  assert.match(provider, /Segpay remains disabled until official integration documentation/);
  assert.match(provider, /CCBill remains disabled until official integration documentation/);
  assert.doesNotMatch(provider, /segpay\.com|ccbill\.com|merchantAccount|clientAccnum|formName/);
});

test("development test adapter verifies every terminal scenario and rejects invalid signatures", async () => {
  const env = process.env as Record<string, string | undefined>;
  const previousProvider = env.PAYMENT_PROVIDER;
  const previousSecret = env.PAYMENT_TEST_SECRET;
  const previousNodeEnv = env.NODE_ENV;
  env.PAYMENT_PROVIDER = "test";
  env.PAYMENT_TEST_SECRET = "development-only-test-secret-12345";
  env.NODE_ENV = "test";
  try {
    const provider = getHostedCheckoutProvider();
    assert.equal(provider.configured, true);
    for (const status of ["CONFIRMED", "DECLINED", "CANCELLED", "EXPIRED"] as const) {
      const raw = JSON.stringify({
        eventId: `event-${status}`,
        transactionId: `transaction-${status}`,
        internalPaymentId: "00000000-0000-4000-8000-000000000001",
        status,
        amountMinor: 2500,
        currency: "USD",
        environment: "test"
      });
      const signature = createHmac("sha256", env.PAYMENT_TEST_SECRET || "").update(raw).digest("hex");
      const verified = await provider.verifyCallback(new Request("http://localhost/callback", { method: "POST", headers: { "x-xmf-test-signature": signature } }), raw);
      assert.equal(verified.verified, true);
      assert.equal(verified.status, status);
    }
    const invalid = await provider.verifyCallback(new Request("http://localhost/callback", { method: "POST", headers: { "x-xmf-test-signature": "invalid" } }), "{}");
    assert.equal(invalid.verified, false);
    assert.equal(invalid.errorCode, "INVALID_TEST_SIGNATURE");
    env.NODE_ENV = "production";
    assert.equal(getHostedCheckoutProvider().configured, false);
  } finally {
    if (previousProvider === undefined) delete env.PAYMENT_PROVIDER; else env.PAYMENT_PROVIDER = previousProvider;
    if (previousSecret === undefined) delete env.PAYMENT_TEST_SECRET; else env.PAYMENT_TEST_SECRET = previousSecret;
    if (previousNodeEnv === undefined) delete env.NODE_ENV; else env.NODE_ENV = previousNodeEnv;
  }
});

test("hosted payment administration and reconciliation are protected", () => {
  const page = source("app/admin/payments/page.tsx");
  const api = source("app/api/admin/payments/route.ts");
  const job = source("app/api/jobs/payment-reconciliation/route.ts");
  assert.match(page, /getAdminBySession/);
  assert.match(page, /admin\.commerce\.manage/);
  assert.match(api, /admin\.commerce\.manage/);
  assert.match(job, /CRON_SECRET/);
  assert.match(job, /No wallet balance was changed/);
});

test("wallet spending remains separate from hosted coin purchasing", () => {
  const dependencyMap = source("docs/payments/HOSTED_CHECKOUT_DEPENDENCY_MAP.md");
  const commerce = source("components/purchase/PurchaseProvider.tsx");
  assert.match(dependencyMap, /Spends existing coins only/);
  assert.match(commerce, /checkout/);
  assert.doesNotMatch(commerce, /cardNumber|cvv|confirm_hosted_coin_payment/);
});
