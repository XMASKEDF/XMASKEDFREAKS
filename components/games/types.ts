export type GamePhase = "loading" | "ready" | "countdown" | "running" | "paused" | "level-complete" | "restarting" | "game-over" | "error";

export type GameResultMetadata = Record<string, string | number | boolean>;

export type GameRuntimeProps = {
  paused: boolean;
  muted: boolean;
  restartSignal: number;
  onReady: () => void;
  onScoreChange: (score: number) => void;
  onLevelChange: (level: number) => void;
  onRunEnd: (score: number, sessionSeconds: number, metadata?: GameResultMetadata) => void;
  onPhaseChange: (phase: GamePhase) => void;
  onPauseToggle: () => void;
  personalBest: number;
  globalBest: number;
  leaderboardScores: number[];
};
