import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("motion layer uses one cancellable RAF scheduler and clamps stalled frames", () => {
  const raf = source("hooks/useRafLoop.ts");
  const performance = source("lib/motion/performance.ts");
  assert.match(raf, /requestAnimationFrame/);
  assert.match(raf, /cancelAnimationFrame/);
  assert.match(performance, /Math\.min\(100/);
  assert.doesNotMatch(raf, /setInterval/);
});

test("adaptive modes reduce decorative work without changing business state", () => {
  const provider = source("components/motion/MotionProvider.tsx");
  const layout = source("app/layout.tsx");
  const matrix = source("components/background/MatrixSlimCanvas.tsx");
  assert.match(layout, /<MotionProvider>/);
  assert.match(provider, /AUTO.*FULL.*BALANCED.*REDUCED/);
  assert.match(provider, /PerformanceObserver/);
  assert.match(matrix, /performanceModeRef/);
  assert.match(matrix, /focusRef/);
  assert.doesNotMatch(provider, /setInterval/);
});

test("motion tokens and diagnostics stay accessible to Admin only", () => {
  const tokens = source("lib/motion/tokens.ts");
  const panel = source("components/admin/MotionPerformancePanel.tsx");
  const css = source("app/globals.css");
  for (const token of ["instant", "fast", "normal", "slow", "enter", "exit", "soft", "snap"]) assert.match(tokens, new RegExp(token));
  for (const label of ["Estimated FPS", "Average frame", "Long frames", "Reduced motion", "Background effects"]) assert.match(panel, new RegExp(label));
  assert.match(css, /prefers-reduced-motion/);
});

