import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { updateManagedViewerPresence } from "../lib/live/managed-viewers.ts";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFileSync(new URL(path, root), "utf8");

test("managed viewer presence applies entry and exit rules exactly once", () => {
  const records = new Map();
  let snapshot = updateManagedViewerPresence({ records, visitorKey: "visitor-1", tabId: "tab-1", action: "join", now: 0, multiplier: 10 });
  assert.deepEqual(snapshot, { realLiveViewerCount: 1, publicViewerDisplayValue: 10, entryDelta: 10, leaveDelta: 0 });

  snapshot = updateManagedViewerPresence({ records, visitorKey: "visitor-1", tabId: "tab-1", action: "join", now: 1, multiplier: 10 });
  assert.deepEqual(snapshot, { realLiveViewerCount: 1, publicViewerDisplayValue: 10, entryDelta: 0, leaveDelta: 0 });

  snapshot = updateManagedViewerPresence({ records, visitorKey: "visitor-1", tabId: "tab-2", action: "join", now: 2, multiplier: 10 });
  assert.deepEqual(snapshot, { realLiveViewerCount: 1, publicViewerDisplayValue: 10, entryDelta: 0, leaveDelta: 0 });

  snapshot = updateManagedViewerPresence({ records, visitorKey: "visitor-1", tabId: "tab-1", action: "leave", now: 3, multiplier: 10 });
  assert.deepEqual(snapshot, { realLiveViewerCount: 1, publicViewerDisplayValue: 10, entryDelta: 0, leaveDelta: 0 });

  snapshot = updateManagedViewerPresence({ records, visitorKey: "visitor-1", tabId: "tab-2", action: "leave", now: 4, multiplier: 10 });
  assert.deepEqual(snapshot, { realLiveViewerCount: 0, publicViewerDisplayValue: 9, entryDelta: 0, leaveDelta: 1 });
});

test("managed viewer display adds ten per new visitor and one per final departure", () => {
  const records = new Map();

  for (let index = 0; index < 20; index += 1) {
    const snapshot = updateManagedViewerPresence({ records, visitorKey: `visitor-${index}`, tabId: `tab-${index}`, action: "join", now: index, multiplier: 10 });
    assert.equal(snapshot.entryDelta, 10);
  }

  let snapshot = updateManagedViewerPresence({ records, visitorKey: "visitor-0", tabId: "tab-0", action: "heartbeat", now: 21, multiplier: 10 });
  assert.deepEqual(snapshot, { realLiveViewerCount: 20, publicViewerDisplayValue: 200, entryDelta: 0, leaveDelta: 0 });

  snapshot = updateManagedViewerPresence({ records, visitorKey: "visitor-0", tabId: "tab-0", action: "leave", now: 22, multiplier: 10 });
  assert.deepEqual(snapshot, { realLiveViewerCount: 19, publicViewerDisplayValue: 199, entryDelta: 0, leaveDelta: 1 });

  snapshot = updateManagedViewerPresence({ records, visitorKey: "visitor-1", tabId: "tab-1", action: "leave", now: 23, multiplier: 10 });
  assert.deepEqual(snapshot, { realLiveViewerCount: 18, publicViewerDisplayValue: 198, entryDelta: 0, leaveDelta: 1 });

  snapshot = updateManagedViewerPresence({ records, visitorKey: "visitor-1", tabId: "tab-1", action: "leave", now: 24, multiplier: 10 });
  assert.deepEqual(snapshot, { realLiveViewerCount: 18, publicViewerDisplayValue: 198, entryDelta: 0, leaveDelta: 0 });
});

test("multiple tabs keep one visitor entry and one departure", () => {
  const records = new Map();
  let snapshot = updateManagedViewerPresence({ records, visitorKey: "visitor-1", tabId: "tab-1", action: "join", now: 0, multiplier: 10 });
  assert.deepEqual(snapshot, { realLiveViewerCount: 1, publicViewerDisplayValue: 10, entryDelta: 10, leaveDelta: 0 });

  snapshot = updateManagedViewerPresence({ records, visitorKey: "visitor-1", tabId: "tab-2", action: "join", now: 1, multiplier: 10 });
  assert.deepEqual(snapshot, { realLiveViewerCount: 1, publicViewerDisplayValue: 10, entryDelta: 0, leaveDelta: 0 });

  snapshot = updateManagedViewerPresence({ records, visitorKey: "visitor-1", tabId: "tab-1", action: "leave", now: 2, multiplier: 10 });
  assert.deepEqual(snapshot, { realLiveViewerCount: 1, publicViewerDisplayValue: 10, entryDelta: 0, leaveDelta: 0 });

  snapshot = updateManagedViewerPresence({ records, visitorKey: "visitor-1", tabId: "tab-2", action: "leave", now: 3, multiplier: 10 });
  assert.deepEqual(snapshot, { realLiveViewerCount: 0, publicViewerDisplayValue: 9, entryDelta: 0, leaveDelta: 1 });
});

test("Live is the default public destination and the Live surface stays video-first", () => {
  const home = source("app/page.tsx");
  const live = source("components/LiveRoom.tsx");
  const config = source("lib/config.ts");
  assert.match(home, /redirect\(\"\/live\"\)/);
  assert.match(config, /streamTitle:\s*"XMASKEDFREAKS TV TIPS ARE WELCOMED"/);
  assert.match(live, /className="view-rule-display"/);
  assert.match(live, /useLiveViewerPresence\(livePresenceActive\)/);
  assert.match(live, /className="player-fallback" aria-label="Live video placeholder"/);
  assert.doesNotMatch(live, /brand-banner|bannerConfig|🇺🇸|Live Complication|Live Compilation|OBS Loop Live/i);
});

test("Maya is closed by default and expands as an in-flow horizontal support bar", () => {
  const widget = source("components/SupportWidget.tsx");
  const css = source("app/globals.css");
  assert.match(widget, /useState\(false\)/);
  assert.match(widget, /open \? \(/);
  assert.match(widget, /className="support-toggle primary"/);
  assert.match(widget, /className="secondary support-close"/);
  assert.match(css, /\.live-main:not\(\.is-sandbox\) \.support-widget\s*\{[\s\S]*position:\s*static/);
  assert.match(css, /\.live-main:not\(\.is-sandbox\) \.support-panel\s*\{[\s\S]*grid-template-columns/);
});

test("Fansly keeps one Crazy 8 destination and renders six obscured previews", () => {
  const fansly = source("components/external/FanslyPage.tsx");
  const css = source("app/globals.css");
  assert.match(fansly, /Array\.from\(\{ length: 6 \}/);
  assert.match(fansly, /fansly-locked-preview/);
  assert.match(fansly, /href=\{destination\}/);
  assert.match(css, /\.fansly-preview-grid\s*\{[\s\S]*repeat\(3/);
  assert.match(css, /\.fansly-locked-preview::before\s*\{[\s\S]*filter:\s*blur\(24px\)/);
});

test("shared public navigation has one stable non-uppercase font treatment", () => {
  const storeEnglish = JSON.parse(source("public/locales/store/en.json")) as Record<string, string>;
  const css = source("app/globals.css");
  assert.equal(storeEnglish["nav.live"], "Live");
  assert.equal(storeEnglish["nav.audioClips"], "Audio Clips");
  assert.equal(storeEnglish["nav.clips"], "Clips4Sale");
  assert.match(css, /\.site-header nav a,[\s\S]*text-transform:\s*none/);
});
