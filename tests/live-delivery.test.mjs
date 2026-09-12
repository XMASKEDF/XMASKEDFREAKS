import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("Live delivery has one teardown path for route exits and hidden tabs", async () => {
  const hook = await source("hooks/useLiveDeliverySession.ts");
  const room = await source("components/LiveRoom.tsx");
  assert.match(hook, /video\.preload = "none"/);
  assert.match(hook, /document\.addEventListener\("visibilitychange"/);
  assert.match(hook, /window\.addEventListener\("pagehide"/);
  assert.match(hook, /window\.addEventListener\("beforeunload"/);
  assert.match(hook, /video\.removeAttribute\("src"\)/);
  assert.match(hook, /video\.load\(\)/);
  assert.match(room, /const contributionDeliveryEnabled = Boolean\(videoSource\) && ageOk && !moderationBlocked/);
  assert.match(room, /canStartProtectedLivePlayback/);
  assert.match(room, /const livePresenceActive = Boolean\(videoSource\) && ageOk && !moderationBlocked/);
  assert.match(room, /preload="none"/);
  assert.doesNotMatch(room, /src=\{videoSource \|\| undefined\}/);
});

test("delivery analytics use the existing consent-aware analytics transport", async () => {
  const hook = await source("hooks/useLiveDeliverySession.ts");
  const route = await source("app/api/analytics/events/route.ts");
  for (const event of ["live_page_visit", "live_playback_start", "live_playback_stop", "live_playback_resume", "live_route_exit_stop", "live_background_pause", "live_video_never_started", "live_active_watch"]) {
    assert.match(hook, new RegExp(event));
    assert.match(route, new RegExp(event));
  }
  assert.match(hook, /consent\.analytics/);
  assert.match(hook, /sendBeacon\("\/api\/analytics\/events"/);
});

test("the Live contribution threshold is 10 coins and five dollars", async () => {
  const config = await source("lib/config.ts");
  const policy = await source("lib/contribution-policy.ts");
  const migration = await source("supabase/migrations/20260905110000_live_contribution_minimum_10.sql");
  assert.match(config, /minimumAccessPayment: 5/);
  assert.match(config, /minimumAccessCoins: 10/);
  assert.match(policy, /requiredCoins: 10/);
  assert.match(migration, /required_coins set default 10/);
  assert.match(migration, /required_coins >= 10/);
  assert.match(migration, /minimum_payment=5/);
  assert.match(migration, /coin_equivalent=10/);
});

test("active viewer analytics is session and minute based", async () => {
  const hook = await source("hooks/useLiveDeliverySession.ts");
  const api = await source("app/api/live/viewer-session/route.ts");
  const migration = await source("supabase/migrations/20260905120000_live_active_viewer_analytics_and_cutoff.sql");
  assert.match(hook, /setInterval\(\(\) => reportSession\("heartbeat"\), 30_000\)/);
  assert.match(hook, /reportSession\("stop", \{ stopReason: "route_exit"/);
  assert.match(api, /live_viewer_sessions/);
  assert.match(api, /live_viewer_watch_minute_buckets/);
  assert.match(api, /live_viewer_tip_correlations/);
  assert.match(migration, /live_viewer_economics/);
});

test("Live economics remains Admin-only and uses real viewers for cost metrics", async () => {
  const route = await source("app/api/admin/analytics/live-economics/route.ts");
  assert.match(route, /hasAdminPermission/);
  assert.match(route, /live_viewer_sessions/);
  assert.match(route, /activeVideoViewers/);
  assert.match(route, /estimatedCloudflareCostUsd/);
  assert.match(route, /deliveredMinutes/);
  assert.match(route, /cohorts/);
});
