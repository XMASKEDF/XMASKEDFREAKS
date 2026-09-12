import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("the authoritative App Router layout imports global CSS exactly once", () => {
  const layout = source("app/layout.tsx");
  assert.equal((layout.match(/import "\.\/globals\.css";/g) || []).length, 1);
  assert.equal(existsSync(new URL("../src/app/layout.tsx", import.meta.url)), false);
  assert.equal(existsSync(new URL("../pages/_app.tsx", import.meta.url)), false);
});

test("development and production use isolated Next build directories", () => {
  const config = source("next.config.mjs");
  const pkg = JSON.parse(source("package.json"));
  assert.match(config, /\.next-development/);
  assert.match(config, /\.next-production/);
  assert.match(pkg.scripts.dev, /scripts\/dev-server\.mjs/);
  assert.match(source("scripts/dev-server.mjs"), /NEXT_DIST_DIR: "\.next-development"/);
  assert.match(pkg.scripts.prebuild, /assert-no-dev-server\.mjs/);
  assert.match(pkg.scripts.build, /NEXT_DIST_DIR=\.next-production/);
  assert.match(pkg.scripts.start, /NEXT_DIST_DIR=\.next-production/);
});

test("global CSS contains durable black fallback and base resets", () => {
  const css = source("app/globals.css");
  assert.match(css, /\*::before/);
  assert.match(css, /html\s*\{[\s\S]*background:\s*#000/);
  assert.match(css, /body\s*\{[\s\S]*background:\s*#000/);
  assert.match(css, /button,[\s\S]*textarea\s*\{[\s\S]*font:\s*inherit/);
  assert.match(css, /img,[\s\S]*canvas\s*\{[\s\S]*max-width:\s*100%/);
});

test("the server-rendered application shell is independent from Matrix rendering", () => {
  const layout = source("app/layout.tsx");
  const background = source("components/background/GlobalBackgroundClient.tsx");
  assert.match(layout, /<GlobalBackgroundClient settings=\{background\} \/>/);
  assert.match(layout, /data-xmf-app-shell="styled"/);
  assert.match(background, /<BackgroundRendererBoundary>/);
  assert.doesNotMatch(background, /children/);
});

test("development style diagnostics and guaranteed fatal fallback remain installed", () => {
  assert.match(source("components/StyleHealthCheck.tsx"), /missingCssChunks/);
  assert.match(source("app/global-error.tsx"), /getGlobalErrorCopy/);
  assert.match(source("lib/global-error-copy.ts"), /temporarily failed to load correctly/);
  assert.match(source("lib/global-error-copy.ts"), /Clear Local Cache/);
});
