import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canStartProtectedLivePlayback,
  deriveContributionReminderState,
  DEFAULT_CONTRIBUTION_SETTINGS
} from "../lib/contribution-policy";

const baseProgress = {
  firstReminderDisplayed: false,
  firstReminderDismissed: false,
  secondReminderDisplayed: false,
  secondReminderDismissed: false,
  requirementSatisfied: false,
  exempt: false,
  checkoutProtected: false,
  unpaidPlaybackStopped: false
};

function progress(activeWatchSeconds: number, overrides: Partial<typeof baseProgress> = {}) {
  return deriveContributionReminderState({ activeWatchSeconds, ...baseProgress, ...overrides });
}

test("refresh-proof reminder stages preserve the authoritative current window", () => {
  assert.deepEqual(progress(30), { reminderDue: false, reminderStage: null });
  assert.deepEqual(progress(DEFAULT_CONTRIBUTION_SETTINGS.reminderAtSeconds), { reminderDue: true, reminderStage: "first" });
  assert.deepEqual(progress(115, { firstReminderDisplayed: true }), { reminderDue: true, reminderStage: "first" });
  assert.deepEqual(progress(DEFAULT_CONTRIBUTION_SETTINGS.secondReminderAtSeconds, { firstReminderDisplayed: true, firstReminderDismissed: true }), { reminderDue: true, reminderStage: "second" });
  assert.deepEqual(progress(145, { firstReminderDisplayed: true, firstReminderDismissed: true, secondReminderDisplayed: true }), { reminderDue: true, reminderStage: "second" });
  assert.deepEqual(progress(145, { firstReminderDisplayed: true, firstReminderDismissed: true, secondReminderDisplayed: true, secondReminderDismissed: true }), { reminderDue: false, reminderStage: null });
  assert.deepEqual(progress(DEFAULT_CONTRIBUTION_SETTINGS.unpaidCutoffSeconds, { firstReminderDisplayed: true, firstReminderDismissed: true, secondReminderDisplayed: true, unpaidPlaybackStopped: true }), { reminderDue: false, reminderStage: null });
});

test("paid, restricted, and unavailable state controls Live delivery", () => {
  assert.equal(canStartProtectedLivePlayback({ ready: false, restricted: false, unpaidPlaybackStopped: false }), false);
  assert.equal(canStartProtectedLivePlayback({ ready: true, restricted: true, unpaidPlaybackStopped: false }), false);
  assert.equal(canStartProtectedLivePlayback({ ready: true, restricted: false, unpaidPlaybackStopped: true }), false);
  assert.equal(canStartProtectedLivePlayback({ ready: true, restricted: false, unpaidPlaybackStopped: false }), true);
});

test("server state is the refresh identity and client timers are not enforcement state", async () => {
  const tracker = await readFile(new URL("../components/ContributionActivityTracker.tsx", import.meta.url), "utf8");
  const accessRoute = await readFile(new URL("../app/api/access-control/route.ts", import.meta.url), "utf8");
  const room = await readFile(new URL("../components/LiveRoom.tsx", import.meta.url), "utf8");

  assert.match(tracker, /xmf_contribution_guest|xmf:contribution-state/);
  assert.match(tracker, /ready: true/);
  assert.match(accessRoute, /databaseTransition/);
  assert.match(accessRoute, /deriveContributionReminderState/);
  assert.match(room, /contributionStateReady/);
  assert.match(room, /contributionUnpaidPlaybackStopped/);
  assert.match(room, /canStartProtectedLivePlayback/);
  assert.doesNotMatch(tracker, /localStorage\.setItem\([^,]+,\s*JSON\.stringify\([^)]*activeWatchSeconds/);
});
