import assert from "node:assert/strict";
import test from "node:test";
import { LivePlaybackDiagnostics } from "../lib/live/playback-diagnostics.ts";

test("Live playback diagnostics distinguish stable sources from real source resets", () => {
  const diagnostics = new LivePlaybackDiagnostics();

  diagnostics.assignSource("https://example.test/master.m3u8?token=one", "hls-js");
  diagnostics.assignSource("https://example.test/master.m3u8?token=one", "hls-js");
  diagnostics.assignSource("https://example.test/other.m3u8", "native-hls");

  const snapshot = diagnostics.getSnapshot();
  assert.equal(snapshot.lifecycle.sourceAssignments, 3);
  assert.equal(snapshot.lifecycle.sourceResets, 1);
  assert.equal(snapshot.lifecycle.lastPlaybackMode, "native-hls");
  assert.match(snapshot.lifecycle.lastSourceHash || "", /^src-/);
});

test("HLS lifecycle counters remain non-negative and track the peak instance count", () => {
  const diagnostics = new LivePlaybackDiagnostics();

  diagnostics.destroyHls();
  diagnostics.createHls();
  diagnostics.createHls();
  diagnostics.destroyHls();
  diagnostics.destroyHls();
  diagnostics.destroyHls();

  const snapshot = diagnostics.getSnapshot();
  assert.equal(snapshot.lifecycle.hlsCreated, 2);
  assert.equal(snapshot.lifecycle.hlsDestroyed, 4);
  assert.equal(snapshot.lifecycle.peakHlsInstances, 2);
  assert.equal(snapshot.lifecycle.activeHlsInstances, 0);
});

test("playback events distinguish rebuffer stalls from seeking and capture startup", () => {
  const diagnostics = new LivePlaybackDiagnostics();

  diagnostics.startPlayer();
  diagnostics.videoEvent("playing");
  diagnostics.videoEvent("waiting");
  diagnostics.videoEvent("stalled");
  diagnostics.videoEvent("seeking");
  diagnostics.hlsError("bufferStalledError", false);
  diagnostics.hlsError("networkError", true);

  const snapshot = diagnostics.getSnapshot();
  assert.equal(snapshot.playback.rebufferCount, 2);
  assert.equal(snapshot.playback.stallCount, 3);
  assert.equal(snapshot.playback.fatalErrorCount, 1);
  assert.ok(snapshot.playback.startupMs !== null);
  assert.equal(snapshot.playback.lastError, "networkError:fatal");
});

test("diagnostics bound API request history and redact query strings", () => {
  const diagnostics = new LivePlaybackDiagnostics();

  for (let index = 0; index < 45; index += 1) {
    diagnostics.apiRequest(`/api/live/playback?token=${index}`, index, index % 2 === 0);
  }

  const snapshot = diagnostics.getSnapshot();
  assert.equal(snapshot.network.totalRequests, 45);
  assert.equal(snapshot.network.failedRequests, 22);
  assert.equal(snapshot.network.recentRequests.length, 40);
  assert.equal(snapshot.network.recentRequests[0]?.path, "/api/live/playback");
  assert.equal(snapshot.network.recentRequests[0]?.at !== undefined, true);
  assert.equal(snapshot.network.averageLatencyMs, 22);
});
