import { circlesOverlap } from "./mechanics.ts";
import { DEFAULT_GAME_TUNING, type GameTuningSettings } from "./settings.ts";

export const PAC_TILE = 36;
export const PAC_COLS = 19;
export const PAC_ROWS = 15;
export const PAC_WIDTH = PAC_COLS * PAC_TILE;
export const PAC_HEIGHT = PAC_ROWS * PAC_TILE;

export const PAC_MAZE = [
  "###################",
  "#........#........#",
  "#.###.##.#.##.###.#",
  "#o###.##.#.##.###o#",
  "#.................#",
  "#.###.#.#####.#.###",
  "#.....#...#...#...#",
  "#####.### # ###.###",
  " ......... ....... ",
  "#.###.#.#####.#.###",
  "#o..#.#...#...#..o#",
  "###.#.###.#.###.#.#",
  "#........#........#",
  "#.######.#.######.#",
  "###################"
] as const;

export type PacDirectionName = "left" | "right" | "up" | "down" | "none";
export type PacPhase = "ready" | "countdown" | "playing" | "paused" | "dying" | "levelComplete" | "gameOver" | "error";
export type GhostMode = "PEN" | "EXITING" | "SCATTER" | "CHASE" | "FRIGHTENED" | "EATEN" | "RESPAWNING";
export type GhostPersonality = "direct" | "ambusher" | "flanker" | "shy";
export type PacFruitKind = "cherry" | "strawberry" | "orange" | "apple" | "melon";
export type PacFruit = { kind: PacFruitKind; x: number; y: number; points: number; remaining: number };
export type PacScorePopup = { id: string; x: number; y: number; points: number; remaining: number };

export type PacMover = { x: number; y: number; direction: PacDirectionName };
export type PacGhost = PacMover & {
  id: string;
  color: string;
  mode: GhostMode;
  personality: GhostPersonality;
  homeColumn: number;
  homeRow: number;
  scatterColumn: number;
  scatterRow: number;
  releaseTimer: number;
  respawnTimer: number;
  capturedThisPower: boolean;
  pendingReverse: boolean;
  lastDecisionCell: string;
  targetColumn: number;
  targetRow: number;
  validDirections: PacDirectionName[];
  path: string[];
  penDirection: -1 | 1;
  modeBeforeFrightened: "SCATTER" | "CHASE";
};

export type PacMaskState = {
  phase: PacPhase;
  player: PacMover & { requested: PacDirectionName };
  ghosts: PacGhost[];
  pellets: Set<string>;
  powerPellets: Set<string>;
  score: number;
  lives: number;
  level: number;
  pelletsEaten: number;
  ghostsEaten: number;
  ghostChain: number;
  frightenedRemaining: number;
  frightenedWarningPlayed: boolean;
  globalMode: "SCATTER" | "CHASE";
  globalModeIndex: number;
  globalModeRemaining: number;
  scheduleInitialized: boolean;
  collisionLockRemaining: number;
  fruit: PacFruit | null;
  fruitCooldown: number;
  scorePopups: PacScorePopup[];
  notification: string;
  notificationRemaining: number;
  phaseTimer: number;
  elapsed: number;
  tick: number;
  lastScoreEvent: string;
  lastAudioEvent: string;
};

type PacCell = { column: number; row: number };
type DifficultyProfile = {
  normalSpeed: number;
  frightenedRatio: number;
  eatenRatio: number;
  frightenedSeconds: number;
  releaseScale: number;
  schedule: ReadonlyArray<{ mode: "SCATTER" | "CHASE"; seconds: number }>;
};

const DIRECTIONS = ["left", "right", "up", "down"] as const;
const VECTORS: Record<PacDirectionName, { x: number; y: number }> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  none: { x: 0, y: 0 }
};
const OPPOSITE: Record<PacDirectionName, PacDirectionName> = {
  left: "right", right: "left", up: "down", down: "up", none: "none"
};
const PLAYER_SPAWN = { column: 1, row: 1 };
const GHOST_HOME = { column: 9, row: 8 };
const GHOST_EXIT = { column: 9, row: 6 };
const PLAYER_SPEED = 126 * 1.32;
const GHOST_COLLISION_LOCK_SECONDS = 1.1;
const FRIGHTENED_WARNING_SECONDS = 2;

const DIFFICULTIES: Record<"easy" | "normal" | "hard", DifficultyProfile> = {
  easy: {
    normalSpeed: 76,
    frightenedRatio: 0.68,
    eatenRatio: 1.42,
    frightenedSeconds: 8,
    releaseScale: 1.2,
    schedule: [
      { mode: "SCATTER", seconds: 9 },
      { mode: "CHASE", seconds: 18 },
      { mode: "SCATTER", seconds: 8 },
      { mode: "CHASE", seconds: 22 },
      { mode: "SCATTER", seconds: 6 },
      { mode: "CHASE", seconds: Number.POSITIVE_INFINITY }
    ]
  },
  normal: {
    normalSpeed: 84,
    frightenedRatio: 0.7,
    eatenRatio: 1.45,
    frightenedSeconds: 6,
    releaseScale: 1,
    schedule: [
      { mode: "SCATTER", seconds: 7 },
      { mode: "CHASE", seconds: 20 },
      { mode: "SCATTER", seconds: 7 },
      { mode: "CHASE", seconds: 20 },
      { mode: "SCATTER", seconds: 5 },
      { mode: "CHASE", seconds: Number.POSITIVE_INFINITY }
    ]
  },
  hard: {
    normalSpeed: 92,
    frightenedRatio: 0.72,
    eatenRatio: 1.48,
    frightenedSeconds: 4,
    releaseScale: 0.78,
    schedule: [
      { mode: "SCATTER", seconds: 5 },
      { mode: "CHASE", seconds: 23 },
      { mode: "SCATTER", seconds: 5 },
      { mode: "CHASE", seconds: 26 },
      { mode: "SCATTER", seconds: 3 },
      { mode: "CHASE", seconds: Number.POSITIVE_INFINITY }
    ]
  }
};

export function pacCellKey(column: number, row: number) {
  return `${column}:${row}`;
}

export function pacCellAt(x: number, y: number) {
  const wrappedX = ((x % PAC_WIDTH) + PAC_WIDTH) % PAC_WIDTH;
  return { column: Math.floor(wrappedX / PAC_TILE), row: Math.floor(y / PAC_TILE) };
}

export function pacCellCenter(column: number, row: number) {
  return { x: (column + 0.5) * PAC_TILE, y: (row + 0.5) * PAC_TILE };
}

export function pacWalkable(column: number, row: number) {
  if (row === 8 && (column < 0 || column >= PAC_COLS)) return true;
  return row >= 0 && row < PAC_ROWS && column >= 0 && column < PAC_COLS && PAC_MAZE[row]?.[column] !== "#";
}

function adjacentCell(cell: PacCell, direction: PacDirectionName): PacCell | null {
  if (direction === "none") return null;
  const vector = VECTORS[direction];
  let column = cell.column + vector.x;
  const row = cell.row + vector.y;
  if (row === 8 && column < 0) column = PAC_COLS - 1;
  if (row === 8 && column >= PAC_COLS) column = 0;
  return pacWalkable(column, row) ? { column, row } : null;
}

const WALKABLE_CELLS: PacCell[] = [];
const PAC_GRAPH = new Map<string, Array<{ direction: PacDirectionName; cell: PacCell }>>();
for (let row = 0; row < PAC_ROWS; row += 1) {
  for (let column = 0; column < PAC_COLS; column += 1) {
    if (!pacWalkable(column, row)) continue;
    const cell = { column, row };
    WALKABLE_CELLS.push(cell);
    PAC_GRAPH.set(
      pacCellKey(column, row),
      DIRECTIONS.flatMap((direction) => {
        const neighbor = adjacentCell(cell, direction);
        return neighbor ? [{ direction, cell: neighbor }] : [];
      })
    );
  }
}

const distanceCache = new Map<string, Map<string, number>>();

function nearestWalkable(target: PacCell) {
  let best = WALKABLE_CELLS[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const cell of WALKABLE_CELLS) {
    const distance = Math.abs(cell.column - target.column) + Math.abs(cell.row - target.row);
    if (distance < bestDistance) {
      best = cell;
      bestDistance = distance;
    }
  }
  return best;
}

function distancesTo(target: PacCell) {
  const normalized = nearestWalkable(target);
  const targetKey = pacCellKey(normalized.column, normalized.row);
  const cached = distanceCache.get(targetKey);
  if (cached) return cached;
  const distances = new Map<string, number>([[targetKey, 0]]);
  const queue: PacCell[] = [normalized];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const cell = queue[cursor];
    const distance = distances.get(pacCellKey(cell.column, cell.row)) ?? 0;
    for (const neighbor of PAC_GRAPH.get(pacCellKey(cell.column, cell.row)) ?? []) {
      const key = pacCellKey(neighbor.cell.column, neighbor.cell.row);
      if (distances.has(key)) continue;
      distances.set(key, distance + 1);
      queue.push(neighbor.cell);
    }
  }
  if (distanceCache.size >= 96) distanceCache.clear();
  distanceCache.set(targetKey, distances);
  return distances;
}

function shortestPath(start: PacCell, target: PacCell) {
  const normalizedTarget = nearestWalkable(target);
  const targetKey = pacCellKey(normalizedTarget.column, normalizedTarget.row);
  const startKey = pacCellKey(start.column, start.row);
  if (startKey === targetKey) return [startKey];
  const queue: PacCell[] = [start];
  const previous = new Map<string, string | null>([[startKey, null]]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const cell = queue[cursor];
    for (const neighbor of PAC_GRAPH.get(pacCellKey(cell.column, cell.row)) ?? []) {
      const key = pacCellKey(neighbor.cell.column, neighbor.cell.row);
      if (previous.has(key)) continue;
      previous.set(key, pacCellKey(cell.column, cell.row));
      if (key === targetKey) {
        const path = [key];
        let current = previous.get(key);
        while (current) {
          path.unshift(current);
          current = previous.get(current) ?? null;
        }
        return path;
      }
      queue.push(neighbor.cell);
    }
  }
  return [startKey];
}

function seedPellets() {
  const pellets = new Set<string>();
  const powerPellets = new Set<string>();
  PAC_MAZE.forEach((line, row) => [...line].forEach((cell, column) => {
    if (cell === ".") pellets.add(pacCellKey(column, row));
    if (cell === "o") powerPellets.add(pacCellKey(column, row));
  }));
  return { pellets, powerPellets };
}

function profileFor(tuning: GameTuningSettings) {
  if (tuning.enemyDifficulty < 0.9) return DIFFICULTIES.easy;
  if (tuning.enemyDifficulty > 1.15) return DIFFICULTIES.hard;
  return DIFFICULTIES.normal;
}

function createGhost(
  id: string,
  color: string,
  personality: GhostPersonality,
  offset: number,
  releaseTimer: number,
  scatter: PacCell
): PacGhost {
  const center = pacCellCenter(GHOST_HOME.column + offset, GHOST_HOME.row);
  return {
    id,
    color,
    personality,
    x: center.x,
    y: center.y,
    direction: "up",
    mode: releaseTimer > 0 ? "PEN" : "EXITING",
    homeColumn: GHOST_HOME.column,
    homeRow: GHOST_HOME.row,
    scatterColumn: scatter.column,
    scatterRow: scatter.row,
    releaseTimer,
    respawnTimer: 0,
    capturedThisPower: false,
    pendingReverse: false,
    lastDecisionCell: "",
    targetColumn: GHOST_EXIT.column,
    targetRow: GHOST_EXIT.row,
    validDirections: [],
    path: [],
    penDirection: offset < 0 ? -1 : 1,
    modeBeforeFrightened: "SCATTER"
  };
}

export function createPacMaskState(level = 1, score = 0, lives = 3, elapsed = 0): PacMaskState {
  const seeded = seedPellets();
  const spawn = pacCellCenter(PLAYER_SPAWN.column, PLAYER_SPAWN.row);
  return {
    phase: "countdown",
    player: { ...spawn, direction: "right", requested: "right" },
    ghosts: [
      createGhost("ember", "#ff4f70", "direct", 0, 0, { column: 17, row: 1 }),
      createGhost("aqua", "#52c7ff", "ambusher", -1, 1.6, { column: 1, row: 1 }),
      createGhost("amber", "#ffad4f", "flanker", 1, 3.2, { column: 17, row: 13 }),
      createGhost("violet", "#b05cff", "shy", 0, 4.8, { column: 1, row: 13 })
    ],
    ...seeded,
    score,
    lives,
    level,
    pelletsEaten: 0,
    ghostsEaten: 0,
    ghostChain: 0,
    frightenedRemaining: 0,
    frightenedWarningPlayed: false,
    globalMode: "SCATTER",
    globalModeIndex: 0,
    globalModeRemaining: DIFFICULTIES.normal.schedule[0].seconds,
    scheduleInitialized: false,
    collisionLockRemaining: 0,
    fruit: null,
    fruitCooldown: 5,
    scorePopups: [],
    notification: "",
    notificationRemaining: 0,
    phaseTimer: 1.1,
    elapsed,
    tick: 0,
    lastScoreEvent: "",
    lastAudioEvent: ""
  };
}

export function requestPacDirection(state: PacMaskState, direction: PacDirectionName) {
  if (direction !== "none") state.player.requested = direction;
}

function nextCellOpen(mover: PacMover, direction: PacDirectionName) {
  const cell = pacCellAt(mover.x, mover.y);
  return adjacentCell(cell, direction) !== null;
}

function nearTileCenter(mover: PacMover, tolerance: number) {
  const cell = pacCellAt(mover.x, mover.y);
  const center = pacCellCenter(cell.column, cell.row);
  return Math.abs(mover.x - center.x) <= tolerance && Math.abs(mover.y - center.y) <= tolerance;
}

function approachingTileCenter(mover: PacMover) {
  const cell = pacCellAt(mover.x, mover.y);
  const center = pacCellCenter(cell.column, cell.row);
  if (mover.direction === "left") return mover.x >= center.x;
  if (mover.direction === "right") return mover.x <= center.x;
  if (mover.direction === "up") return mover.y >= center.y;
  if (mover.direction === "down") return mover.y <= center.y;
  return true;
}

function snapToTileCenter(mover: PacMover) {
  const cell = pacCellAt(mover.x, mover.y);
  const center = pacCellCenter(cell.column, cell.row);
  mover.x = center.x;
  mover.y = center.y;
  return cell;
}

function movePlayerInMaze(mover: PacMover, speed: number, step: number, requested?: PacDirectionName) {
  let remaining = Math.max(0, speed * step);
  const epsilon = 1e-7;

  while (remaining > epsilon && mover.direction !== "none") {
    const cell = pacCellAt(mover.x, mover.y);
    const currentCenter = pacCellCenter(cell.column, cell.row);
    const centered = Math.abs(mover.x - currentCenter.x) <= epsilon && Math.abs(mover.y - currentCenter.y) <= epsilon;
    if (centered) {
      mover.x = currentCenter.x;
      mover.y = currentCenter.y;
      if (requested && nextCellOpen(mover, requested)) mover.direction = requested;
    }

    const nextCell = adjacentCell(cell, mover.direction);
    if (!nextCell) {
      mover.direction = "none";
      break;
    }

    const target = pacCellCenter(nextCell.column, nextCell.row);
    if (cell.row === 8) {
      while (target.x - mover.x > PAC_WIDTH / 2) target.x -= PAC_WIDTH;
      while (target.x - mover.x < -PAC_WIDTH / 2) target.x += PAC_WIDTH;
    }
    const distance = Math.hypot(target.x - mover.x, target.y - mover.y);
    if (distance <= epsilon) {
      mover.x = target.x;
      mover.y = target.y;
      continue;
    }
    if (remaining < distance) {
      const vector = VECTORS[mover.direction];
      mover.x += vector.x * remaining;
      mover.y += vector.y * remaining;
      remaining = 0;
      break;
    }

    mover.x = target.x;
    mover.y = target.y;
    remaining -= distance;
    if (mover.y >= 8 * PAC_TILE && mover.y < 9 * PAC_TILE) {
      if (mover.x < -PAC_TILE * 0.45) mover.x = PAC_WIDTH + PAC_TILE * 0.35;
      if (mover.x > PAC_WIDTH + PAC_TILE * 0.45) mover.x = -PAC_TILE * 0.35;
    }
  }
}

function moveInMaze(mover: PacMover, speed: number, step: number) {
  const vector = VECTORS[mover.direction];
  mover.x += vector.x * speed * step;
  mover.y += vector.y * speed * step;
  if (mover.y >= 8 * PAC_TILE && mover.y < 9 * PAC_TILE) {
    if (mover.x < -PAC_TILE * 0.45) mover.x = PAC_WIDTH + PAC_TILE * 0.35;
    if (mover.x > PAC_WIDTH + PAC_TILE * 0.45) mover.x = -PAC_TILE * 0.35;
  }
}

function addPacScore(state: PacMaskState, points: number, source: string) {
  state.score += points;
  state.lastScoreEvent = `${source}:${points}:${state.tick}`;
}

function triggerAudio(state: PacMaskState, event: string) {
  state.lastAudioEvent = `${event}:${state.tick}`;
}

export function pacGhostTarget(ghost: PacGhost, state: PacMaskState): PacCell {
  if (ghost.mode === "EXITING") return GHOST_EXIT;
  if (ghost.mode === "EATEN" || ghost.mode === "RESPAWNING") return GHOST_HOME;
  if (ghost.mode === "SCATTER") return { column: ghost.scatterColumn, row: ghost.scatterRow };

  const player = pacCellAt(state.player.x, state.player.y);
  const vector = VECTORS[state.player.direction];
  if (ghost.personality === "direct") return player;
  if (ghost.personality === "ambusher") {
    return { column: player.column + vector.x * 4, row: player.row + vector.y * 4 };
  }
  if (ghost.personality === "flanker") {
    const lead = state.ghosts.find((item) => item.personality === "direct");
    const leadCell = lead ? pacCellAt(lead.x, lead.y) : player;
    const pivot = { column: player.column + vector.x * 2, row: player.row + vector.y * 2 };
    return { column: pivot.column * 2 - leadCell.column, row: pivot.row * 2 - leadCell.row };
  }
  const ghostCell = pacCellAt(ghost.x, ghost.y);
  const mazeDistance = distancesTo(player).get(pacCellKey(ghostCell.column, ghostCell.row)) ?? 0;
  return mazeDistance > 6 ? player : { column: ghost.scatterColumn, row: ghost.scatterRow };
}

export function pacValidDirections(ghost: PacGhost, allowReverse = false) {
  const cell = pacCellAt(ghost.x, ghost.y);
  const all = (PAC_GRAPH.get(pacCellKey(cell.column, cell.row)) ?? []).map((item) => item.direction);
  if (allowReverse || ghost.direction === "none") return all;
  const withoutReverse = all.filter((direction) => direction !== OPPOSITE[ghost.direction]);
  return withoutReverse.length ? withoutReverse : all;
}

function directionScore(cell: PacCell, direction: PacDirectionName, distances: Map<string, number>) {
  const next = adjacentCell(cell, direction);
  return next ? distances.get(pacCellKey(next.column, next.row)) ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
}

export function choosePacGhostDirection(ghost: PacGhost, state: PacMaskState) {
  const cell = pacCellAt(ghost.x, ghost.y);
  const allowReverse = ghost.pendingReverse || ghost.mode === "EATEN" || ghost.mode === "EXITING";
  const legal = pacValidDirections(ghost, allowReverse);
  ghost.validDirections = legal;
  if (!legal.length) return "none";

  if (ghost.pendingReverse) {
    ghost.pendingReverse = false;
    const reverse = OPPOSITE[ghost.direction];
    if (legal.includes(reverse)) return reverse;
  }

  const target = pacGhostTarget(ghost, state);
  const normalizedTarget = nearestWalkable(target);
  ghost.targetColumn = normalizedTarget.column;
  ghost.targetRow = normalizedTarget.row;
  ghost.path = shortestPath(cell, normalizedTarget).slice(0, 12);

  if (ghost.mode === "FRIGHTENED") {
    const away = distancesTo(pacCellAt(state.player.x, state.player.y));
    return [...legal].sort((a, b) => {
      const distanceA = directionScore(cell, a, away);
      const distanceB = directionScore(cell, b, away);
      if (distanceA !== distanceB) return distanceB - distanceA;
      return DIRECTIONS.indexOf(a as (typeof DIRECTIONS)[number]) - DIRECTIONS.indexOf(b as (typeof DIRECTIONS)[number]);
    })[0];
  }

  const distances = distancesTo(normalizedTarget);
  return [...legal].sort((a, b) => {
    const distanceA = directionScore(cell, a, distances);
    const distanceB = directionScore(cell, b, distances);
    if (distanceA !== distanceB) return distanceA - distanceB;
    return DIRECTIONS.indexOf(a as (typeof DIRECTIONS)[number]) - DIRECTIONS.indexOf(b as (typeof DIRECTIONS)[number]);
  })[0];
}

function updatePenGhost(state: PacMaskState, ghost: PacGhost, step: number, profile: DifficultyProfile) {
  if (ghost.mode === "RESPAWNING") {
    ghost.respawnTimer -= step;
    if (ghost.respawnTimer <= 0) {
      ghost.mode = "EXITING";
      ghost.direction = "none";
      ghost.lastDecisionCell = "";
      triggerAudio(state, `ghost-respawn:${ghost.id}`);
    }
    return;
  }
  ghost.releaseTimer -= step;
  const center = pacCellCenter(ghost.homeColumn, ghost.homeRow);
  ghost.y += ghost.penDirection * profile.normalSpeed * 0.58 * step;
  if (ghost.y < center.y - 6 || ghost.y > center.y + 6) {
    ghost.penDirection = ghost.penDirection === 1 ? -1 : 1;
    ghost.y = Math.max(center.y - 6, Math.min(center.y + 6, ghost.y));
  }
  if (ghost.releaseTimer <= 0) {
    ghost.mode = "EXITING";
    ghost.y = pacCellCenter(pacCellAt(ghost.x, ghost.y).column, GHOST_HOME.row).y;
    ghost.direction = "none";
    ghost.lastDecisionCell = "";
  }
}

export function updatePacGhost(state: PacMaskState, ghost: PacGhost, step: number, tuning: GameTuningSettings = DEFAULT_GAME_TUNING) {
  const profile = profileFor(tuning);
  if (ghost.mode === "PEN" || ghost.mode === "RESPAWNING") {
    updatePenGhost(state, ghost, step, profile);
    return;
  }

  const tolerance = Math.max(1.1, profile.normalSpeed * tuning.enemyDifficulty * step + 0.35);
  if (nearTileCenter(ghost, tolerance) && approachingTileCenter(ghost)) {
    const cell = snapToTileCenter(ghost);
    const decisionKey = pacCellKey(cell.column, cell.row);
    if (decisionKey !== ghost.lastDecisionCell) {
      ghost.lastDecisionCell = decisionKey;
      if (ghost.mode === "EXITING" && decisionKey === pacCellKey(GHOST_EXIT.column, GHOST_EXIT.row)) {
        ghost.mode = state.frightenedRemaining > 0 ? "FRIGHTENED" : state.globalMode;
        ghost.modeBeforeFrightened = state.globalMode;
      }
      if (ghost.mode === "EATEN" && decisionKey === pacCellKey(GHOST_HOME.column, GHOST_HOME.row)) {
        ghost.mode = "RESPAWNING";
        ghost.respawnTimer = 0.85;
        ghost.direction = "none";
        ghost.x = pacCellCenter(GHOST_HOME.column, GHOST_HOME.row).x;
        ghost.y = pacCellCenter(GHOST_HOME.column, GHOST_HOME.row).y;
        triggerAudio(state, `ghost-returned:${ghost.id}`);
        return;
      }
      ghost.direction = choosePacGhostDirection(ghost, state);
    }
  } else {
    ghost.lastDecisionCell = "";
  }

  const levelScale = 1 + Math.min(0.22, Math.max(0, state.level - 1) * 0.025);
  let speed = profile.normalSpeed * levelScale * tuning.enemyDifficulty;
  if (ghost.mode === "FRIGHTENED") speed *= profile.frightenedRatio;
  if (ghost.mode === "EATEN") speed *= profile.eatenRatio;
  if (ghost.mode === "EXITING") speed *= 0.9;
  moveInMaze(ghost, speed, step);
}

function beginFrightenedMode(state: PacMaskState, tuning: GameTuningSettings) {
  const profile = profileFor(tuning);
  const configuredDuration = tuning.powerPelletSeconds === DEFAULT_GAME_TUNING.powerPelletSeconds
    ? profile.frightenedSeconds
    : tuning.powerPelletSeconds;
  state.frightenedRemaining = Math.max(2, configuredDuration - Math.max(0, state.level - 1) * 0.25);
  state.frightenedWarningPlayed = false;
  state.ghostChain = 0;
  state.ghosts.forEach((ghost) => {
    ghost.capturedThisPower = false;
    if (ghost.mode === "CHASE" || ghost.mode === "SCATTER" || ghost.mode === "FRIGHTENED") {
      if (ghost.mode !== "FRIGHTENED") ghost.modeBeforeFrightened = ghost.mode;
      ghost.mode = "FRIGHTENED";
      const reverse = OPPOSITE[ghost.direction];
      if (nextCellOpen(ghost, reverse)) {
        ghost.direction = reverse;
        ghost.pendingReverse = false;
      } else {
        ghost.pendingReverse = true;
      }
      ghost.lastDecisionCell = "";
    }
  });
  triggerAudio(state, "power-start");
}

function consumePellet(state: PacMaskState, tuning: GameTuningSettings) {
  const cell = pacCellAt(state.player.x, state.player.y);
  const center = pacCellCenter(cell.column, cell.row);
  if (!circlesOverlap(state.player.x, state.player.y, 12, center.x, center.y, 3)) return;
  const key = pacCellKey(cell.column, cell.row);
  if (state.pellets.delete(key)) {
    state.pelletsEaten += 1;
    addPacScore(state, 10, `pellet:${key}`);
  } else if (state.powerPellets.delete(key)) {
    state.pelletsEaten += 1;
    beginFrightenedMode(state, tuning);
    addPacScore(state, 50, `power:${key}`);
  }
}

function updateGlobalMode(state: PacMaskState, step: number, tuning: GameTuningSettings) {
  if (state.frightenedRemaining > 0) return;
  const schedule = profileFor(tuning).schedule;
  if (!state.scheduleInitialized) {
    state.scheduleInitialized = true;
    state.globalModeRemaining = schedule[0].seconds;
  }
  state.globalModeRemaining -= step;
  if (state.globalModeRemaining > 0) return;
  state.globalModeIndex = Math.min(state.globalModeIndex + 1, schedule.length - 1);
  const next = schedule[state.globalModeIndex];
  if (next.mode !== state.globalMode) {
    state.globalMode = next.mode;
    state.ghosts.forEach((ghost) => {
      if (ghost.mode === "CHASE" || ghost.mode === "SCATTER") {
        ghost.mode = next.mode;
        ghost.pendingReverse = true;
        ghost.lastDecisionCell = "";
      }
    });
  }
  state.globalModeRemaining = next.seconds;
}

function updateFrightenedMode(state: PacMaskState, step: number) {
  if (state.frightenedRemaining <= 0) return;
  const previous = state.frightenedRemaining;
  state.frightenedRemaining = Math.max(0, state.frightenedRemaining - step);
  if (!state.frightenedWarningPlayed && previous > FRIGHTENED_WARNING_SECONDS && state.frightenedRemaining <= FRIGHTENED_WARNING_SECONDS) {
    state.frightenedWarningPlayed = true;
    triggerAudio(state, "power-warning");
  }
  if (state.frightenedRemaining > 0) return;
  state.ghostChain = 0;
  state.ghosts.forEach((ghost) => {
    if (ghost.mode === "FRIGHTENED") {
      ghost.mode = state.globalMode;
      ghost.modeBeforeFrightened = state.globalMode;
      ghost.lastDecisionCell = "";
    }
  });
  triggerAudio(state, "power-end");
}

export function resolvePacGhostCollisions(state: PacMaskState) {
  if (state.phase !== "playing" || state.collisionLockRemaining > 0) return;
  const collisions = state.ghosts.filter((ghost) => circlesOverlap(state.player.x, state.player.y, 11, ghost.x, ghost.y, 12));
  const frightened = collisions.filter((ghost) => ghost.mode === "FRIGHTENED" && !ghost.capturedThisPower);
  if (frightened.length) {
    for (const ghost of frightened) {
      ghost.capturedThisPower = true;
      ghost.mode = "EATEN";
      ghost.pendingReverse = true;
      ghost.lastDecisionCell = "";
      const points = [200, 400, 800, 1600][Math.min(3, state.ghostChain)];
      state.ghostChain += 1;
      state.ghostsEaten += 1;
      addPacScore(state, points, `ghost:${ghost.id}`);
      state.scorePopups.push({ id: `${ghost.id}:${state.tick}`, x: ghost.x, y: ghost.y, points, remaining: 1.15 });
      state.notification = `COMBO x${state.ghostChain} +${points}`;
      state.notificationRemaining = 1.4;
      triggerAudio(state, `ghost-eaten:${ghost.id}`);
    }
    return;
  }

  const lethal = collisions.some((ghost) => !["PEN", "EXITING", "EATEN", "RESPAWNING"].includes(ghost.mode));
  if (!lethal) return;
  state.collisionLockRemaining = GHOST_COLLISION_LOCK_SECONDS;
  state.lives -= 1;
  state.phase = "dying";
  state.phaseTimer = 0.85;
  triggerAudio(state, "player-death");
}

function resetAfterLife(state: PacMaskState) {
  const spawn = pacCellCenter(PLAYER_SPAWN.column, PLAYER_SPAWN.row);
  state.player = { ...spawn, direction: "right", requested: "right" };
  state.ghosts = createPacMaskState(state.level, state.score, state.lives, state.elapsed).ghosts;
  state.frightenedRemaining = 0;
  state.frightenedWarningPlayed = false;
  state.ghostChain = 0;
  state.globalMode = "SCATTER";
  state.globalModeIndex = 0;
  state.globalModeRemaining = DIFFICULTIES.normal.schedule[0].seconds;
  state.scheduleInitialized = false;
  state.collisionLockRemaining = GHOST_COLLISION_LOCK_SECONDS;
  state.phase = "countdown";
  state.phaseTimer = 1;
}

const FRUITS: Array<{ kind: PacFruitKind; points: number }> = [
  { kind: "cherry", points: 100 },
  { kind: "strawberry", points: 300 },
  { kind: "orange", points: 500 },
  { kind: "apple", points: 700 },
  { kind: "melon", points: 1000 }
];

export function updatePacMask(
  state: PacMaskState,
  step: number,
  tuning: GameTuningSettings = DEFAULT_GAME_TUNING,
  random = Math.random
) {
  state.tick += 1;
  if (state.phase === "paused" || state.phase === "gameOver" || state.phase === "error") return;
  if (state.phase !== "playing") {
    state.phaseTimer -= step;
    if (state.phaseTimer > 0) return;
    if (state.phase === "dying") {
      if (state.lives <= 0) state.phase = "gameOver";
      else resetAfterLife(state);
      return;
    }
    if (state.phase === "levelComplete") {
      const next = createPacMaskState(state.level + 1, state.score, state.lives, state.elapsed);
      Object.assign(state, next);
      return;
    }
    state.phase = "playing";
  }

  state.elapsed += step;
  state.collisionLockRemaining = Math.max(0, state.collisionLockRemaining - step);
  state.notificationRemaining = Math.max(0, state.notificationRemaining - step);
  if (state.notificationRemaining === 0) state.notification = "";
  state.scorePopups.forEach((popup) => { popup.remaining -= step; popup.y -= 18 * step; });
  state.scorePopups = state.scorePopups.filter((popup) => popup.remaining > 0);
  updateFrightenedMode(state, step);
  updateGlobalMode(state, step, tuning);

  state.fruitCooldown = Math.max(0, state.fruitCooldown - step);
  if (!state.fruit && state.fruitCooldown === 0 && random() < tuning.fruitSpawnChancePerSecond * step) {
    const choice = FRUITS[Math.min(FRUITS.length - 1, Math.floor(random() * FRUITS.length))];
    const center = pacCellCenter(9, 8);
    state.fruit = { ...choice, ...center, remaining: tuning.fruitVisibleSeconds };
    state.fruitCooldown = 12;
    state.notification = `${choice.kind.toUpperCase()} BONUS`;
    state.notificationRemaining = 1.5;
  }
  if (state.fruit) {
    state.fruit.remaining -= step;
    if (circlesOverlap(state.player.x, state.player.y, 12, state.fruit.x, state.fruit.y, 13)) {
      addPacScore(state, state.fruit.points, `fruit:${state.fruit.kind}`);
      state.notification = `${state.fruit.kind.toUpperCase()} +${state.fruit.points}`;
      state.notificationRemaining = 2;
      state.fruit = null;
      state.fruitCooldown = 10;
    } else if (state.fruit.remaining <= 0) {
      state.fruit = null;
      state.fruitCooldown = 8;
    }
  }

  movePlayerInMaze(state.player, PLAYER_SPEED, step, state.player.requested);
  consumePellet(state, tuning);
  state.ghosts.forEach((ghost) => updatePacGhost(state, ghost, step, tuning));
  resolvePacGhostCollisions(state);

  if (state.pellets.size + state.powerPellets.size === 0) {
    state.phase = "levelComplete";
    state.phaseTimer = 1.1;
  }
}

export function pacDebugSnapshot(state: PacMaskState) {
  return {
    phase: state.phase,
    score: state.score,
    lives: state.lives,
    level: state.level,
    pelletsRemaining: state.pellets.size + state.powerPellets.size,
    playerCell: pacCellAt(state.player.x, state.player.y),
    globalMode: state.globalMode,
    globalModeRemaining: state.globalModeRemaining,
    frightenedRemaining: state.frightenedRemaining,
    ghosts: state.ghosts.map((ghost) => ({
      id: ghost.id,
      personality: ghost.personality,
      mode: ghost.mode,
      cell: pacCellAt(ghost.x, ghost.y),
      target: { column: ghost.targetColumn, row: ghost.targetRow },
      direction: ghost.direction,
      validDirections: ghost.validDirections,
      path: ghost.path
    })),
    lastScoreEvent: state.lastScoreEvent,
    lastAudioEvent: state.lastAudioEvent
  };
}
