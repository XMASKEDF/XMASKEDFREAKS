import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("quick Live tip stays outside the cart and never collects raw card data", async () => {
  const [modal, route] = await Promise.all([
    source("components/QuickLiveTipModal.tsx"),
    source("app/api/live/quick-tip/route.ts")
  ]);
  assert.match(modal, /quickTip\.secureTitle/);
  assert.match(modal, /quick-live-tip-amount-emoji/);
  assert.match(modal, /createPortal/);
  assert.match(modal, /document\.body\.classList\.add\("is-locked"\)/);
  assert.match(modal, /onCloseRef/);
  assert.doesNotMatch(modal, /Card Number|Security Code|CVV|card number/i);
  assert.match(route, /purpose: "tip"/);
  assert.match(route, /idempotency-key/);
  assert.match(route, /guest_reference/);
  assert.doesNotMatch(route, /commerce_orders|cart_items|shipping/);
  assert.match(modal, /amounts: TipOption\[\]/);
  assert.match(modal, /tipPhraseKey/);
  assert.doesNotMatch(route, /quick_tip_amounts/);
});

test("confirmed quick tips use the direct contribution RPC and viewing-credit path", async () => {
  const [webhook, migration] = await Promise.all([
    source("lib/payments/webhook-handler.ts"),
    source("supabase/migrations/20260908100000_live_quick_tip_hosted_payments.sql")
  ]);
  assert.match(webhook, /confirm_hosted_live_tip_payment/);
  assert.match(webhook, /category: "tip"/);
  assert.match(migration, /source\)[\s\S]*direct_live_tip/);
  assert.match(migration, /public\.apply_live_viewing_credit/);
  assert.doesNotMatch(migration, /insert into public\.token_wallets/);
});

test("quick tip uses the authoritative Live tip ladder", async () => {
  const tips = await source("lib/tips.ts");
  for (const coins of [4, 6, 8, 10, 12, 16, 20, 24, 30, 32, 40, 50, 60, 80, 100, 150, 200, 300, 400]) {
    assert.match(tips, new RegExp(`tokenCost: ${coins}`));
  }
});
