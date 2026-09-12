import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateActiveWatchSeconds,
  nextContributionClockThreshold,
  type ContributionClockProgress
} from "../lib/live/contribution-clock.ts";

const baseProgress: ContributionClockProgress = {
  activeWatchSeconds: 0,
  firstReminderDisplayed: false,
  firstReminderDismissed: false,
  secondReminderDisplayed: false,
  secondReminderDismissed: false,
  requirementSatisfied: false,
  exempt: false,
  checkoutProtected: false,
  unpaidPlaybackStopped: false
};

test("active watch clock preserves fractional elapsed time across pause/resume", () => {
  assert.equal(estimateActiveWatchSeconds(105, 1_000, 1_900), 105.9);
  assert.equal(estimateActiveWatchSeconds(105.9, null, 99_999), 105.9);
  assert.equal(estimateActiveWatchSeconds(105.9, 10_000, 10_100), 106);
});

test("contribution thresholds follow the two reminder stages and cutoff", () => {
  assert.equal(nextContributionClockThreshold(baseProgress), 106);
  assert.equal(nextContributionClockThreshold({ ...baseProgress, firstReminderDisplayed: true }), null);
  assert.equal(nextContributionClockThreshold({ ...baseProgress, firstReminderDisplayed: true, firstReminderDismissed: true }), 130);
  assert.equal(nextContributionClockThreshold({ ...baseProgress, firstReminderDisplayed: true, firstReminderDismissed: true, secondReminderDisplayed: true }), null);
  assert.equal(nextContributionClockThreshold({ ...baseProgress, firstReminderDisplayed: true, firstReminderDismissed: true, secondReminderDisplayed: true, secondReminderDismissed: true }), 166);
  assert.equal(nextContributionClockThreshold({ ...baseProgress, requirementSatisfied: true }), null);
});
