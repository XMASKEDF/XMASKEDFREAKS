export type Vector = {
  x: number;
  y: number;
};

export type SnakePaletteId =
  | "xmf-green"
  | "violet-pulse"
  | "crimson-heat"
  | "electric-blue"
  | "gold-rush"
  | "arctic-white"
  | "sunset-gradient";

export type SnakePalette = {
  id: SnakePaletteId;
  label: string;
  primary: string;
  secondary: string;
  glow: string;
};

export type SnakeEntity = {
  id: string;
  name: string;
  palette: SnakePalette;
  head: Vector;
  previousHead: Vector;
  direction: number;
  desiredDirection: number;
  speed: number;
  normalSpeed: number;
  boostSpeed: number;
  turnRate: number;
  mass: number;
  targetLength: number;
  trail: Vector[];
  alive: boolean;
  isPlayer: boolean;
  spawnProtectedUntil: number;
  scoreValue: number;
  bonusScore: number;
  kills: number;
  boosting: boolean;
  boostEmissionAccumulator: number;
  deathProcessed: boolean;
  aiState: "seekFood" | "wander" | "avoidBoundary" | "avoidCollision" | "boostEscape" | "intercept";
};

export type FoodPellet = {
  id: string;
  position: Vector;
  value: number;
  scoreValue: number;
  radius: number;
  color: string;
  source: "ambient" | "boosted-tail" | "defeated-snake" | "rare-bonus";
  alive: boolean;
  spawnTime: number;
};

export type GamePhase = "idle" | "countdown" | "running" | "paused" | "level-complete" | "game-over" | "error";

export type SlitherInputState = {
  pointer: Vector | null;
  keyboardTurn: -1 | 0 | 1;
  boost: boolean;
};

export type SlitherSettings = {
  sound: boolean;
  reducedGlow: boolean;
  cameraZoom: number;
  mobileSensitivity: number;
};

export type SlitherScoreEntry = {
  name: string;
  score: number;
};

export type SlitherGameState = {
  phase: GamePhase;
  elapsedSeconds: number;
  startedAt: number;
  endedAt: number | null;
  player: SnakeEntity;
  bots: SnakeEntity[];
  food: FoodPellet[];
  score: number;
  level: number;
  arenaSize: Vector;
  message: string;
  lastFrameAt: number;
  peakMass: number;
};

export type SlitherSnapshot = {
  phase: GamePhase;
  elapsedSeconds: number;
  score: number;
  level: number;
  mass: number;
  playerName: string;
  playerAlive: boolean;
  longestSnake: string;
  rank: number;
  foodCount: number;
  botCount: number;
  message: string;
  length: number;
  peakLength: number;
  kills: number;
};

export type SlitherControls = {
  startGame: (name: string, paletteId: SnakePaletteId, settings: SlitherSettings) => void;
  pauseGame: () => void;
  resumeGame: () => void;
  restartGame: () => void;
  endGame: (message?: string) => void;
};
