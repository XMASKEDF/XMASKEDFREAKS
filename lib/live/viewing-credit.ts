export const ENTRY_CONTRIBUTION_COINS = 10;
export const HOURLY_RATE_COINS = 32;
export const HOURLY_RATE_MINOR = 1600;
export const SECONDS_PER_COIN = 112.5;
export const HALF_SECONDS_PER_COIN = 225;
export const POST_ENTRY_GRACE_SECONDS = 5 * 60;
export const ENTRY_GRACE_SECONDS = POST_ENTRY_GRACE_SECONDS;
export const LOW_CREDIT_SECONDS = 120;
export const REFILL_REMINDER_SECONDS = 70;
export const REFILL_FINAL_SECONDS = 46;

export type ViewingCreditSnapshot = {
  entryRequirementSatisfied: boolean;
  graceExpiresAt: string | null;
  creditHalfSeconds: number;
  consumedHalfSeconds: number;
  lastConsumedAt: string | null;
};

export function coinsToCreditHalfSeconds(coins: number) {
  return Math.max(0, Math.floor(coins)) * HALF_SECONDS_PER_COIN;
}

export function creditHalfSecondsToSeconds(halfSeconds: number) {
  return Math.max(0, Math.floor(halfSeconds / 2));
}

export function splitEntryContribution(coins: number, entrySatisfied: boolean) {
  const normalizedCoins = Math.max(0, Math.floor(coins));
  if (entrySatisfied) return { entryCoins: 0, hourlyCoins: normalizedCoins };
  if (normalizedCoins < ENTRY_CONTRIBUTION_COINS) return { entryCoins: 0, hourlyCoins: 0 };
  return {
    entryCoins: ENTRY_CONTRIBUTION_COINS,
    hourlyCoins: normalizedCoins - ENTRY_CONTRIBUTION_COINS
  };
}

export function isGraceActive(graceExpiresAt: string | null, now = Date.now()) {
  return Boolean(graceExpiresAt && new Date(graceExpiresAt).getTime() > now);
}

export function creditWarningLevel(halfSeconds: number, graceExpiresAt: string | null, now = Date.now()) {
  if (isGraceActive(graceExpiresAt, now)) return "grace" as const;
  const seconds = creditHalfSecondsToSeconds(halfSeconds);
  if (seconds <= 0) return "empty" as const;
  if (seconds <= REFILL_FINAL_SECONDS) return "final" as const;
  if (seconds <= REFILL_REMINDER_SECONDS) return "reminder" as const;
  if (seconds <= 106) return "strong" as const;
  if (seconds <= LOW_CREDIT_SECONDS) return "low" as const;
  return "healthy" as const;
}

export function formatViewingCredit(halfSeconds: number) {
  const totalSeconds = creditHalfSecondsToSeconds(halfSeconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}
