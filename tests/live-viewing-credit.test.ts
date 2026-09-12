import test from "node:test";
import assert from "node:assert/strict";
import {
  creditHalfSecondsToSeconds,
  creditWarningLevel,
  coinsToCreditHalfSeconds,
  splitEntryContribution
} from "@/lib/live/viewing-credit";

test("hourly rate uses integer half-seconds without rounding drift", () => {
  assert.equal(coinsToCreditHalfSeconds(8), 8 * 225);
  assert.equal(creditHalfSecondsToSeconds(coinsToCreditHalfSeconds(32)), 3600);
  assert.equal(creditHalfSecondsToSeconds(coinsToCreditHalfSeconds(64)), 7200);
});

test("the first qualifying contribution splits entry from hourly credit", () => {
  assert.deepEqual(splitEntryContribution(10, false), { entryCoins: 10, hourlyCoins: 0 });
  assert.deepEqual(splitEntryContribution(42, false), { entryCoins: 10, hourlyCoins: 32 });
  assert.deepEqual(splitEntryContribution(32, true), { entryCoins: 0, hourlyCoins: 32 });
  assert.deepEqual(splitEntryContribution(9, false), { entryCoins: 0, hourlyCoins: 0 });
});

test("low-credit warnings use the requested thresholds", () => {
  assert.equal(creditWarningLevel(240, null), "low");
  assert.equal(creditWarningLevel(212, null), "strong");
  assert.equal(creditWarningLevel(140, null), "reminder");
  assert.equal(creditWarningLevel(92, null), "final");
  assert.equal(creditWarningLevel(0, null), "empty");
  assert.equal(creditWarningLevel(0, new Date(Date.now() + 60_000).toISOString()), "grace");
});
