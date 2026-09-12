import { DEFAULT_CONTRIBUTION_SETTINGS, type ContributionPeriodSnapshot, type ContributionSettings } from "@/lib/contribution-policy";

export type ContributionClockProgress = Pick<
  ContributionPeriodSnapshot,
  | "activeWatchSeconds"
  | "requirementSatisfied"
  | "exempt"
  | "checkoutProtected"
  | "unpaidPlaybackStopped"
> & {
  firstReminderDisplayed: boolean;
  firstReminderDismissed: boolean;
  secondReminderDisplayed: boolean;
  secondReminderDismissed: boolean;
};

export function estimateActiveWatchSeconds(
  baseSeconds: number,
  activeStartedAtMs: number | null,
  nowMs = Date.now()
) {
  const normalizedBase = Math.max(0, Number(baseSeconds) || 0);
  if (activeStartedAtMs === null) return normalizedBase;
  const elapsedSeconds = Math.max(0, nowMs - activeStartedAtMs) / 1000;
  return normalizedBase + elapsedSeconds;
}

export function nextContributionClockThreshold(
  progress: ContributionClockProgress,
  settings: ContributionSettings = DEFAULT_CONTRIBUTION_SETTINGS
) {
  if (progress.requirementSatisfied || progress.exempt || progress.checkoutProtected || progress.unpaidPlaybackStopped) return null;
  if (!progress.firstReminderDisplayed) return settings.reminderAtSeconds;
  if (!progress.firstReminderDismissed) return null;
  if (!progress.secondReminderDisplayed) return settings.secondReminderAtSeconds;
  if (!progress.secondReminderDismissed) return null;
  return settings.unpaidCutoffSeconds;
}
