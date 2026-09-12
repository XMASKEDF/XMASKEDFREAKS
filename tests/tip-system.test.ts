import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateTokenDeduction, DEFAULT_TIP_OPTIONS, normalizeTipOptions, publicTipLabel, validateCustomTipTokens } from "../lib/tips.ts";

const expected = new Map([
  ["im-watching", 4],
  ["that-was-hot", 6],
  ["great-show", 8],
  ["need-more", 10],
  ["keep-going", 12],
  ["dont-stop", 16],
  ["okayyy-i-see-yall", 24],
  ["show-some-love", 40],
  ["turn-it-up", 60],
  ["keep-the-show-going", 80],
  ["favorite-creators", 100],
  ["vip-energy", 150],
  ["yall-wild", 300],
  ["cant-stop-watching", 50],
  ["worth-every-minute", 30],
  ["doing-amazing", 32],
  ["appreciate-content", 20],
  ["yall-nasty", 200],
  ["big-tipper", 400]
]);

test("the authoritative registry contains every approved stable ID and token cost", () => {
  assert.equal(DEFAULT_TIP_OPTIONS.length, 19);
  for (const option of DEFAULT_TIP_OPTIONS) assert.equal(option.tokenCost, expected.get(option.id));
});

test("persisted Admin edits are preserved while new default options are added", () => {
  const options = normalizeTipOptions([{ id: "great-show", phrase: "Updated Show", tokenCost: 9, enabled: false, displayOrder: 1 }]);
  assert.equal(options.length, 19);
  assert.deepEqual(options.find((option) => option.id === "great-show"), { ...DEFAULT_TIP_OPTIONS[0], phrase: "Updated Show", tokenCost: 9, enabled: false, mediaId: null, artworkUrl: "" });
  assert.equal(options.find((option) => option.id === "im-watching")?.tokenCost, 4);
});

test("public preset labels contain emoji, phrase, and tokens without cash copy", () => {
  for (const option of DEFAULT_TIP_OPTIONS) {
    const label = publicTipLabel(option);
    assert.match(label, new RegExp(String(option.tokenCost)));
    assert.match(label, /coins$/);
    assert.equal(label.includes("$"), false);
  }
});

test("deductions cannot make a token wallet negative", () => {
  assert.deepEqual(calculateTokenDeduction(8, 8), { ok: true, balanceBefore: 8, balanceAfter: 0, missingTokens: 0 });
  assert.deepEqual(calculateTokenDeduction(6, 8), { ok: false, balanceBefore: 6, balanceAfter: 6, missingTokens: 2 });
});

test("custom tips require safe whole-token values within configured limits", () => {
  assert.equal(validateCustomTipTokens(25).ok, true);
  assert.equal(validateCustomTipTokens(0).ok, false);
  assert.equal(validateCustomTipTokens(-4).ok, false);
  assert.equal(validateCustomTipTokens(4.5).ok, false);
  assert.equal(validateCustomTipTokens(Number.POSITIVE_INFINITY).ok, false);
  assert.equal(validateCustomTipTokens(1001).ok, false);
});

test("Tip Menu source contains no visible cash values and modal reasons are explicit", () => {
  const menu = readFileSync(new URL("../components/TipMenu.tsx", import.meta.url), "utf8");
  const modal = readFileSync(new URL("../components/RefillResumeModal.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(menu, /\$\d|USD|money\(|currency/i);
  for (const reason of ["insufficientTokens", "zeroBalance", "twentyFiveMinuteThreshold", "paymentCompleted", "paymentFailed"]) assert.match(modal, new RegExp(reason));
});

test("database schema enforces atomic balance locking and idempotency", () => {
  const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  assert.match(schema, /create or replace function public\.submit_live_tip/);
  assert.match(schema, /for update;/);
  assert.match(schema, /idempotency_key text unique not null/);
  assert.match(schema, /if before_balance < selected_tokens then raise exception 'INSUFFICIENT_TOKENS'/);
});

test("the existing weighted access redirect remains the threshold authority", () => {
  const liveRoom = readFileSync(new URL("../components/LiveRoom.tsx", import.meta.url), "utf8");
  assert.match(liveRoom, /const weightedAccessRedirect = useCallback/);
  assert.match(liveRoom, /onDeclineAccess=\{\(\) => weightedAccessRedirect\("visitor refused payment"\)\}/);
  assert.match(liveRoom, /weightedAccessRedirect\("checkout timeout"\)/);
});
