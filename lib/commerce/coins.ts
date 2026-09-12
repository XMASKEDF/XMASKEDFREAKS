export const COIN_VALUE_CENTS = 50 as const;
export const PHYSICAL_MERCH_PAYMENT_MODE = "coins_only" as const;

function assertMinorUnits(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer amount in cents.`);
}

export function coinsToCents(coins: number) {
  if (!Number.isSafeInteger(coins) || coins < 0) throw new Error("Coins must be a non-negative whole number.");
  return coins * COIN_VALUE_CENTS;
}

export function centsToCoinsCeil(cents: number) {
  assertMinorUnits(cents, "Amount");
  return Math.ceil(cents / COIN_VALUE_CENTS);
}

export function buildCoinQuote(parts: { merchandiseCents: number; shippingCents: number; taxCents: number }) {
  assertMinorUnits(parts.merchandiseCents, "Merchandise");
  assertMinorUnits(parts.shippingCents, "Shipping");
  assertMinorUnits(parts.taxCents, "Tax");
  const merchandiseCoins = centsToCoinsCeil(parts.merchandiseCents);
  const shippingCoins = centsToCoinsCeil(parts.shippingCents);
  const taxCoins = centsToCoinsCeil(parts.taxCents);
  const totalCents = parts.merchandiseCents + parts.shippingCents + parts.taxCents;
  const totalCoins = merchandiseCoins + shippingCoins + taxCoins;
  return {
    ...parts,
    merchandiseCoins,
    shippingCoins,
    taxCoins,
    totalCents,
    totalCoins,
    chargedEquivalentCents: coinsToCents(totalCoins),
    roundingAdjustmentCents: coinsToCents(totalCoins) - totalCents,
    coinValueCents: COIN_VALUE_CENTS
  };
}

export function formatUsdFromCents(cents: number) {
  assertMinorUnits(cents, "Amount");
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function parseUsdToCents(value: unknown, label = "Amount", allowZero = true) {
  const text = String(value ?? "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error(`${label} must be a USD amount with no more than two decimal places.`);
  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || (!allowZero && cents <= 0)) throw new Error(`${label} must be ${allowZero ? "zero or greater" : "greater than zero"}.`);
  return cents;
}
