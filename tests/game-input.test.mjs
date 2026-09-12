import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("shared arcade input accepts arrows and WASD without leaking page controls", () => {
  const input = source("lib/games/input.ts");
  const hook = source("hooks/useArcadeInput.ts");
  for (const key of ["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"]) assert.match(input, new RegExp(`\\"${key}\\"`));
  assert.match(input, /opposing keys cancel cleanly/);
  assert.match(hook, /document\.addEventListener\("visibilitychange"/);
  assert.match(hook, /clearArcadeInput\(inputRef\.current\)/);
  assert.match(hook, /if \(!GAME_KEYS\.has\(key\)\) return/);
  assert.match(hook, /event\.preventDefault\(\)/);
});

test("each game consumes the shared movement intent without changing its movement model", () => {
  const space = source("components/games/space/SpaceInvaderGame.tsx");
  const pac = source("components/games/pacmask/PacMaskGame.tsx");
  const slither = source("hooks/useSlitherGame.ts");
  assert.match(space, /getArcadeMovementIntent/);
  assert.match(space, /left: intent\.horizontal === -1/);
  assert.match(space, /right: intent\.horizontal === 1/);
  assert.match(pac, /getArcadeMovementIntent/);
  assert.match(pac, /intent\.vertical === -1/);
  assert.match(pac, /intent\.horizontal === -1/);
  assert.doesNotMatch(pac, /onKeyDown=/);
  assert.match(slither, /getArcadeMovementIntent/);
  assert.match(slither, /keyboardTurn: intent\.horizontal/);
  assert.match(slither, /intent\.vertical === -1/);
});
