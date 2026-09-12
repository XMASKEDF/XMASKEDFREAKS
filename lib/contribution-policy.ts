export const CONTRIBUTION_RULE_NAME = "Live Entry and Refillable Viewing Credit";
export const COIN_VALUE_USD = 0.5;
export const FIRST_LIVE_REMINDER_SECONDS = 1 * 60 + 46;
export const SECOND_LIVE_REMINDER_SECONDS = 2 * 60 + 10;
export const UNPAID_LIVE_CUTOFF_SECONDS = 2 * 60 + 46;
export const POST_CONTRIBUTION_REMINDER_SECONDS = 20 * 60;
export const POST_ENTRY_GRACE_SECONDS = 5 * 60;

export type ContributionCategory = "tip" | "coin_purchase" | "merchandise" | "digital_purchase" | "approved_purchase";
export type ActivityCategory = "browsing" | "contribution";
export type ReminderCloseReason = "manual" | "expired";
export type ExemptionScope = "current_period" | "live_session" | "future_sessions";

export type ContributionSettings = {
  periodSeconds: number;
  requiredCoins: number;
  reminderAtSeconds: number;
  secondReminderAtSeconds: number;
  unpaidCutoffSeconds: number;
  postContributionReminderAtSeconds: number;
  reminderDurationSeconds: number;
  graceSeconds: number;
  ignoredNoticesBeforeRestriction: number;
  repeatAttemptThreshold: number | null;
  largeTipThresholdCoins: number;
  coinPurchaseThresholdCoins: number | null;
  merchandiseThresholdCoins: number | null;
  exemptionDurationMinutes: number;
  maximumExemptionMinutes: number;
  exemptionScope: ExemptionScope;
  eligiblePurchaseCategories: ContributionCategory[];
  activityProtectionSeconds: number;
  checkoutProtectionSeconds: number;
  anonymousTipEventsEnabled: boolean;
  publicTipMessagesEnabled: boolean;
};

export const DEFAULT_CONTRIBUTION_SETTINGS: ContributionSettings = {
  periodSeconds: 25 * 60,
  requiredCoins: 10,
  reminderAtSeconds: FIRST_LIVE_REMINDER_SECONDS,
  secondReminderAtSeconds: SECOND_LIVE_REMINDER_SECONDS,
  unpaidCutoffSeconds: UNPAID_LIVE_CUTOFF_SECONDS,
  postContributionReminderAtSeconds: POST_CONTRIBUTION_REMINDER_SECONDS,
  reminderDurationSeconds: 16,
  graceSeconds: POST_ENTRY_GRACE_SECONDS,
  ignoredNoticesBeforeRestriction: 1,
  repeatAttemptThreshold: null,
  largeTipThresholdCoins: 20,
  coinPurchaseThresholdCoins: null,
  merchandiseThresholdCoins: null,
  exemptionDurationMinutes: 60,
  maximumExemptionMinutes: 24 * 60,
  exemptionScope: "current_period",
  eligiblePurchaseCategories: ["tip", "coin_purchase", "merchandise", "digital_purchase"],
  activityProtectionSeconds: 5 * 60,
  checkoutProtectionSeconds: 10 * 60,
  anonymousTipEventsEnabled: true,
  publicTipMessagesEnabled: true
};

export type ContributionPeriodSnapshot = {
  periodId: string;
  activeWatchSeconds: number;
  contributedCoins: number;
  purchaseCoins: number;
  requirementSatisfied: boolean;
  reminderDue: boolean;
  reminderStage: "first" | "second" | null;
  reminderDisplayed: boolean;
  reminderDismissed: boolean;
  reminderCloseReason: ReminderCloseReason | null;
  restricted: boolean;
  restrictionReason: string | null;
  exempt: boolean;
  exemptionReason: string | null;
  exemptionExpiresAt: string | null;
  checkoutProtected: boolean;
  graceExpiresAt: string | null;
  redirectToClips4Sale: boolean;
  violationAttempts: number;
  unpaidPlaybackStopped: boolean;
};

export type ContributionReminderProgress = {
  activeWatchSeconds: number;
  firstReminderDisplayed: boolean;
  firstReminderDismissed: boolean;
  secondReminderDisplayed: boolean;
  secondReminderDismissed: boolean;
  requirementSatisfied: boolean;
  exempt: boolean;
  checkoutProtected: boolean;
  unpaidPlaybackStopped: boolean;
};

export function deriveContributionReminderState(progress: ContributionReminderProgress, settings = DEFAULT_CONTRIBUTION_SETTINGS) {
  const firstReminderActive = progress.firstReminderDisplayed && !progress.firstReminderDismissed;
  const secondReminderActive = progress.secondReminderDisplayed && !progress.secondReminderDismissed;
  const firstReminderDue = !progress.firstReminderDisplayed && progress.activeWatchSeconds >= settings.reminderAtSeconds;
  const secondReminderDue = progress.firstReminderDismissed && !progress.secondReminderDisplayed && progress.activeWatchSeconds >= settings.secondReminderAtSeconds;
  const reminderDue = !progress.requirementSatisfied && !progress.exempt && !progress.checkoutProtected && !progress.unpaidPlaybackStopped
    && (firstReminderActive || secondReminderActive || firstReminderDue || secondReminderDue);
  return {
    reminderDue,
    reminderStage: !reminderDue ? null : firstReminderActive || firstReminderDue ? "first" as const
      : secondReminderActive || secondReminderDue ? "second" as const : null
  };
}

export function canStartProtectedLivePlayback(input: { ready: boolean; restricted: boolean; unpaidPlaybackStopped: boolean }) {
  return input.ready && !input.restricted && !input.unpaidPlaybackStopped;
}

export function coinsToUsd(coins: number) {
  return Number((Math.max(0, coins) * COIN_VALUE_USD).toFixed(2));
}

export function contributionSatisfied(tipCoins: number, purchaseCoins: number, requiredCoins = DEFAULT_CONTRIBUTION_SETTINGS.requiredCoins) {
  return Math.max(0, Math.floor(tipCoins)) + Math.max(0, Math.floor(purchaseCoins)) >= Math.max(1, Math.floor(requiredCoins));
}

export function exemptionForContribution(category: ContributionCategory, coins: number, settings = DEFAULT_CONTRIBUTION_SETTINGS) {
  const confirmedCoins = Math.max(0, Math.floor(coins));
  if (category === "tip" && confirmedCoins >= settings.largeTipThresholdCoins) return "large_tip";
  if (category === "coin_purchase" && settings.coinPurchaseThresholdCoins !== null && confirmedCoins >= settings.coinPurchaseThresholdCoins) return "qualifying_coin_purchase";
  if (category === "merchandise" && settings.merchandiseThresholdCoins !== null && confirmedCoins >= settings.merchandiseThresholdCoins) return "qualifying_merchandise_purchase";
  if (settings.eligiblePurchaseCategories.includes(category) && !["tip", "coin_purchase", "merchandise"].includes(category)) return "approved_purchase";
  return null;
}

export function sanitizePublicTipName(input: { displayName?: unknown; nickname?: unknown; anonymous?: boolean }) {
  if (input.anonymous) return "Anonymous";
  for (const value of [input.displayName, input.nickname]) {
    const raw = String(value || "").trim();
    if (!raw || raw.includes("@")) continue;
    const candidate = raw.replace(/[^\p{L}\p{N}_ -]/gu, "").trim().slice(0, 24);
    if (candidate) return candidate;
  }
  return "Guest";
}

export function sanitizePublicTipMessage(value: unknown) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

export function publicTipEvent(input: { displayName?: unknown; nickname?: unknown; anonymous?: boolean; coins: number; message?: unknown; transactionId: string; createdAt?: string }) {
  return {
    id: input.transactionId,
    displayName: sanitizePublicTipName(input),
    coins: Math.max(1, Math.floor(input.coins)),
    message: sanitizePublicTipMessage(input.message),
    createdAt: input.createdAt || new Date().toISOString()
  };
}
