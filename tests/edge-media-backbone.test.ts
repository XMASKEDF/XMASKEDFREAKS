import assert from "node:assert/strict";
import test from "node:test";
import { isActiveGameplayRoute, isTurnstileCandidateRoute } from "@/lib/infrastructure/bot-policy";
import { getBotProtectionProvider, turnstileMode } from "@/lib/infrastructure/security-edge";
import { extractMediaMetadata, isCompatibleMp4 } from "@/lib/media/processor";

test("game routes remain outside the interactive challenge candidate set", () => {
  assert.equal(isActiveGameplayRoute("/api/games/scores"), true);
  assert.equal(isTurnstileCandidateRoute("/api/games/scores"), false);
  assert.equal(isTurnstileCandidateRoute("/api/checkout/start"), true);
  assert.equal(isTurnstileCandidateRoute("/api/webhooks/payment"), false);
});

test("Turnstile is opt-in and normalizes unknown modes safely", () => {
  assert.equal(turnstileMode("disabled"), "disabled");
  assert.equal(turnstileMode("observe"), "observe");
  assert.equal(turnstileMode("active"), "active");
  assert.equal(turnstileMode("unexpected"), "disabled");
});

test("active Turnstile fails closed when server configuration is incomplete", async () => {
  const previousMode = process.env.TURNSTILE_MODE;
  const previousSiteKey = process.env.TURNSTILE_SITE_KEY;
  const previousPublicSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const previousSecret = process.env.TURNSTILE_SECRET_KEY;
  process.env.TURNSTILE_MODE = "active";
  delete process.env.TURNSTILE_SITE_KEY;
  delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;
  try {
    const decision = await getBotProtectionProvider().evaluate({ action: "/api/auth/signup", abuseScore: 100 });
    assert.equal(decision.required, true);
    assert.match(decision.reason, /configuration is incomplete/);
  } finally {
    if (previousMode === undefined) delete process.env.TURNSTILE_MODE; else process.env.TURNSTILE_MODE = previousMode;
    if (previousSiteKey === undefined) delete process.env.TURNSTILE_SITE_KEY; else process.env.TURNSTILE_SITE_KEY = previousSiteKey;
    if (previousPublicSiteKey === undefined) delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY; else process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = previousPublicSiteKey;
    if (previousSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY; else process.env.TURNSTILE_SECRET_KEY = previousSecret;
  }
});

test("media probe metadata identifies a compatible H264/AAC MP4", () => {
  const metadata = extractMediaMetadata({ format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "12.5", bit_rate: "320000" }, streams: [{ codec_type: "video", codec_name: "h264", width: 1920, height: 1080 }, { codec_type: "audio", codec_name: "aac" }] });
  assert.deepEqual(metadata, { durationSeconds: 12.5, width: 1920, height: 1080, container: "mov,mp4,m4a,3gp,3g2,mj2", videoCodec: "h264", audioCodec: "aac", bitrate: 320000 });
  assert.equal(isCompatibleMp4(metadata), true);
  assert.equal(isCompatibleMp4({ ...metadata, container: "webm" }), false);
});
