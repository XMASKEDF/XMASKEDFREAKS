import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  COIN_VALUE_USD,
  DEFAULT_CONTRIBUTION_SETTINGS,
  FIRST_LIVE_REMINDER_SECONDS,
  SECOND_LIVE_REMINDER_SECONDS,
  UNPAID_LIVE_CUTOFF_SECONDS,
  coinsToUsd,
  contributionSatisfied,
  exemptionForContribution,
  publicTipEvent,
  sanitizePublicTipName
} from "../lib/contribution-policy.ts";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("the Live entry threshold and reminder timing remain authoritative", () => {
  assert.equal(COIN_VALUE_USD, 0.5);
  assert.equal(DEFAULT_CONTRIBUTION_SETTINGS.requiredCoins, 10);
  assert.equal(DEFAULT_CONTRIBUTION_SETTINGS.periodSeconds, 1500);
  assert.equal(coinsToUsd(10), 5);
  assert.equal(DEFAULT_CONTRIBUTION_SETTINGS.reminderDurationSeconds, 16);
  assert.equal(FIRST_LIVE_REMINDER_SECONDS, 106);
  assert.equal(SECOND_LIVE_REMINDER_SECONDS, 130);
  assert.equal(UNPAID_LIVE_CUTOFF_SECONDS, 166);
});

test("several confirmed tips may total ten coins, while nine does not qualify", () => {
  assert.equal(contributionSatisfied(9, 0), false);
  assert.equal(contributionSatisfied(10, 0), true);
  assert.equal(contributionSatisfied(4 + 3 + 3, 0), true);
  assert.equal(contributionSatisfied(4, 5), false);
  assert.equal(contributionSatisfied(5, 5), true);
});

test("twenty coins creates the default large-tip exemption", () => {
  assert.equal(exemptionForContribution("tip", 19), null);
  assert.equal(exemptionForContribution("tip", 20), "large_tip");
  assert.equal(exemptionForContribution("coin_purchase", 100), null);
  assert.equal(exemptionForContribution("merchandise", 100), null);
});

test("public tip events never use email as a public fallback or expose wallet state", () => {
  assert.equal(sanitizePublicTipName({ displayName: "person@example.com" }), "Guest");
  assert.equal(sanitizePublicTipName({ nickname: "MayaFan" }), "MayaFan");
  assert.equal(sanitizePublicTipName({ displayName: "MayaFan", anonymous: true }), "Anonymous");
  const event = publicTipEvent({ displayName: "Guest 1", coins: 6, transactionId: "tip-1", message: "Great show" });
  assert.deepEqual(Object.keys(event).sort(), ["coins", "createdAt", "displayName", "id", "message"]);
  assert.equal(JSON.stringify(event).includes("balance"), false);
});

test("the API relies on server transitions and an HTTP-only guest reference", async () => {
  const route = await source("app/api/access-control/route.ts");
  assert.match(route, /transition_contribution_period/);
  assert.match(route, /httpOnly:\s*true/);
  assert.match(route, /getApiUser/);
  assert.doesNotMatch(route, /body\\.expiresAt|body\\.amount/);
});

test("activity, reminder dedupe, bounded checkout protection, A and V are persisted", async () => {
  const migration = await source("supabase/migrations/20260731090000_contribution_rule_activity_bad_accounts.sql");
  assert.match(migration, /contribution_watch_periods/);
  assert.match(migration, /contribution_activity_events/);
  assert.match(migration, /event_key text not null unique/);
  assert.match(migration, /checkout_protection_seconds/);
  assert.match(migration, /admin_reinstatement_count=admin_reinstatement_count\+1/);
  assert.match(migration, /violation_attempt_count=violation_attempt_count\+1/);
  assert.match(migration, /legacy_twenty_five_dollar_rule_disabled=true/);
});

test("only confirmed server transactions qualify and duplicate references are ignored", async () => {
  const tip = await source("app/api/tips/route.ts");
  const webhook = await source("app/api/webhooks/payments/[provider]/route.ts");
  const webhookHandler = await source("lib/payments/webhook-handler.ts");
  const migration = await source("supabase/migrations/20260731090000_contribution_rule_activity_bad_accounts.sql");
  assert.match(tip, /recordVerifiedContribution/);
  assert.match(webhook, /handleHostedPaymentWebhook/);
  assert.match(webhookHandler, /event\.status === "CONFIRMED"/);
  assert.match(webhookHandler, /recordVerifiedContribution/);
  assert.match(migration, /transaction_reference text not null unique/);
  assert.match(migration, /on conflict\(transaction_reference\) do nothing/);
});

test("the reminder is localized, centered, accessible, and exactly 16 seconds", async () => {
  const tracker = await source("components/ContributionActivityTracker.tsx");
  const reminder = await source("components/LiveTipReminder.tsx");
  const css = await source("app/globals.css");
  const english = JSON.parse(await source("public/locales/core/en.json")) as Record<string, string>;
  assert.match(reminder, /role="dialog"/);
  assert.match(reminder, /aria-modal="false"/);
  assert.match(tracker, /16_000/);
  assert.match(tracker, /reminderDeadlineRef/);
  assert.match(tracker, /BroadcastChannel/);
  assert.match(css, /contribution-reminder-layer/);
  assert.match(english["contribution.reminder.copy"], /\$5 or 10-coin entry/);
  assert.match(english["contribution.reminder.copy"], /5 minutes of complimentary grace/);
  assert.match(english["contribution.reminder.copy"], /32 coins provide one hour/);
  assert.doesNotMatch(english["contribution.reminder.copy"], /25 minutes/);
  assert.equal(english["contribution.reminder.minimum"], "{{coins}} COINS MINIMUM");
});

test("the 10-coin minimum is enforced by the Live authorities", async () => {
  const config = await source("lib/config.ts");
  const tracker = await source("components/ContributionActivityTracker.tsx");
  const admin = await source("app/api/admin/bad-accounts/route.ts");
  const migration = await source("supabase/migrations/20260905110000_live_contribution_minimum_10.sql");
  assert.match(config, /minimumAccessPayment: 5/);
  assert.match(config, /minimumAccessCoins: 10/);
  assert.match(tracker, /snapshot\?\.requiredCoins \|\| 10/);
  assert.match(admin, /required_coins: 10/);
  assert.match(migration, /required_coins set default 10/);
  assert.match(migration, /minimum_payment=5/);
  assert.match(migration, /coin_equivalent=10/);
});

test("first-visit Live timing has two reminder stages and an unpaid cutoff", async () => {
  const policy = await source("lib/contribution-policy.ts");
  const tracker = await source("components/ContributionActivityTracker.tsx");
  const hook = await source("hooks/useLiveDeliverySession.ts");
  const route = await source("app/api/access-control/route.ts");
  const migration = await source("supabase/migrations/20260905120000_live_active_viewer_analytics_and_cutoff.sql");
  assert.match(policy, /FIRST_LIVE_REMINDER_SECONDS = 1 \* 60 \+ 46/);
  assert.match(policy, /SECOND_LIVE_REMINDER_SECONDS = 2 \* 60 \+ 10/);
  assert.match(policy, /UNPAID_LIVE_CUTOFF_SECONDS = 2 \* 60 \+ 46/);
  assert.match(tracker, /reminderStage/);
  assert.match(tracker, /xmf:live-unpaid-cutoff/);
  assert.match(hook, /api\/live\/viewer-session/);
  assert.match(hook, /xmf:live-playback-state/);
  assert.match(route, /mediaActive === true/);
  assert.match(migration, /first_reminder_at_seconds integer not null default 106/);
  assert.match(migration, /second_reminder_at_seconds integer not null default 130/);
  assert.match(migration, /unpaid_cutoff_seconds integer not null default 166/);
  assert.match(migration, /transition_live_contribution_period/);
});

test("active viewer analytics uses sessions, minute buckets, and tip correlation without raw second rows", async () => {
  const api = await source("app/api/live/viewer-session/route.ts");
  const migration = await source("supabase/migrations/20260905120000_live_active_viewer_analytics_and_cutoff.sql");
  assert.match(api, /live_viewer_watch_minute_buckets/);
  assert.match(api, /live_viewer_tip_correlations/);
  assert.match(migration, /live_viewer_sessions/);
  assert.match(migration, /live_delivery_cost_settings/);
  assert.match(migration, /unit_price_minor integer not null default 100/);
  assert.match(migration, /live_viewer_economics/);
});

test("restricted attempts and redirects are limited to the protected Live route", async () => {
  const tracker = await source("components/ContributionActivityTracker.tsx");
  const route = await source("app/api/access-control/route.ts");
  assert.match(tracker, /pathname\.startsWith\("\/live"\).*restrictedAttemptRecordedRef/);
  assert.match(tracker, /pathname\.startsWith\("\/live"\)[\s\S]*window\.location\.assign\(`\/go\?/);
  assert.match(route, /This action is valid only for the protected Live route/);
});

test("browsing and checkout protection are bounded rather than renewable forever", async () => {
  const route = await source("app/api/access-control/route.ts");
  const migration = await source("supabase/migrations/20260731090000_contribution_rule_activity_bad_accounts.sql");
  assert.match(route, /checkoutStartedAt === null/);
  assert.match(route, /enforcementDeferredUntil \?\?=/);
  assert.match(migration, /checkout_started_at\s*:=\s*coalesce\(period\.checkout_started_at,now\(\)\)/);
  assert.match(migration, /enforcement_deferred_until\s*:=\s*coalesce\(period\.enforcement_deferred_until/);
});

test("Bad Accounts is protected by permission and two-factor checks", async () => {
  const page = await source("app/admin/bad-accounts/page.tsx");
  const api = await source("app/api/admin/bad-accounts/route.ts");
  const panel = await source("components/admin/AdminBadAccounts.tsx");
  assert.match(page, /two_factor_required/);
  assert.match(page, /hasAdminPermission/);
  assert.match(api, /admin\.customers\.manage/);
  assert.match(api, /auditAdminEvent/);
  assert.match(panel, /A\(\{item\.admin_reinstatement_count\}\)/);
  assert.match(panel, /V\(\{item\.violation_attempt_count\}\)/);
  assert.match(api, /admin_set_contribution_exemption/);
  assert.match(api, /restoredUntil/);
  assert.match(panel, /Restricted attempts/);
  assert.match(panel, /Verified contributions/);
});

test("temporary Admin restoration has a bounded server-enforced expiry", async () => {
  const migration = await source("supabase/migrations/20260731090000_contribution_rule_activity_bad_accounts.sql");
  assert.match(migration, /admin_temporary_restoration/);
  assert.match(migration, /restriction\.restored_until>now\(\)/);
  assert.match(migration, /exemption_expires_at=period\.exemption_expires_at/);
});

test("coin and merchandise exemption thresholds require Admin selection", () => {
  assert.equal(DEFAULT_CONTRIBUTION_SETTINGS.coinPurchaseThresholdCoins, null);
  assert.equal(DEFAULT_CONTRIBUTION_SETTINGS.merchandiseThresholdCoins, null);
  assert.equal(DEFAULT_CONTRIBUTION_SETTINGS.repeatAttemptThreshold, null);
});
