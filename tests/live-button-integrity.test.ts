import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("refill opens the purchase surface without starting playback or contribution", async () => {
  const liveRoom = await source("components/LiveRoom.tsx");
  const tracker = await source("components/ContributionActivityTracker.tsx");
  const openRefill = liveRoom.slice(liveRoom.indexOf("function openTokenRefill"), liveRoom.indexOf("function selectCoinPackage"));

  assert.match(openRefill, /setCoinRefillOverlayOpen\(true\)/);
  assert.doesNotMatch(openRefill, /payment-flow-started|tip-reminder-tip|play\(|startAccessPeriod|window\.location/);
  assert.doesNotMatch(tracker, /onBuyCoins=\{\(\) => \{[\s\S]*?payment-flow-started/);
  assert.match(tracker, /onBuyCoins=\{\(\) => \{[\s\S]*?tip-reminder-buy-coins/);
});

test("hosted coin payment starts only on submit and remains server-authoritative", async () => {
  const [liveRoom, overlay, route] = await Promise.all([
    source("components/LiveRoom.tsx"),
    source("components/LiveCoinPurchaseOverlay.tsx"),
    source("app/api/payments/hosted/route.ts")
  ]);
  const submit = liveRoom.slice(liveRoom.indexOf("async function prepareLiveCoinPurchase"), liveRoom.indexOf("function sendLiveNotification"));

  assert.match(submit, /payment-flow-started/);
  assert.match(submit, /confirmWalletDeposit\(\)/);
  assert.match(overlay, /onSubmit=\{onSubmit\}/);
  assert.match(overlay, /disabled=\{!selectedPackageQuote \|\| !termsAccepted \|\| submitting\}/);
  assert.match(route, /body\.purpose !== "coin_purchase"/);
  assert.match(route, /quoteCoinPackage\(coinPackage\)/);
  assert.match(route, /getHostedCheckoutProvider\(\)/);
});

test("tip shortcuts keep wallet debit and insufficient-balance recovery separate", async () => {
  const liveRoom = await source("components/LiveRoom.tsx");
  const tipHandler = liveRoom.slice(liveRoom.indexOf("async function sendTokenTip"), liveRoom.indexOf("function sendCustomTokenTip"));

  assert.match(tipHandler, /fetch\("\/api\/tips"/);
  assert.match(tipHandler, /INSUFFICIENT_TOKENS/);
  assert.match(tipHandler, /setRefillResumeReason/);
  assert.doesNotMatch(tipHandler, /setCoinRefillOverlayOpen\(true\)/);
});

test("Live purchase and tip controls have explicit button ownership", async () => {
  const [tipMenu, refillModal, overlay] = await Promise.all([
    source("components/TipMenu.tsx"),
    source("components/RefillResumeModal.tsx"),
    source("components/LiveCoinPurchaseOverlay.tsx")
  ]);

  assert.equal((tipMenu.match(/<button/g) || []).length, (tipMenu.match(/type="button"/g) || []).length + (tipMenu.match(/type="submit"/g) || []).length);
  assert.doesNotMatch(refillModal, /<button(?![^>]*type=)[\s\S]*/);
  assert.doesNotMatch(overlay, /<button(?![^>]*type=)[\s\S]*/);
  assert.match(refillModal, /onClick=\{props\.onRefill\}/);
  assert.match(overlay, /onClick=\{onClose\}/);
});
