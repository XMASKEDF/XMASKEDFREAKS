import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("Cloudflare playback uses the configured server-side runtime provider", async () => {
  const route = await source("app/api/live/playback/route.ts");
  const page = await source("app/live/page.tsx");
  const bridge = await source("lib/infrastructure/live-playback.ts");
  const runtime = await source("lib/infrastructure/provider-runtime.ts");
  assert.match(bridge, /STREAM_HEALTH_URL/);
  assert.match(bridge, /STREAM_PLAYBACK_BASE_URL/);
  assert.match(bridge, /CLOUDFLARE_STREAM_LIVE_INPUT_UID/);
  assert.match(bridge, /getStreamingProvider/);
  assert.match(bridge, /playbackUrl\("AUTO"\)/);
  assert.match(page, /getLivePlaybackRuntime/);
  assert.match(page, /playbackSource=\{playback\.source\}/);
  assert.match(runtime, /fetch\(this\.healthUrl/);
  assert.match(runtime, /status\?\.state/);
  assert.match(runtime, /normalizeStreamingState/);
  assert.match(runtime, /CONNECTED_TO_INGEST/);
  assert.match(runtime, /resolveStreamingPlaybackUrl/);
  assert.match(runtime, /exact-manifest/);
  assert.match(runtime, /manifestPath\.endsWith\("\.m3u8"\)/);
  assert.doesNotMatch(route, /CLOUDFLARE_API_TOKEN/);
});

test("Live delivery waits for a resolved source, uses no preload, and bounds provider retries", async () => {
  const room = await source("components/LiveRoom.tsx");
  const hook = await source("hooks/useLiveDeliverySession.ts");
  assert.match(room, /fetch\("\/api\/live\/playback"/);
  assert.match(room, /preload="none"/);
  assert.match(hook, /retryCountRef\.current >= 2/);
  assert.match(hook, /window\.clearTimeout\(retryTimerRef\.current\)/);
  assert.match(hook, /xmf:live-playback-state/);
});

test("Live route exits tear down only the visitor playback source", async () => {
  const hook = await source("hooks/useLiveDeliverySession.ts");
  assert.match(hook, /window\.addEventListener\("pagehide"/);
  assert.match(hook, /window\.addEventListener\("beforeunload"/);
  assert.match(hook, /video\.removeAttribute\("src"\)/);
  assert.doesNotMatch(hook, /CLOUDFLARE_STREAM_LIVE_INPUT_UID.*stop/i);
});

test("Live playback uses native HLS first and one bounded HLS.js fallback", async () => {
  const hook = await source("hooks/useLiveDeliverySession.ts");
  assert.match(hook, /import Hls from "hls\.js"/);
  assert.match(hook, /canPlayType\("application\/vnd\.apple\.mpegurl"\)/);
  assert.match(hook, /Hls\.isSupported\(\)/);
  assert.match(hook, /hls\.loadSource\(source\)/);
  assert.equal((hook.match(/new Hls\(/g) || []).length, 1);
  assert.match(hook, /hlsRef\.current = hls/);
  assert.match(hook, /hlsRef\.current\.destroy\(\)/);
  assert.match(hook, /recoverMediaError\(\)/);
  assert.match(hook, /startLoad\(\)/);
  assert.match(hook, /hls_fatal_error/);
  assert.match(hook, /video\.preload = "auto"/);
  assert.match(hook, /JSON\.stringify/);
  assert.match(hook, /AUTOPLAY_BLOCKED/);
  assert.match(hook, /HLS_FATAL_ERROR/);
  assert.match(hook, /videoRef\.current/);
  assert.match(hook, /if \(!enabled \|\| !source\)/);
  assert.match(hook, /if \(!video\)/);
});
