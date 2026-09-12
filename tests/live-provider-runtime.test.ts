import assert from "node:assert/strict";
import test from "node:test";
import { ConfiguredStreamingProvider, normalizeStreamingState, resolveStreamingPlaybackUrl } from "../lib/infrastructure/provider-runtime";

const response = (payload: unknown, ok = true) => ({ ok, json: async () => payload }) as Response;

test("Cloudflare status.state connected maps to LIVE", () => {
  assert.equal(normalizeStreamingState({ result: { status: { state: "connected" } } }), "LIVE");
});

test("Cloudflare status state mappings preserve connecting and offline", () => {
  assert.equal(normalizeStreamingState({ result: { status: { state: "connecting" } } }), "CONNECTING");
  assert.equal(normalizeStreamingState({ result: { status: { state: "disconnected" } } }), "OFFLINE");
});

test("Cloudflare live input status.current.state maps to LIVE", () => {
  assert.equal(normalizeStreamingState({ result: { status: { current: { state: "connected" } } } }), "LIVE");
});

test("complete manifests are returned unchanged and never receive a playback suffix", () => {
  const configuredUrl = "https://playback.example/manifest/video.m3u8?token=redacted";
  assert.deepEqual(resolveStreamingPlaybackUrl(configuredUrl, "AUTO"), { url: configuredUrl, pathType: "exact-manifest" });
  assert.doesNotMatch(resolveStreamingPlaybackUrl(configuredUrl, "AUTO").url, /video\.m3u8\/auto\.m3u8/);
});

test("generic playback bases retain quality-specific URL compatibility", () => {
  assert.deepEqual(resolveStreamingPlaybackUrl("https://playback.example/live/", "720P"), { url: "https://playback.example/live/720p.m3u8", pathType: "base-derived" });
});

test("enabled inputs are not treated as live without a connected state", () => {
  assert.equal(normalizeStreamingState({ result: { enabled: true, status: { state: "disconnected" } } }), "OFFLINE");
  assert.notEqual(normalizeStreamingState({ result: { enabled: true } }), "LIVE");
});

test("legacy and current state shapes remain supported", () => {
  assert.equal(normalizeStreamingState({ result: { status: "connected" } }), "LIVE");
  assert.equal(normalizeStreamingState({ result: { state: "LIVE" } }), "LIVE");
  assert.equal(normalizeStreamingState({ result: { current: { state: "connected" } } }), "LIVE");
  assert.equal(normalizeStreamingState({ result: { status: { current: { state: "connected" } } } }), "LIVE");
  assert.equal(normalizeStreamingState({ state: "LIVE" }), "LIVE");
  assert.equal(normalizeStreamingState({ result: { status: { state: "connecting" } }, state: "LIVE" }), "CONNECTING");
});

test("successful responses without a valid live state stay degraded", () => {
  assert.equal(normalizeStreamingState({ success: true, result: { enabled: true } }), "DEGRADED");
  assert.equal(normalizeStreamingState({}, false), "FAILED");
});

test("LIVE health resolves the configured playback source", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => response({ result: { status: { state: "connected" } } });
  try {
    const provider = new ConfiguredStreamingProvider("https://health.example", "https://playback.example/live.m3u8");
    const health = await provider.health();
    assert.equal(health.state, "LIVE");
    assert.equal(await provider.playbackUrl("AUTO"), "https://playback.example/live.m3u8");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("offline health does not expose a playback source", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => response({ result: { status: { state: "disconnected" } } });
  try {
    const provider = new ConfiguredStreamingProvider("https://health.example", "https://playback.example");
    const health = await provider.health();
    assert.equal(health.state, "OFFLINE");
    assert.notEqual(health.state, "LIVE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
