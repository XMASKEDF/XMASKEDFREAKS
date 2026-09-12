export type StoredGameScore = {
  gameId: string;
  gameTitle: string;
  displayName: string;
  score: number;
  sessionSeconds: number;
  sessionId?: string;
  metadata?: Record<string, string | number | boolean>;
  createdAt: string;
};

const SCORE_KEY = "xmf-game-scores";
const SOUND_KEY = "xmf-game-muted";

export function readGameScores(): StoredGameScore[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(SCORE_KEY) || "[]") as StoredGameScore[];
    return Array.isArray(value) ? value.filter((entry) => Number.isFinite(entry.score)) : [];
  } catch {
    return [];
  }
}

export function saveGameScore(entry: StoredGameScore) {
  const scores = [...readGameScores(), entry].slice(-100);
  localStorage.setItem(SCORE_KEY, JSON.stringify(scores));
  window.dispatchEvent(new CustomEvent("xmf-game-score-recorded"));
  return scores;
}

export function personalBestFor(gameId: string) {
  return readGameScores().filter((entry) => entry.gameId === gameId).reduce((best, entry) => Math.max(best, entry.score), 0);
}

export function getGameMuted() {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(SOUND_KEY) !== "false";
}

export function setGameMutedPreference(muted: boolean) {
  localStorage.setItem(SOUND_KEY, String(muted));
}

export function clearLocalGameScores() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SCORE_KEY);
  localStorage.removeItem("xmf-slither-local-scores");
}
