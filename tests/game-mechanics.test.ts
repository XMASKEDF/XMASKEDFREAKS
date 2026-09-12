import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceFixedClock,
  circlesOverlap,
  createScoreLedger,
  massToLength,
  massToRadius,
  rectanglesOverlap,
  sweptVerticalProjectileHit
} from "../lib/games/mechanics.ts";
import {
  createPacMaskState,
  choosePacGhostDirection,
  pacCellAt,
  pacCellCenter,
  pacGhostTarget,
  pacValidDirections,
  requestPacDirection,
  resolvePacGhostCollisions,
  updatePacGhost,
  updatePacMask
} from "../lib/games/pacmask-engine.ts";
import {
  awardSpaceLife,
  createSpaceState,
  removeSpaceLives,
  spawnPlayerShot,
  waveRewardTargetForFormation,
  updateSpace
} from "../lib/games/space-engine.ts";
import { scoreFromSnake } from "../lib/slither/scoring.ts";
import { DEFAULT_GAME_TUNING, normalizeGameTuning } from "../lib/games/settings.ts";
import { gameMixLevel } from "../lib/games/audio.ts";
import { dynamicCameraZoom } from "../lib/slither/camera.ts";
import { defaultGames } from "../lib/config.ts";
import { leaderboardPosition } from "../lib/games/leaderboard.ts";

test("fixed-step clock produces the same simulation count for equivalent elapsed time", () => {
  const at60 = { previousSeconds: 0, accumulator: 0 };
  const at120 = { previousSeconds: 0, accumulator: 0 };
  let steps60 = 0;
  let steps120 = 0;
  for (let frame = 1; frame <= 60; frame += 1) advanceFixedClock(at60, frame / 60, () => { steps60 += 1; });
  for (let frame = 1; frame <= 120; frame += 1) advanceFixedClock(at120, frame / 120, () => { steps120 += 1; });
  assert.equal(steps60, steps120);
  assert.equal(steps60, 60);
});

test("collision primitives include overlap and swept projectile paths", () => {
  assert.equal(circlesOverlap(0, 0, 5, 8, 0, 4), true);
  assert.equal(rectanglesOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 9, y: 9, width: 3, height: 3 }), true);
  assert.equal(sweptVerticalProjectileHit(5, 20, -5, 2, { x: 0, y: 0, width: 10, height: 10 }), true);
});

test("score ledger awards an event exactly once", () => {
  const ledger = createScoreLedger();
  assert.equal(ledger.add(10, "pellet:1:1"), 10);
  assert.equal(ledger.add(10, "pellet:1:1"), 0);
  assert.equal(ledger.add(200, "ghost:ember"), 200);
  assert.equal(ledger.value(), 210);
});

test("Pac-Mask consumes each pellet once and movement is frame-rate independent", () => {
  const state60 = createPacMaskState();
  const state120 = createPacMaskState();
  for (const state of [state60, state120]) {
    state.phase = "playing";
    state.phaseTimer = 0;
    state.ghosts = [];
    state.player.direction = "right";
    requestPacDirection(state, "right");
  }
  updatePacMask(state60, 1 / 60);
  const scoreAfterPellet = state60.score;
  updatePacMask(state60, 1 / 60);
  assert.equal(scoreAfterPellet, 10);
  assert.equal(state60.score, 10);

  for (let index = 2; index < 60; index += 1) updatePacMask(state60, 1 / 60);
  for (let index = 0; index < 120; index += 1) updatePacMask(state120, 1 / 120);
  assert.ok(Math.abs(state60.player.x - state120.player.x) < 2);
  assert.ok(Math.abs(state60.player.y - state120.player.y) < 2);
});

test("Pac-Mask collisions remove one life or award one frightened capture", () => {
  const danger = createPacMaskState();
  danger.phase = "playing";
  danger.phaseTimer = 0;
  danger.player.direction = "none";
  danger.player.requested = "none";
  danger.ghosts = [danger.ghosts[0]];
  Object.assign(danger.ghosts[0], danger.player, { mode: "CHASE", capturedThisPower: false });
  updatePacMask(danger, 1 / 60);
  updatePacMask(danger, 1 / 60);
  assert.equal(danger.lives, 2);
  assert.equal(danger.phase, "dying");

  const powered = createPacMaskState();
  powered.phase = "playing";
  powered.phaseTimer = 0;
  powered.player.direction = "none";
  powered.player.requested = "none";
  powered.frightenedRemaining = 5;
  powered.pellets.delete("1:1");
  powered.ghosts = [powered.ghosts[0]];
  Object.assign(powered.ghosts[0], powered.player, { mode: "FRIGHTENED", capturedThisPower: false });
  updatePacMask(powered, 1 / 60);
  const capturedScore = powered.score;
  updatePacMask(powered, 1 / 60);
  assert.equal(capturedScore, 200);
  assert.equal(powered.score, 200);
  assert.equal(powered.ghostsEaten, 1);
});

test("MASK INVADERS supports held movement, one active player shot, and one score per enemy", () => {
  const state = createSpaceState();
  state.phase = "playing";
  state.phaseTimer = 0;
  state.enemyFireCooldown = 99;
  const startX = state.playerX;
  for (let index = 0; index < 30; index += 1) updateSpace(state, { left: false, right: true, fire: false }, 1 / 60, () => 1);
  assert.ok(state.playerX > startX);
  assert.equal(spawnPlayerShot(state), true);
  assert.equal(spawnPlayerShot(state), false);

  const enemy = state.enemies[0];
  state.enemies.forEach((item) => { item.alive = item.id === enemy.id; });
  state.shots = [{ id: "test-shot", x: enemy.x, y: enemy.y + 18, previousY: enemy.y + 18, velocityY: -720, enemy: false, active: true }];
  updateSpace(state, { left: false, right: false, fire: false }, 1 / 30, () => 1);
  assert.equal(enemy.alive, false);
  assert.equal(state.score, enemy.pointValue);
  assert.equal(state.enemiesDestroyed, 1);
});

test("MASK INVADERS shield cells absorb and deactivate projectiles", () => {
  const state = createSpaceState();
  state.phase = "playing";
  state.phaseTimer = 0;
  state.enemyFireCooldown = 99;
  const cell = state.shieldCells.find((item) => item.alive)!;
  state.shots = [{ id: "shield-shot", x: cell.x + cell.size / 2, y: cell.y - 12, previousY: cell.y - 12, velocityY: 300, enemy: true, active: true }];
  updateSpace(state, { left: false, right: false, fire: false }, 0.1, () => 1);
  assert.equal(cell.alive, false);
  assert.equal(state.shots.some((shot) => shot.id === "shield-shot"), false);
});

test("MASK INVADERS projectile ownership protects player shields from friendly fire", () => {
  const playerShotState = createSpaceState();
  playerShotState.phase = "playing";
  playerShotState.enemyFireCooldown = 99;
  const playerCell = playerShotState.shieldCells.find((item) => item.alive)!;
  playerShotState.shots = [{ id: "player-shield-shot", x: playerCell.x + playerCell.size / 2, y: playerCell.y + 12, previousY: playerCell.y + 12, velocityY: -600, enemy: false, active: true }];
  updateSpace(playerShotState, { left: false, right: false, fire: false }, 0.04, () => 1);
  assert.equal(playerCell.alive, true);

  const enemyShotState = createSpaceState();
  enemyShotState.phase = "playing";
  enemyShotState.enemyFireCooldown = 99;
  const enemyCell = enemyShotState.shieldCells.find((item) => item.alive)!;
  enemyShotState.shots = [{ id: "enemy-shield-shot", x: enemyCell.x + enemyCell.size / 2, y: enemyCell.y - 12, previousY: enemyCell.y - 12, velocityY: 600, enemy: true, active: true }];
  updateSpace(enemyShotState, { left: false, right: false, fire: false }, 0.04, () => 1);
  assert.equal(enemyCell.alive, false);
});

test("MASK INVADERS Hearts use normalized life units and preserve overflow", () => {
  for (const [startingLives, expectedUnits] of [[1, 4], [2, 6], [3, 7]] as const) {
    const lifeTest = createSpaceState(1, 0, startingLives);
    assert.equal(awardSpaceLife(lifeTest), startingLives === 3 ? "half" : "full");
    assert.equal(lifeTest.lifeUnits, expectedUnits);
  }
  const state = createSpaceState();
  assert.equal(state.lifeUnits, 6);
  assert.equal(awardSpaceLife(state), "half");
  assert.equal(state.lifeUnits, 7);
  assert.equal(awardSpaceLife(state), "half");
  assert.equal(state.lifeUnits, 8);
  assert.equal(state.lives, 4);
  removeSpaceLives(state, 1);
  assert.equal(state.lifeUnits, 6);

  const pickup = createSpaceState();
  pickup.phase = "playing";
  pickup.enemyFireCooldown = 99;
  pickup.powerUps = [{ id: "heart-test", kind: "heart", x: pickup.playerX, y: pickup.playerY - 38, active: true }];
  updateSpace(pickup, { left: false, right: false, fire: false }, 1 / 60, () => 1);
  assert.equal(pickup.heartPickups, 1);
  assert.equal(pickup.lifeUnits, 7);
});

test("MASK INVADERS selects wave targets from formation difficulty and rewards only strict under-target clears", () => {
  const early = createSpaceState(1);
  const armored = createSpaceState(4);
  const boss = createSpaceState(5);
  assert.equal(waveRewardTargetForFormation(early.enemies), 30);
  assert.equal(waveRewardTargetForFormation(armored.enemies), 90);
  assert.equal(waveRewardTargetForFormation(boss.enemies), 135);

  for (const [wave, clearTime, qualified] of [[1, 29.9, true], [1, 30, false], [4, 89.9, true], [4, 90, false], [5, 134.9, true], [5, 135, false]] as const) {
    const state = createSpaceState(wave);
    state.phase = "playing";
    state.enemyFireCooldown = 99;
    state.waveElapsed = clearTime;
    state.enemies.forEach((enemy) => { enemy.alive = false; });
    updateSpace(state, { left: false, right: false, fire: false }, 0, () => 1);
    assert.equal(state.phase, "levelComplete");
    assert.equal(state.speedLifeBonuses, qualified ? 1 : 0);
    assert.equal(state.waveSummary?.classification, qualified ? (clearTime < state.waveRewardTarget * 0.5 ? "FAST CLEAR" : "QUALIFIED CLEAR") : "MISSED LIFE TARGET");
  }
});

test("MASK INVADERS pauses wave timing without consuming the reward window", () => {
  const state = createSpaceState();
  state.phase = "paused";
  state.waveElapsed = 12;
  updateSpace(state, { left: false, right: false, fire: false }, 30, () => 1);
  assert.equal(state.waveElapsed, 12);
});

test("MASK INVADERS drops, collects, refreshes, and fires Multi Shot power-ups", () => {
  const state = createSpaceState();
  state.phase = "playing";
  state.phaseTimer = 0;
  state.enemyFireCooldown = 99;
  const enemy = state.enemies[0];
  state.enemies.forEach((item) => { item.alive = item.id === enemy.id; });
  state.shots = [{ id: "power-shot", x: enemy.x, y: enemy.y + 18, previousY: enemy.y + 18, velocityY: -720, enemy: false, active: true }];
  updateSpace(state, { left: false, right: false, fire: false }, 1 / 30, () => 0, { ...DEFAULT_GAME_TUNING, powerUpDropChance: 1 });
  assert.equal(state.powerUps[0]?.kind, "multiShot");
  Object.assign(state.powerUps[0], { x: state.playerX, y: state.playerY });
  state.phase = "playing";
  updateSpace(state, { left: false, right: false, fire: false }, 1 / 60, () => 1, DEFAULT_GAME_TUNING);
  assert.ok(state.activePowerUps.multiShot > 9);
  state.phase = "playing";
  state.fireCooldown = 0;
  assert.equal(spawnPlayerShot(state), true);
  assert.equal(state.shots.filter((shot) => !shot.enemy).length, 3);

  const volley = createSpaceState();
  volley.phase = "playing";
  volley.enemyFireCooldown = 99;
  volley.shieldCells = [];
  volley.activePowerUps.multiShot = 10;
  volley.enemies.forEach((item, index) => {
    item.alive = index < 3;
    if (index < 3) Object.assign(item, { x: volley.playerX + (index - 1) * 16, y: volley.playerY - 72 });
  });
  spawnPlayerShot(volley);
  updateSpace(volley, { left: false, right: false, fire: false }, 0.06, () => 1);
  assert.equal(volley.enemiesDestroyed, 3);

  volley.activePowerUps.multiShot = 4;
  volley.powerUps = [{ id: "refresh", kind: "multiShot", x: volley.playerX, y: volley.playerY, active: true }];
  volley.phase = "playing";
  updateSpace(volley, { left: false, right: false, fire: false }, 1 / 60, () => 1, DEFAULT_GAME_TUNING);
  assert.ok(volley.activePowerUps.multiShot <= DEFAULT_GAME_TUNING.multiShotSeconds);
  assert.ok(volley.activePowerUps.multiShot > 9);
  updateSpace(volley, { left: false, right: false, fire: false }, 11, () => 1, DEFAULT_GAME_TUNING);
  assert.equal(volley.activePowerUps.multiShot, 0);
});

test("MASK INVADERS Rapid Fire repeats while held and Energy Shield blocks a hit", () => {
  const rapid = createSpaceState();
  rapid.phase = "playing";
  rapid.enemyFireCooldown = 99;
  rapid.activePowerUps.rapidFire = 1;
  updateSpace(rapid, { left: false, right: false, fire: true }, 0.07, () => 1);
  updateSpace(rapid, { left: false, right: false, fire: true }, 0.07, () => 1);
  assert.ok(rapid.shotsFired >= 2);

  const shielded = createSpaceState();
  shielded.phase = "playing";
  shielded.enemyFireCooldown = 99;
  shielded.activePowerUps.energyShield = 1;
  shielded.shots = [{ id: "shield-test", x: shielded.playerX, y: shielded.playerY - 35, previousY: shielded.playerY - 35, velocityY: 350, enemy: true, active: true }];
  updateSpace(shielded, { left: false, right: false, fire: false }, 0.15, () => 1);
  assert.equal(shielded.lives, 3);
  assert.equal(shielded.shots.some((shot) => shot.id === "shield-test"), false);
});

test("Pac-Mask fruit spawns, expires safely, and awards its configured value", () => {
  const state = createPacMaskState();
  state.phase = "playing";
  state.phaseTimer = 0;
  state.ghosts = [];
  state.fruitCooldown = 0;
  updatePacMask(state, 1, { ...DEFAULT_GAME_TUNING, fruitSpawnChancePerSecond: 1 }, () => 0);
  assert.equal(state.fruit?.kind, "cherry");
  assert.ok(state.fruit);
  Object.assign(state.player, { x: state.fruit!.x, y: state.fruit!.y, direction: "none", requested: "none" });
  updatePacMask(state, 1 / 60, DEFAULT_GAME_TUNING, () => 1);
  assert.equal(state.fruit, null);
  assert.ok(state.score >= 100);

  const expiring = createPacMaskState();
  expiring.phase = "playing";
  expiring.ghosts = [];
  expiring.fruitCooldown = 0;
  updatePacMask(expiring, 1, { ...DEFAULT_GAME_TUNING, fruitSpawnChancePerSecond: 1, fruitVisibleSeconds: 2 }, () => 0);
  assert.ok(expiring.fruit);
  updatePacMask(expiring, 2.1, DEFAULT_GAME_TUNING, () => 1);
  assert.equal(expiring.fruit, null);
});

test("Pac-Mask power pellets reverse enemies and preserve the 200/400/800/1600 combo", () => {
  const powered = createPacMaskState();
  powered.phase = "playing";
  powered.phaseTimer = 0;
  Object.assign(powered.player, pacCellCenter(1, 3), { direction: "none", requested: "none" });
  const ghost = powered.ghosts[0];
  ghost.direction = "right";
  ghost.mode = "CHASE";
  ghost.x += 5;
  updatePacMask(powered, 1 / 120, DEFAULT_GAME_TUNING, () => 1);
  assert.equal(ghost.mode, "FRIGHTENED");
  assert.equal(ghost.direction, "left");

  const combo = createPacMaskState();
  combo.phase = "playing";
  combo.phaseTimer = 0;
  combo.pellets.delete("1:1");
  combo.player.direction = "none";
  combo.player.requested = "none";
  combo.frightenedRemaining = 5;
  combo.ghosts.forEach((item) => Object.assign(item, combo.player, { mode: "FRIGHTENED", capturedThisPower: false }));
  updatePacMask(combo, 1 / 120, DEFAULT_GAME_TUNING, () => 1);
  assert.equal(combo.score, 3000);
  assert.equal(combo.ghostChain, 4);

  const returning = combo.ghosts[0];
  Object.assign(returning, pacCellCenter(9, 8), { mode: "EATEN", direction: "none", lastDecisionCell: "" });
  updatePacMask(combo, 1 / 120, DEFAULT_GAME_TUNING, () => 1);
  assert.equal(returning.mode, "RESPAWNING");
  assert.ok(returning.respawnTimer > 0);
});

test("Pac-Mask ghosts use legal maze exits and path distance toward their targets", () => {
  const state = createPacMaskState();
  state.phase = "playing";
  const ghost = state.ghosts[0];
  Object.assign(ghost, pacCellCenter(5, 4), {
    mode: "CHASE",
    direction: "none",
    lastDecisionCell: "",
    pendingReverse: false
  });
  Object.assign(state.player, pacCellCenter(1, 4), { direction: "left", requested: "left" });
  const legal = pacValidDirections(ghost);
  const chosen = choosePacGhostDirection(ghost, state);
  assert.ok(legal.includes(chosen));
  assert.equal(chosen, "left");
  assert.ok(ghost.path.length > 1);
});

test("Pac-Mask personalities produce distinct pursuit targets", () => {
  const state = createPacMaskState();
  state.phase = "playing";
  Object.assign(state.player, pacCellCenter(5, 4), { direction: "right", requested: "right" });
  state.ghosts.forEach((ghost) => { ghost.mode = "CHASE"; });
  Object.assign(state.ghosts[3], pacCellCenter(7, 4));
  const targets = state.ghosts.map((ghost) => pacGhostTarget(ghost, state));
  assert.deepEqual(targets[0], { column: 5, row: 4 });
  assert.deepEqual(targets[1], { column: 9, row: 4 });
  assert.notDeepEqual(targets[2], targets[0]);
  assert.notDeepEqual(targets[3], targets[0]);
});

test("Pac-Mask follows PEN, EXITING, chase, frightened, eaten, and respawn states", () => {
  const state = createPacMaskState();
  state.phase = "playing";
  const ghost = state.ghosts[1];
  ghost.releaseTimer = 0;
  updatePacGhost(state, ghost, 1 / 60);
  assert.equal(ghost.mode, "EXITING");

  Object.assign(ghost, pacCellCenter(9, 6), { mode: "EXITING", direction: "up", lastDecisionCell: "" });
  updatePacGhost(state, ghost, 1 / 60);
  assert.equal(ghost.mode, "SCATTER");

  Object.assign(ghost, state.player, { mode: "FRIGHTENED", capturedThisPower: false });
  state.frightenedRemaining = 4;
  resolvePacGhostCollisions(state);
  assert.equal(ghost.mode, "EATEN");

  Object.assign(ghost, pacCellCenter(9, 8), { direction: "none", lastDecisionCell: "" });
  updatePacGhost(state, ghost, 1 / 60);
  assert.equal(ghost.mode, "RESPAWNING");
  updatePacGhost(state, ghost, 1);
  assert.equal(ghost.mode, "EXITING");
});

test("Pac-Mask power timer resets and chase/scatter scheduling reverses active ghosts", () => {
  const state = createPacMaskState();
  state.phase = "playing";
  state.phaseTimer = 0;
  Object.assign(state.player, pacCellCenter(1, 3), { direction: "none", requested: "none" });
  const ghost = state.ghosts[0];
  Object.assign(ghost, pacCellCenter(5, 4), { mode: "SCATTER", direction: "right", lastDecisionCell: "" });
  updatePacMask(state, 1 / 60, DEFAULT_GAME_TUNING, () => 1);
  const firstDuration = state.frightenedRemaining;
  assert.ok(firstDuration > 5);

  state.powerPellets.add("1:3");
  state.frightenedRemaining = 0.25;
  updatePacMask(state, 1 / 60, DEFAULT_GAME_TUNING, () => 1);
  assert.ok(state.frightenedRemaining > firstDuration - 0.1);

  state.frightenedRemaining = 0;
  ghost.mode = "SCATTER";
  ghost.pendingReverse = false;
  state.globalMode = "SCATTER";
  state.globalModeRemaining = 0.001;
  state.scheduleInitialized = true;
  updatePacMask(state, 1 / 60, DEFAULT_GAME_TUNING, () => 1);
  assert.equal(state.globalMode, "CHASE");
  assert.equal(ghost.mode, "CHASE");
  assert.ok(ghost.pendingReverse || ghost.direction === "left");
});

test("Pac-Mask collision lock removes only one life for simultaneous contacts", () => {
  const state = createPacMaskState();
  state.phase = "playing";
  state.phaseTimer = 0;
  state.pellets.delete("1:1");
  state.player.direction = "none";
  state.player.requested = "none";
  state.ghosts.slice(0, 2).forEach((ghost) => Object.assign(ghost, state.player, {
    mode: "CHASE",
    direction: "none",
    capturedThisPower: false
  }));
  resolvePacGhostCollisions(state);
  resolvePacGhostCollisions(state);
  assert.equal(state.lives, 2);
  assert.equal(state.phase, "dying");
  assert.ok(state.collisionLockRemaining > 0);
});

test("Pac-Mask releases every enemy and keeps each one moving through the maze", () => {
  const state = createPacMaskState();
  state.phase = "playing";
  state.phaseTimer = 0;
  state.collisionLockRemaining = 999;
  const visited = new Map(state.ghosts.map((ghost) => [ghost.id, new Set<string>()]));
  for (let frame = 0; frame < 60 * 18; frame += 1) {
    updatePacMask(state, 1 / 60, DEFAULT_GAME_TUNING, () => 1);
    state.ghosts.forEach((ghost) => {
      const cell = pacCellAt(ghost.x, ghost.y);
      visited.get(ghost.id)?.add(`${cell.column}:${cell.row}`);
    });
  }
  state.ghosts.forEach((ghost) => {
    assert.notEqual(ghost.mode, "PEN");
    assert.ok((visited.get(ghost.id)?.size ?? 0) >= 10, `${ghost.id} should traverse the maze`);
  });
});

test("Slither mass drives monotonic length and radius progression", () => {
  assert.ok(massToLength(80) > massToLength(20));
  assert.ok(massToRadius(80) > massToRadius(20));
  assert.equal(massToLength(20), massToLength(20));
});

test("Slither starts at zero and only scores collected food", () => {
  const player = { mass: 28, scoreValue: 0, bonusScore: 0 } as Parameters<typeof scoreFromSnake>[0];
  assert.equal(scoreFromSnake(player), 0);
  player.scoreValue = 24;
  assert.equal(scoreFromSnake(player), 24);
});

test("MASKED UP camera exposes a larger arena without changing game speed", () => {
  const original = dynamicCameraZoom(28, 1);
  const zoomedOut = dynamicCameraZoom(28, 2.25);
  assert.ok(zoomedOut < original);
  assert.ok((original / zoomedOut) ** 2 >= 2);
  assert.equal(leaderboardPosition(600, [1200, 900, 600, 200]), 3);
  assert.equal(leaderboardPosition(1300, [1200, 900, 600, 200]), 1);
});

test("game audio stays beneath live audio and public game names use the new labels", () => {
  assert.equal(gameMixLevel(0.5, 1, false), 0.25);
  assert.equal(gameMixLevel(0.2, 0.5, false), 0.1);
  assert.equal(gameMixLevel(0.2, 0, true), 0.2);
  assert.equal(defaultGames.find((game) => game.id === "space-sweep")?.title, "MASK INVADERS");
  assert.equal(defaultGames.find((game) => game.id === "slither")?.title, "MASKED UP");
});

test("master game availability defaults on and preserves an explicit off state", () => {
  assert.equal(normalizeGameTuning({}).gamesEnabled, true);
  assert.equal(normalizeGameTuning({ gamesEnabled: false }).gamesEnabled, false);
  assert.equal(normalizeGameTuning({ gamesEnabled: true }).gamesEnabled, true);
});
