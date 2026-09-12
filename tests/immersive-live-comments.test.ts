import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ENTRY_GRACE_SECONDS, POST_ENTRY_GRACE_SECONDS } from "../lib/live/viewing-credit";
import { DEFAULT_CONTRIBUTION_SETTINGS, POST_ENTRY_GRACE_SECONDS as POLICY_GRACE_SECONDS } from "../lib/contribution-policy";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("immersive Live uses the existing player and keeps the control in the bottom-left safe zone", async () => {
  const [room, feed, css] = await Promise.all([
    source("components/LiveRoom.tsx"),
    source("components/live/LiveCommentFeed.tsx"),
    source("app/globals.css")
  ]);
  assert.equal((room.match(/<LiveVideoSurface\b/g) || []).length, 1);
  assert.match(room, /<LiveCommentFeed sandbox=\{sandbox\} liveSessionId="daily-live" \/>/);
  assert.match(room, /immersiveMode/);
  assert.match(room, /xmf-live-immersive/);
  assert.match(css, /\.immersive-live-toggle\s*\{[\s\S]*left:\s*\.8rem[\s\S]*bottom:\s*calc\(\.8rem \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /\.site-shell\.immersive-live-mode\s*\{[\s\S]*position:\s*fixed[\s\S]*inset:\s*0/);
  assert.match(feed, /setInterval\(poll, 8_000\)/);
  assert.match(feed, /MAX_EVENTS = 40/);
});

test("entry grace is five minutes and begins from confirmed credit, not reminder display", async () => {
  const [accessRoute, migration, creditMigration] = await Promise.all([
    source("app/api/access-control/route.ts"),
    source("supabase/migrations/20260911100000_live_post_entry_grace_5_minutes.sql"),
    source("supabase/migrations/20260905130000_live_hourly_viewing_credit.sql")
  ]);
  assert.equal(ENTRY_GRACE_SECONDS, 300);
  assert.equal(POST_ENTRY_GRACE_SECONDS, 300);
  assert.equal(POLICY_GRACE_SECONDS, 300);
  assert.equal(DEFAULT_CONTRIBUTION_SETTINGS.graceSeconds, 300);
  assert.match(accessRoute, /action === "activity"[\s\S]*tip_reminder_confirmed/);
  const reminderBranch = accessRoute.match(/if \(!duplicate && action === "reminder_displayed"\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.doesNotMatch(reminderBranch, /graceAt =/);
  assert.match(migration, /grace_seconds = 300/);
  assert.match(migration, /entry_grace_seconds set default 300/);
  assert.match(migration, /p_action = 'reminder_displayed' then '\{\}'::jsonb/);
  assert.match(creditMigration, /grace_expires_at = case when is_new_entry/);
});

test("public comments and confirmed tips share one capped feed while Admin blocks remain manual", async () => {
  const [api, feed, adminApi, adminUi] = await Promise.all([
    source("app/api/live/comments/route.ts"),
    source("components/live/LiveCommentFeed.tsx"),
    source("app/api/admin/live-chat/route.ts"),
    source("components/admin/AdminChatManagement.tsx")
  ]);
  assert.match(api, /live_comments/);
  assert.match(api, /public_live_tip_events/);
  assert.match(api, /MAX_EVENTS = 40/);
  assert.match(api, /slice\(-MAX_EVENTS\)/);
  assert.match(api, /MAX_MESSAGES_PER_WINDOW/);
  assert.match(api, /\["presence", "away", "leave"\]/);
  assert.match(feed, /sendBeacon\("\/api\/live\/comments"/);
  assert.match(feed, /20_000/);
  assert.ok(api.includes("/<\\/?[a-z]"));
  assert.doesNotMatch(api, /profanity|offensive|detectModeration|AI moderation/i);
  assert.match(adminApi, /live_chat_blocks/);
  assert.match(adminApi, /live_chat_participant_blocked/);
  assert.match(adminUi, /Block permanently/);
  assert.match(adminUi, /Manual Admin chat decision/);
});
