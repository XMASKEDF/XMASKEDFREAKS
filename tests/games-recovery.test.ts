import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { GAME_RECOVERY_DELAYS, gameErrorType, isRecoverableGameError } from "../lib/games/recovery.ts";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("recovery uses exactly three exponential retries", () => {
  assert.deepEqual([...GAME_RECOVERY_DELAYS], [500, 1000, 2000]);
  assert.equal(isRecoverableGameError(new Error("Loading chunk 42 failed")), true);
  assert.equal(isRecoverableGameError(new Error("Permission denied")), false);
  assert.equal(gameErrorType(new Error("dynamic import timeout")), "module-load");
  assert.equal(gameErrorType(new Error("hydration mismatch")), "hydration");
});

test("Games route owns a local error boundary and loading state", async () => {
  const [errorRoute, loading, page] = await Promise.all([source("app/games/error.tsx"), source("app/games/loading.tsx"), source("app/games/page.tsx")]);
  assert.match(errorRoute, /GamesRouteError/);
  assert.match(loading, /games-loading-panel/);
  assert.match(page, /GamesPageClient/);
});

test("catalog cards and game runtimes are isolated independently", async () => {
  const [catalog, runtime] = await Promise.all([source("components/games/GamesCatalogPage.tsx"), source("components/games/GamePlayClient.tsx")]);
  assert.match(catalog, /GamesBoundary componentName="GameCard" gameId=\{game\.id\}/);
  assert.match(runtime, /GamesBoundary componentName="GameRuntime" gameId=\{game\.id\}/);
  assert.match(runtime, /loadGameModule/);
});

test("Games data loaders tolerate malformed provider JSON", async () => {
  const catalog = await source("lib/games/catalog.ts");
  assert.equal((catalog.match(/response\.json\(\)\.catch\(\(\) => \[\]\)/g) || []).length, 4);
});

test("background failure is isolated from page content", async () => {
  const [globalClient, boundary] = await Promise.all([source("components/background/GlobalBackgroundClient.tsx"), source("components/background/BackgroundRendererBoundary.tsx")]);
  assert.match(globalClient, /<BackgroundRendererBoundary>/);
  assert.match(globalClient, /<RouteAwareBackground settings=\{settings\} \/>/);
  assert.match(boundary, /background-engine-failed/);
  assert.match(boundary, /Renderer disabled/);
});

test("diagnostics are sanitized, rate limited, and ADMIN-readable", async () => {
  const [api, migration, admin] = await Promise.all([source("app/api/games/errors/route.ts"), source("supabase/migrations/20260719092500_games_recovery_logs.sql"), source("app/admin/error-logs/page.tsx")]);
  assert.match(api, /limited\(ipHash\)/);
  assert.match(api, /message\.slice|text\(body\.errorMessage/);
  assert.match(api, /getAdminBySession/);
  assert.match(migration, /component_stack/);
  assert.match(migration, /diagnostics jsonb/);
  assert.match(admin, /game_issue_reports/);
});
