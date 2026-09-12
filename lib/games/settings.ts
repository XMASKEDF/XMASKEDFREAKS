export type GameTuningSettings = {
  gamesEnabled: boolean;
  gameVolume: number;
  powerUpDropChance: number;
  multiShotSeconds: number;
  rapidFireSeconds: number;
  shieldSeconds: number;
  fruitSpawnChancePerSecond: number;
  fruitVisibleSeconds: number;
  powerPelletSeconds: number;
  enemyDifficulty: number;
  maskedUpCameraScale: number;
};

export const GAME_SETTINGS_KEY = "xmf-game-tuning";
export const GAME_SETTINGS_EVENT = "xmf:game-settings";

export const DEFAULT_GAME_TUNING: GameTuningSettings = {
  gamesEnabled: true,
  gameVolume: 0.18,
  powerUpDropChance: 0.12,
  multiShotSeconds: 10,
  rapidFireSeconds: 10,
  shieldSeconds: 8,
  fruitSpawnChancePerSecond: 0.035,
  fruitVisibleSeconds: 9,
  powerPelletSeconds: 7,
  enemyDifficulty: 1,
  maskedUpCameraScale: 2.25
};

function finite(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function normalizeGameTuning(value: Partial<GameTuningSettings> = {}): GameTuningSettings {
  return {
    gamesEnabled: value.gamesEnabled !== false,
    gameVolume: finite(value.gameVolume, DEFAULT_GAME_TUNING.gameVolume, 0, 0.25),
    powerUpDropChance: finite(value.powerUpDropChance, DEFAULT_GAME_TUNING.powerUpDropChance, 0, 1),
    multiShotSeconds: finite(value.multiShotSeconds, DEFAULT_GAME_TUNING.multiShotSeconds, 1, 30),
    rapidFireSeconds: finite(value.rapidFireSeconds, DEFAULT_GAME_TUNING.rapidFireSeconds, 1, 30),
    shieldSeconds: finite(value.shieldSeconds, DEFAULT_GAME_TUNING.shieldSeconds, 1, 30),
    fruitSpawnChancePerSecond: finite(value.fruitSpawnChancePerSecond, DEFAULT_GAME_TUNING.fruitSpawnChancePerSecond, 0, 0.5),
    fruitVisibleSeconds: finite(value.fruitVisibleSeconds, DEFAULT_GAME_TUNING.fruitVisibleSeconds, 2, 30),
    powerPelletSeconds: finite(value.powerPelletSeconds, DEFAULT_GAME_TUNING.powerPelletSeconds, 2, 15),
    enemyDifficulty: finite(value.enemyDifficulty, DEFAULT_GAME_TUNING.enemyDifficulty, 0.6, 2),
    maskedUpCameraScale: finite(value.maskedUpCameraScale, DEFAULT_GAME_TUNING.maskedUpCameraScale, 1, 3)
  };
}

export function readGameTuning() {
  if (typeof window === "undefined") return DEFAULT_GAME_TUNING;
  try {
    return normalizeGameTuning(JSON.parse(localStorage.getItem(GAME_SETTINGS_KEY) || "{}"));
  } catch {
    return DEFAULT_GAME_TUNING;
  }
}

export function saveGameTuning(settings: GameTuningSettings) {
  const normalized = normalizeGameTuning(settings);
  localStorage.setItem(GAME_SETTINGS_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(GAME_SETTINGS_EVENT, { detail: normalized }));
  return normalized;
}
