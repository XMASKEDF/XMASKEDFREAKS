import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildCoinQuote, centsToCoinsCeil, coinsToCents } from "../lib/commerce/coins.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("one platform coin is exactly fifty USD cents", () => {
  assert.equal(coinsToCents(1), 50);
  assert.equal(coinsToCents(140), 7_000);
  assert.equal(centsToCoinsCeil(50_000), 1_000);
});

test("shipping and tax round upward independently to whole coins", () => {
  const quote = buildCoinQuote({ merchandiseCents: 7_000, shippingCents: 1_421, taxCents: 383 });
  assert.deepEqual({
    merchandiseCoins: quote.merchandiseCoins,
    shippingCoins: quote.shippingCoins,
    taxCoins: quote.taxCoins,
    totalCoins: quote.totalCoins,
    roundingAdjustmentCents: quote.roundingAdjustmentCents
  }, {
    merchandiseCoins: 140,
    shippingCoins: 29,
    taxCoins: 8,
    totalCoins: 177,
    roundingAdjustmentCents: 46
  });
});

test("minor-unit conversion rejects floats and negative values", () => {
  assert.throws(() => coinsToCents(1.5));
  assert.throws(() => centsToCoinsCeil(-1));
  assert.throws(() => buildCoinQuote({ merchandiseCents: 100, shippingCents: 2.5, taxCents: 0 }));
});

test("database checkout is quote-bound, row-locked, idempotent, and cannot create a negative wallet", () => {
  const migration = read("supabase/migrations/20260729091000_printify_coins_merch_languages.sql");
  assert.match(migration, /where user_id=p_user_id and idempotency_key=p_idempotency_key/);
  assert.match(migration, /where id=p_quote_id and user_id=p_user_id for update/);
  assert.match(migration, /select balance_tokens into balance_before[\s\S]+for update/);
  assert.match(migration, /if balance_before<quote\.total_coins then raise exception 'INSUFFICIENT_TOKENS'/);
  assert.match(migration, /quote\.shipping_coins<>ceil\(quote\.shipping_minor::numeric\/50\)/);
  assert.match(migration, /insert into printify_fulfillment_jobs\(order_id,status\)[\s\S]+on conflict\(order_id\) do nothing/);
  assert.match(migration, /for update skip locked/);
});

test("browser submits only an address for quoting and a saved quote id for physical completion", () => {
  const api = read("app/api/merch/route.ts");
  const provider = read("components/purchase/PurchaseProvider.tsx");
  assert.match(api, /quotePrintifyShipping/);
  assert.match(api, /quoteApplicableTax/);
  assert.match(api, /complete_printify_merch_checkout/);
  assert.match(provider, /body: JSON\.stringify\(\{ action: "quote", shippingAddress \}\)/);
  assert.match(provider, /quoteId: checkoutQuote\?\.id/);
});

test("Printify credentials remain server-only and public checkout requires live mode", () => {
  const printify = read("lib/commerce/printify.ts");
  const api = read("app/api/merch/route.ts");
  assert.match(printify, /import "server-only"/);
  assert.match(printify, /process\.env\.PRINTIFY_API_TOKEN/);
  assert.doesNotMatch(printify, /NEXT_PUBLIC_PRINTIFY/);
  assert.match(api, /printifyMode\(\) !== "live"/);
});

test("merch filter order includes Language after Material and before More Filters", () => {
  const storefront = read("components/merch/MerchStorefront.tsx");
  const orderedLabels = [
    't("merch.priceRange")',
    't("merch.sortBy")',
    't("merch.color")',
    't("merch.size")',
    't("merch.style")',
    't("merch.fit")',
    't("merch.material")',
    't("merch.language")',
    't("merch.moreFilters")'
  ];
  let cursor = -1;
  for (const label of orderedLabels) {
    const next = storefront.indexOf(label, cursor + 1);
    assert.ok(next > cursor, `${label} must follow the previous filter`);
    cursor = next;
  }
  assert.match(storefront, /\["languages", "language"\]/);
  assert.match(storefront, /window\.history\.replaceState/);
});

test("ADMIN owns language publication and Printify variant mappings", () => {
  const admin = read("components/admin/AdminPrintifyMerchPanel.tsx");
  const route = read("app/api/admin/merch/route.ts");
  assert.match(admin, /Published language filters/);
  assert.match(admin, /Printify variant ID/);
  assert.match(route, /action === "language-save"/);
  assert.match(route, /action === "fulfillment-save"/);
  assert.match(route, /product_merch_languages/);
});
