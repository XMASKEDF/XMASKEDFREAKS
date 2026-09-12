import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { defaultCoinPackages, quoteCoinPackage } from "../lib/config.ts";

test("the shared coin catalog exposes six ordered slots with permanent base conversion", () => {
  assert.equal(defaultCoinPackages.length, 6);
  assert.deepEqual(defaultCoinPackages.map((item) => item.amount), [5, 10, 16, 25, 50, 100]);
  assert.deepEqual(defaultCoinPackages.map((item) => item.baseCoins), [10, 20, 32, 50, 100, 200]);
  assert.deepEqual(defaultCoinPackages.map((item) => item.bonusCoins), [0, 0, 0, 0, 0, 0]);
  assert.equal(new Set(defaultCoinPackages.map((item) => item.id)).size, 6);
  assert.deepEqual(defaultCoinPackages.map((item) => item.order), [1, 2, 3, 4, 5, 6]);
});

test("package quotes expose exact USD minor units and explicit base/bonus/total values", () => {
  const quotes = defaultCoinPackages.map(quoteCoinPackage);
  assert.deepEqual(quotes.map((quote) => quote.amountCents), [500, 1000, 1600, 2500, 5000, 10000]);
  assert.deepEqual(quotes.map((quote) => quote.totalCoins), [10, 20, 32, 50, 100, 200]);
  assert.ok(quotes.every((quote) => quote.bonusCoins === 0 && quote.bonusPercent === 0));
});

test("the purchase path re-reads the shared catalog and the UI remains six-up and responsive", () => {
  const route = readFileSync(new URL("../app/api/payments/hosted/route.ts", import.meta.url), "utf8");
  const room = readFileSync(new URL("../components/LiveRoom.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(route, /getOperationalCoinPackage/);
  assert.match(route, /quoteCoinPackage\(coinPackage\)/);
  assert.match(room, /defaultCoinPackages/);
  assert.match(styles, /\.coin-package-grid \{[\s\S]*grid-template-columns: repeat\(6/);
  assert.match(styles, /\.live-coin-package-grid \{ display:grid; grid-template-columns:repeat\(6/);
  assert.match(styles, /\.coin-package-grid \{ grid-template-columns: repeat\(3/);
  assert.match(styles, /\.live-coin-package-grid \{ grid-template-columns:repeat\(2/);
});
