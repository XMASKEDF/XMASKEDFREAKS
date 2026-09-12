import { PLAYER_MOVEMENT_MULTIPLIER, rectanglesOverlap, sweptVerticalProjectileHit } from "./mechanics.ts";
import { DEFAULT_GAME_TUNING, type GameTuningSettings } from "./settings.ts";

export const SPACE_WIDTH = 960;
export const SPACE_HEIGHT = 540;
export const SPACE_INITIAL_PLAYER_POWER = 1.64;
export const SPACE_ROUND_POWER_DECAY = 0.97;
export const SPACE_THIRD_ROUND_BOOST = 1.08;
export const SPACE_MIN_PLAYER_POWER = 0.5;
export const SPACE_MAX_PLAYER_POWER = 1.64;
export const SPACE_FULL_LIFE_UNITS = 2;
export const SPACE_NORMAL_LIFE_CAP_UNITS = 6;
export const SPACE_WAVE_REWARD_TARGETS = { fast: 30, medium: 90, extended: 135 } as const;
export type SpacePhase = "ready" | "countdown" | "playing" | "paused" | "levelComplete" | "gameOver" | "error";
export type SpaceInput = { left: boolean; right: boolean; fire: boolean };
export type SpaceEnemyKind = "scout" | "striker" | "raider" | "armored" | "boss";
export type SpaceEnemy = { id: string; row: number; column: number; x: number; y: number; width: number; height: number; alive: boolean; pointValue: number; kind: SpaceEnemyKind; hitPoints: number; maxHitPoints: number };
export type SpaceShot = { id: string; x: number; y: number; previousY: number; velocityX?: number; velocityY: number; enemy: boolean; active: boolean };
export type SpacePowerUpKind = "multiShot" | "rapidFire" | "energyShield" | "extraLife" | "heart" | "spreadShot" | "damageBoost" | "scoreMultiplier" | "freeze" | "invincibility" | "magnet" | "piercing" | "drone";
export type SpacePowerUp = { id: string; kind: SpacePowerUpKind; x: number; y: number; active: boolean };
export type ShieldCell = { id: string; x: number; y: number; size: number; alive: boolean };
export type SpaceExplosion = { x: number; y: number; age: number };
export type SpaceWaveRewardTier = "fast" | "medium" | "extended";
export type SpaceWaveClearClass = "FAST CLEAR" | "QUALIFIED CLEAR" | "MISSED LIFE TARGET";
export type SpaceLifeReward = "full" | "half" | "none";
export type SpaceWaveSummary = { clearTime: number; targetSeconds: number; tier: SpaceWaveRewardTier; classification: SpaceWaveClearClass; reward: SpaceLifeReward };
export type SpaceStateCarry = { lifeUnits?: number; speedLifeBonuses?: number; heartPickups?: number; bestWaveClearTime?: number | null; highestLifeUnits?: number; waveSummary?: SpaceWaveSummary | null; carryPowerUps?: SpacePowerUp[] };
export type SpaceState = {
  phase: SpacePhase;
  playerX: number;
  playerY: number;
  playerInvulnerable: number;
  playerPower: number;
  enemyDamagePower: number;
  enemies: SpaceEnemy[];
  formationDirection: -1 | 1;
  formationSpeed: number;
  shots: SpaceShot[];
  shieldCells: ShieldCell[];
  explosions: SpaceExplosion[];
  powerUps: SpacePowerUp[];
  activePowerUps: { multiShot: number; rapidFire: number; energyShield: number; spreadShot: number; damageBoost: number; scoreMultiplier: number; freeze: number; invincibility: number; magnet: number; piercing: number; drone: number };
  score: number;
  lives: number;
  lifeUnits: number;
  wave: number;
  enemiesDestroyed: number;
  shotsFired: number;
  shotsHit: number;
  elapsed: number;
  waveElapsed: number;
  waveRewardTier: SpaceWaveRewardTier;
  waveRewardTarget: number;
  waveSummary: SpaceWaveSummary | null;
  waveSummarySeconds: number;
  speedLifeBonuses: number;
  heartPickups: number;
  bestWaveClearTime: number | null;
  highestLifeUnits: number;
  fireCooldown: number;
  enemyFireCooldown: number;
  phaseTimer: number;
  nextId: number;
  lastScoreEvent: string;
  lastActionEvent: string;
};

export function createSpaceFormation(wave: number) {
  return Array.from({ length: 40 }, (_, index): SpaceEnemy => {
    const row = Math.floor(index / 8);
    const column = index % 8;
    const boss = wave % 5 === 0 && index === 0;
    const kind: SpaceEnemyKind = boss ? "boss" : wave >= 4 && row === 0 ? "armored" : row === 0 ? "raider" : row < 3 ? "striker" : "scout";
    const hitPoints = boss ? 6 : kind === "armored" ? 2 + Math.floor(wave / 8) : 1;
    return {
      id: `wave-${wave}-enemy-${index}`,
      row,
      column,
      x: 180 + column * 86,
      y: 80 + row * 54,
      width: boss ? 82 : kind === "armored" ? 60 : 52,
      height: boss ? 56 : kind === "armored" ? 46 : 40,
      alive: true,
      pointValue: boss ? 250 : kind === "armored" ? 60 : row === 0 ? 30 : row < 3 ? 20 : 10,
      kind,
      hitPoints,
      maxHitPoints: hitPoints
    };
  });
}

export function createShieldCells() {
  const cells: ShieldCell[] = [];
  [250, 480, 710].forEach((centerX, shieldIndex) => {
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 10; column += 1) {
        if (row === 3 && column >= 3 && column <= 6) continue;
        cells.push({ id: `shield-${shieldIndex}-${row}-${column}`, x: centerX - 45 + column * 10, y: 410 + row * 9, size: 10, alive: true });
      }
    }
  });
  return cells;
}

export function waveRewardTierForFormation(enemies: SpaceEnemy[]): SpaceWaveRewardTier {
  if (enemies.some((enemy) => enemy.kind === "boss")) return "extended";
  if (enemies.some((enemy) => enemy.kind === "armored" || enemy.maxHitPoints >= 3)) return "medium";
  return "fast";
}

export function waveRewardTargetForFormation(enemies: SpaceEnemy[]) {
  return SPACE_WAVE_REWARD_TARGETS[waveRewardTierForFormation(enemies)];
}

function syncLifeProjection(state: Pick<SpaceState, "lifeUnits" | "lives" | "highestLifeUnits">) {
  state.lifeUnits = Math.max(0, Math.floor(state.lifeUnits));
  state.lives = Math.floor(state.lifeUnits / SPACE_FULL_LIFE_UNITS);
  state.highestLifeUnits = Math.max(state.highestLifeUnits, state.lifeUnits);
}

export function effectiveLives(state: Pick<SpaceState, "lifeUnits">) {
  return state.lifeUnits / SPACE_FULL_LIFE_UNITS;
}

export function formatLifeUnits(lifeUnits: number) {
  const normalized = Math.max(0, Math.floor(lifeUnits));
  return `${Math.floor(normalized / SPACE_FULL_LIFE_UNITS)}${normalized % SPACE_FULL_LIFE_UNITS ? "½" : ""}`;
}

export function awardSpaceLife(state: SpaceState): Exclude<SpaceLifeReward, "none"> {
  const reward: Exclude<SpaceLifeReward, "none"> = state.lifeUnits >= SPACE_NORMAL_LIFE_CAP_UNITS ? "half" : "full";
  state.lifeUnits += reward === "full" ? SPACE_FULL_LIFE_UNITS : 1;
  syncLifeProjection(state);
  return reward;
}

export function removeSpaceLives(state: SpaceState, fullLives: number) {
  state.lifeUnits = Math.max(0, state.lifeUnits - Math.max(1, Math.floor(fullLives)) * SPACE_FULL_LIFE_UNITS);
  syncLifeProjection(state);
  return state.lifeUnits;
}

export function createSpaceState(wave = 1, score = 0, lives = 3, elapsed = 0, carry: SpaceStateCarry = {}): SpaceState {
  const completedRounds = Math.max(0, wave - 1);
  const playerPower = Math.min(SPACE_MAX_PLAYER_POWER, Math.max(SPACE_MIN_PLAYER_POWER, SPACE_INITIAL_PLAYER_POWER * Math.pow(SPACE_ROUND_POWER_DECAY, completedRounds) * (completedRounds > 0 && completedRounds % 3 === 0 ? SPACE_THIRD_ROUND_BOOST : 1)));
  const enemyDamagePower = Math.pow(1.1, Math.floor(completedRounds / 2));
  const enemies = createSpaceFormation(wave);
  const waveRewardTier = waveRewardTierForFormation(enemies);
  const lifeUnits = Number.isFinite(carry.lifeUnits) ? Math.max(0, Math.floor(carry.lifeUnits as number)) : Math.max(0, Math.floor(lives * SPACE_FULL_LIFE_UNITS));
  return {
    phase: "countdown",
    playerX: SPACE_WIDTH / 2,
    playerY: 492,
    playerInvulnerable: 0,
    playerPower,
    enemyDamagePower,
    enemies,
    formationDirection: 1,
    formationSpeed: 34 + wave * 6,
    shots: [],
    shieldCells: createShieldCells(),
    explosions: [],
    powerUps: (carry.carryPowerUps || []).filter((powerUp) => powerUp.kind === "heart" && powerUp.active).map((powerUp) => ({ ...powerUp, x: Math.max(38, Math.min(SPACE_WIDTH - 38, powerUp.x)), y: Math.min(powerUp.y, SPACE_HEIGHT - 100) })),
    activePowerUps: { multiShot: 0, rapidFire: 0, energyShield: 0, spreadShot: 0, damageBoost: 0, scoreMultiplier: 0, freeze: 0, invincibility: 0, magnet: 0, piercing: 0, drone: 0 },
    score,
    lives: Math.floor(lifeUnits / SPACE_FULL_LIFE_UNITS),
    lifeUnits,
    wave,
    enemiesDestroyed: 0,
    shotsFired: 0,
    shotsHit: 0,
    elapsed,
    waveElapsed: 0,
    waveRewardTier,
    waveRewardTarget: SPACE_WAVE_REWARD_TARGETS[waveRewardTier],
    waveSummary: carry.waveSummary || null,
    waveSummarySeconds: carry.waveSummary ? 0.9 : 0,
    speedLifeBonuses: Math.max(0, Math.floor(carry.speedLifeBonuses || 0)),
    heartPickups: Math.max(0, Math.floor(carry.heartPickups || 0)),
    bestWaveClearTime: carry.bestWaveClearTime ?? null,
    highestLifeUnits: Math.max(lifeUnits, Math.floor(carry.highestLifeUnits || 0)),
    fireCooldown: 0,
    enemyFireCooldown: 0.8,
    phaseTimer: 1,
    nextId: 1,
    lastScoreEvent: "",
    lastActionEvent: ""
  };
}

function completeSpaceWave(state: SpaceState) {
  const clearTime = state.waveElapsed;
  const targetSeconds = state.waveRewardTarget;
  const qualified = clearTime < targetSeconds;
  const classification: SpaceWaveClearClass = qualified ? clearTime < targetSeconds * 0.5 ? "FAST CLEAR" : "QUALIFIED CLEAR" : "MISSED LIFE TARGET";
  const reward: SpaceLifeReward = qualified ? awardSpaceLife(state) : "none";
  if (reward !== "none") {
    state.speedLifeBonuses += 1;
    state.lastActionEvent = `speed-life-${reward}:${state.nextId++}`;
  }
  state.bestWaveClearTime = state.bestWaveClearTime === null ? clearTime : Math.min(state.bestWaveClearTime, clearTime);
  state.waveSummary = { clearTime, targetSeconds, tier: state.waveRewardTier, classification, reward };
  state.waveSummarySeconds = 1;
}

function addInvaderScore(state: SpaceState, enemy: SpaceEnemy, random: () => number, tuning: GameTuningSettings) {
  if (!enemy.alive) return false;
  enemy.hitPoints -= Math.max(1, Math.floor(state.playerPower * (state.activePowerUps.damageBoost > 0 ? 2 : 1)));
  if (enemy.hitPoints > 0) return true;
  enemy.alive = false;
  state.score += enemy.pointValue * (state.activePowerUps.scoreMultiplier > 0 ? 2 : 1);
  state.enemiesDestroyed += 1;
  state.shotsHit += 1;
  state.lastScoreEvent = `${enemy.id}:${enemy.pointValue}`;
  state.explosions.push({ x: enemy.x, y: enemy.y, age: 0 });
  if (random() < tuning.powerUpDropChance) {
    const roll = random();
    const kinds: SpacePowerUpKind[] = ["multiShot", "rapidFire", "energyShield", "spreadShot", "damageBoost", "scoreMultiplier", "freeze", "invincibility", "magnet", "piercing", "drone"];
    const kind: SpacePowerUpKind = random() > 0.92 ? "heart" : kinds[Math.min(kinds.length - 1, Math.floor(roll * kinds.length))];
    state.powerUps.push({ id: `power-${state.nextId++}`, kind, x: Math.max(38, Math.min(SPACE_WIDTH - 38, enemy.x)), y: Math.max(40, enemy.y), active: true });
  }
  return true;
}

export function spawnPlayerShot(state: SpaceState) {
  const rapid = state.activePowerUps.rapidFire > 0;
  const multi = state.activePowerUps.multiShot > 0 || state.activePowerUps.spreadShot > 0;
  const activePlayerShots = state.shots.filter((shot) => shot.active && !shot.enemy).length;
  const limit = multi ? 12 : rapid ? 8 : 1;
  if (state.phase !== "playing" || state.fireCooldown > 0 || activePlayerShots >= limit) return false;
  const offsets = state.activePowerUps.spreadShot > 0 ? [-28, -14, 0, 14, 28] : multi ? [-16, 0, 16] : [0];
  offsets.forEach((offset) => state.shots.push({ id: `shot-${state.nextId++}`, x: state.playerX + offset, y: state.playerY - 30, previousY: state.playerY - 30, velocityX: offset * 2.2, velocityY: -720, enemy: false, active: true }));
  state.fireCooldown = rapid ? 0.065 : 0.18;
  state.shotsFired += 1;
  return true;
}

function bottomShooters(enemies: SpaceEnemy[]) {
  const columns = new Map<number, SpaceEnemy>();
  enemies.forEach((enemy) => {
    if (!enemy.alive) return;
    const current = columns.get(enemy.column);
    if (!current || enemy.row > current.row) columns.set(enemy.column, enemy);
  });
  return [...columns.values()];
}

function damageShield(state: SpaceState, shot: SpaceShot) {
  const hit = state.shieldCells.find((cell) => cell.alive && rectanglesOverlap(
    { x: shot.x - 3, y: Math.min(shot.previousY, shot.y) - 8, width: 6, height: Math.abs(shot.y - shot.previousY) + 16 },
    { x: cell.x, y: cell.y, width: cell.size, height: cell.size }
  ));
  if (!hit) return false;
  hit.alive = false;
  shot.active = false;
  const impactX = hit.x + hit.size / 2;
  const impactY = hit.y + hit.size / 2;
  state.shieldCells.forEach((cell) => {
    if (cell.alive && Math.hypot(cell.x + cell.size / 2 - impactX, cell.y + cell.size / 2 - impactY) < 13) cell.alive = false;
  });
  return true;
}

export function updateSpace(state: SpaceState, input: SpaceInput, step: number, random = Math.random, tuning: GameTuningSettings = DEFAULT_GAME_TUNING) {
  if (state.phase === "paused" || state.phase === "gameOver" || state.phase === "error") return;
  if (state.phase !== "playing") {
    state.phaseTimer -= step;
    if (state.phaseTimer > 0) return;
    if (state.phase === "levelComplete") {
      const next = createSpaceState(state.wave + 1, state.score + 250, state.lives, state.elapsed, {
        lifeUnits: state.lifeUnits,
        speedLifeBonuses: state.speedLifeBonuses,
        heartPickups: state.heartPickups,
        bestWaveClearTime: state.bestWaveClearTime,
        highestLifeUnits: state.highestLifeUnits,
        waveSummary: state.waveSummary,
        carryPowerUps: state.powerUps
      });
      Object.assign(state, next);
      return;
    }
    state.phase = "playing";
  }

  state.waveSummarySeconds = Math.max(0, state.waveSummarySeconds - step);
  state.elapsed += step;
  state.waveElapsed += step;
  state.fireCooldown = Math.max(0, state.fireCooldown - step);
  state.enemyFireCooldown = Math.max(0, state.enemyFireCooldown - step);
  state.playerInvulnerable = Math.max(0, state.playerInvulnerable - step);
  Object.keys(state.activePowerUps).forEach((key) => { const power = key as keyof typeof state.activePowerUps; state.activePowerUps[power] = Math.max(0, state.activePowerUps[power] - step); });
  state.explosions.forEach((explosion) => { explosion.age += step; });
  state.explosions = state.explosions.filter((explosion) => explosion.age < 0.5);

  const move = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  state.playerX = Math.max(38, Math.min(SPACE_WIDTH - 38, state.playerX + move * 360 * PLAYER_MOVEMENT_MULTIPLIER * step));
  if (input.fire) spawnPlayerShot(state);

  const aliveCount = state.enemies.reduce((count, enemy) => count + Number(enemy.alive), 0);
  const speedMultiplier = 1 + (40 - aliveCount) / 24;
  let boundaryHit = false;
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    const nextX = enemy.x + state.formationDirection * state.formationSpeed * speedMultiplier * tuning.enemyDifficulty * (state.activePowerUps.freeze > 0 ? 0.45 : 1) * step;
    if (nextX - enemy.width / 2 < 18 || nextX + enemy.width / 2 > SPACE_WIDTH - 18) boundaryHit = true;
  }
  if (boundaryHit) {
    state.formationDirection = state.formationDirection === 1 ? -1 : 1;
    state.enemies.forEach((enemy) => { if (enemy.alive) enemy.y += 18; });
  } else {
    state.enemies.forEach((enemy) => { if (enemy.alive) enemy.x += state.formationDirection * state.formationSpeed * speedMultiplier * tuning.enemyDifficulty * step; });
  }

  if (state.enemyFireCooldown <= 0) {
    const shooters = bottomShooters(state.enemies);
    if (shooters.length) {
      const targeted = [...shooters].sort((a, b) => Math.abs(a.x - state.playerX) - Math.abs(b.x - state.playerX));
      const shooter = random() < 0.55 ? targeted[0] : shooters[Math.floor(random() * shooters.length)];
      state.shots.push({ id: `enemy-shot-${state.nextId++}`, x: shooter.x, y: shooter.y + 24, previousY: shooter.y + 24, velocityY: 270, enemy: true, active: true });
    }
    state.enemyFireCooldown = Math.max(0.55, 1.15 / tuning.enemyDifficulty);
  }

  state.powerUps.forEach((powerUp) => {
    if (!powerUp.active) return;
    powerUp.y += 95 * step;
    const pickupRange = state.activePowerUps.magnet > 0 ? 105 : 38;
    if (Math.abs(powerUp.x - state.playerX) < pickupRange && Math.abs(powerUp.y - state.playerY) < pickupRange) {
      powerUp.active = false;
      let actionEvent: string = powerUp.kind;
      if (powerUp.kind === "heart" || powerUp.kind === "extraLife") {
        const reward = awardSpaceLife(state);
        if (powerUp.kind === "heart") state.heartPickups += 1;
        if (powerUp.kind === "heart") state.explosions.push({ x: powerUp.x, y: powerUp.y, age: 0 });
        actionEvent = `${powerUp.kind}-${reward}`;
      }
      else if (powerUp.kind === "multiShot") state.activePowerUps.multiShot = tuning.multiShotSeconds;
      else if (powerUp.kind === "rapidFire") state.activePowerUps.rapidFire = tuning.rapidFireSeconds;
      else if (powerUp.kind === "energyShield") state.activePowerUps.energyShield = tuning.shieldSeconds;
      else state.activePowerUps[powerUp.kind] = powerUp.kind === "drone" ? 18 : 8;
      state.lastActionEvent = `${actionEvent}:${state.nextId++}`;
    }
    if (powerUp.y > SPACE_HEIGHT + 30) powerUp.active = false;
  });
  state.powerUps = state.powerUps.filter((powerUp) => powerUp.active);

  state.shots.forEach((shot) => {
    if (!shot.active) return;
    shot.previousY = shot.y;
    shot.x += (shot.velocityX || 0) * step;
    shot.y += shot.velocityY * step;
    if (shot.enemy && damageShield(state, shot)) return;
    if (shot.enemy) {
      if ((state.activePowerUps.energyShield > 0 || state.activePowerUps.invincibility > 0) && sweptVerticalProjectileHit(shot.x, shot.previousY, shot.y, 3, { x: state.playerX - 42, y: state.playerY - 30, width: 84, height: 60 })) {
        shot.active = false;
        state.lastActionEvent = `shield-block:${state.nextId++}`;
        return;
      }
      if (state.playerInvulnerable <= 0 && sweptVerticalProjectileHit(shot.x, shot.previousY, shot.y, 3, { x: state.playerX - 30, y: state.playerY - 20, width: 60, height: 40 })) {
        shot.active = false;
        removeSpaceLives(state, Math.max(1, Math.ceil(state.enemyDamagePower)));
        state.lastActionEvent = `player-hit:${state.nextId++}`;
        state.playerInvulnerable = 1.2;
        state.playerX = SPACE_WIDTH / 2;
        if (state.lives <= 0) state.phase = "gameOver";
      }
      return;
    }
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      if (sweptVerticalProjectileHit(shot.x, shot.previousY, shot.y, 3, { x: enemy.x - enemy.width / 2 + 4, y: enemy.y - enemy.height / 2 + 4, width: enemy.width - 8, height: enemy.height - 8 })) {
        shot.active = false;
        addInvaderScore(state, enemy, random, tuning);
        break;
      }
    }
  });
  state.shots = state.shots.filter((shot) => shot.active && shot.y > -40 && shot.y < SPACE_HEIGHT + 40);

  if (state.enemies.some((enemy) => enemy.alive && enemy.y + enemy.height / 2 >= 466)) state.phase = "gameOver";
  if (!state.enemies.some((enemy) => enemy.alive) && state.phase === "playing") {
    completeSpaceWave(state);
    state.phase = "levelComplete";
    state.phaseTimer = 1;
    state.shots = [];
  }
}

export function spaceAccuracy(state: SpaceState) {
  return state.shotsFired ? Math.round((state.shotsHit / state.shotsFired) * 100) : 0;
}
