import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { inflateSync } from "node:zlib";

const root = process.cwd();
const controller = readFileSync(`${root}/components/background/BackgroundController.ts`, "utf8");
const provider = readFileSync(`${root}/components/background/BackgroundProvider.tsx`, "utf8");
const layout = readFileSync(`${root}/app/layout.tsx`, "utf8");
const css = readFileSync(`${root}/app/globals.css`, "utf8");
const api = readFileSync(`${root}/app/api/admin/media/backgrounds/route.ts`, "utf8");
const schema = readFileSync(`${root}/supabase/migrations/20260719090500_responsive_backgrounds.sql`, "utf8");
const matrix = readFileSync(`${root}/components/background/MatrixSlimCanvas.tsx`, "utf8");
const matrixSettings = readFileSync(`${root}/lib/background/matrix.ts`, "utf8");
const matrixAdmin = readFileSync(`${root}/components/admin/media/MatrixSlimAdminPanel.tsx`, "utf8");
const matrixAtlas = readFileSync(`${root}/components/background/MatrixGlyphAtlas.ts`, "utf8");
const backgroundSettings = readFileSync(`${root}/lib/media/backgrounds.ts`, "utf8");
const globalClient = readFileSync(`${root}/components/background/GlobalBackgroundClient.tsx`, "utf8");

test("one root provider owns the viewport listeners", () => {
  assert.match(layout, /<GlobalBackgroundClient\s+settings=\{background\}\s*\/>/);
  assert.match(globalClient, /^"use client";/);
  assert.match(globalClient, /usePathname/);
  assert.doesNotMatch(provider, /next\/navigation|usePathname/);
  assert.match(controller, /window\.addEventListener\("resize"/);
  assert.match(controller, /orientationchange/);
  assert.match(controller, /fullscreenchange/);
  assert.match(controller, /visualViewport\?\.addEventListener/);
  assert.match(controller, /removeEventListener/);
  assert.doesNotMatch(provider, /addEventListener\("resize"/);
});

test("resize updates are debounced and pixel density is clamped", () => {
  assert.match(controller, /window\.setTimeout/);
  assert.match(controller, /maximumPixelRatio/);
  assert.match(controller, /Math\.min\(window\.devicePixelRatio/);
  assert.match(api, /resizeDebounceMs, current\.resizeDebounceMs, 50, 250/);
  assert.match(api, /maximumPixelRatio, current\.maximumPixelRatio, 1, 3/);
});

test("background media preserves aspect ratio, focal point, and interaction", () => {
  assert.match(provider, /backgroundPosition/);
  assert.match(provider, /settings\.maintainAspectRatio \? "cover" : "100% 100%"/);
  assert.match(provider, /autoPlay muted loop playsInline/);
  assert.match(provider, /viewport\?\.reducedMotion/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /position: fixed/);
});

test("responsive settings are persisted for future WebGL consumers", () => {
  for (const column of ["maximum_pixel_ratio", "resize_debounce_ms", "particle_density_scaling", "dynamic_resolution", "mobile_performance_mode", "automatic_gpu_optimization"]) assert.match(schema, new RegExp(column));
  assert.match(controller, /xmf:background-viewport/);
});

test("Matrix Slim uses one canvas lifecycle with safe delegated interaction", () => {
  assert.equal((matrix.match(/<canvas/g) || []).length, 1);
  assert.match(matrix, /INTERACTIVE_SELECTOR/);
  assert.match(matrix, /!event\.target\.closest\(INTERACTIVE_SELECTOR\)/);
  assert.match(matrix, /xmf:background-viewport/);
  assert.match(matrix, /xmf:stream-playback/);
  assert.match(matrix, /cancelAnimationFrame/);
  assert.match(matrix, /visibilitychange/);
  assert.match(matrix, /trailAlpha/);
  assert.match(matrix, /data-frame-ms|dataset\.frameMs/);
  assert.match(matrixAtlas, /shadowBlur = glowStrength \* 12/);
  assert.doesNotMatch(matrix, /drop-shadow/);
  assert.match(matrix, /removeEventListener/);
  assert.doesNotMatch(matrix, /preventDefault|stopPropagation/);
});

test("Matrix visibility tuning keeps content opaque over 80 percent black glass", () => {
  assert.match(matrixSettings, /brightness: 0\.98/);
  assert.match(matrixSettings, /glowStrength: 0\.09/);
  assert.match(matrixSettings, /globalOpacity: 0\.8/);
  assert.match(css, /background-color: rgba\(0, 0, 0, 0\.8\)/);
  assert.match(css, /backdrop-filter: blur\(8px\)/);
  assert.doesNotMatch(css, /\.background-ui-layer\s*\{[^}]*opacity:/);
});

test("Matrix Slim settings expose the approved grayscale palette and ADMIN presets", () => {
  for (const color of ["#000000", "#1A1A1A", "#333333", "#666666", "#BFBFBF", "#DCDCDC", "#E6E6E6"]) assert.match(matrixSettings, new RegExp(color));
  for (const forbidden of ["#00ff00", "lime", "emerald", "cyan", "purple", "pink"]) assert.doesNotMatch(matrixSettings.toLowerCase(), new RegExp(forbidden));
  for (const preset of ["minimal", "calm", "dynamic", "high-density", "cinematic", "live-mode"]) assert.match(matrixSettings, new RegExp(`(?:\\"${preset}\\"|${preset}:)`));
  assert.match(matrixAdmin, /Mouse repel/);
  assert.match(matrixAdmin, /Click pulse/);
  assert.match(matrixAdmin, /Reduced motion/);
  assert.match(schema, /matrix_slim_settings/);
});

test("Matrix Slim is the global site default while remaining ADMIN configurable", () => {
  assert.match(matrixSettings, /DEFAULT_MATRIX_SLIM_SETTINGS[\s\S]*enabled: true/);
  assert.match(backgroundSettings, /DEFAULT_SITE_BACKGROUND[\s\S]*enabled: true/);
  assert.match(backgroundSettings, /backgroundType: "canvas"/);
  assert.match(backgroundSettings, /scope: "global"/);
  assert.match(matrixAdmin, /settings\.enabled/);
});

test("generated Matrix fallback is grayscale without a green cast", () => {
  const png = readFileSync(`${root}/public/backgrounds/matrix-slim-gray/matrix-slim-gray-thumbnail.png`);
  assert.equal(png.toString("ascii", 1, 4), "PNG");
  const width = png.readUInt32BE(16); const height = png.readUInt32BE(20); const colorType = png[25];
  assert.deepEqual([width, height], [640, 360]);
  assert.equal(colorType, 2);
  const chunks: Buffer[] = []; let offset = 8;
  while (offset < png.length) { const length = png.readUInt32BE(offset); const type = png.toString("ascii", offset + 4, offset + 8); if (type === "IDAT") chunks.push(png.subarray(offset + 8, offset + 8 + length)); offset += 12 + length; }
  const raw = inflateSync(Buffer.concat(chunks)); const stride = width * 3; const previous = Buffer.alloc(stride); const current = Buffer.alloc(stride); let input = 0; let maximumGreenCast = 0;
  const paeth = (a: number, b: number, c: number) => { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < height; y += 1) { const filter = raw[input++]; for (let x = 0; x < stride; x += 1) { const value = raw[input++]; const left = x >= 3 ? current[x - 3] : 0; const up = previous[x]; const upperLeft = x >= 3 ? previous[x - 3] : 0; current[x] = filter === 0 ? value : filter === 1 ? value + left : filter === 2 ? value + up : filter === 3 ? value + Math.floor((left + up) / 2) : value + paeth(left, up, upperLeft); } for (let x = 0; x < stride; x += 3) maximumGreenCast = Math.max(maximumGreenCast, current[x + 1] - Math.max(current[x], current[x + 2])); current.copy(previous); }
  assert.ok(maximumGreenCast <= 3, `green cast exceeded grayscale tolerance: ${maximumGreenCast}`);
});
