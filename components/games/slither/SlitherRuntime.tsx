"use client";

import SlitherGame from "./SlitherGame";
import type { GameRuntimeProps } from "../types";

export default function SlitherRuntime(props: GameRuntimeProps) {
  const displayName = typeof window === "undefined" ? "Player" : localStorage.getItem("xmf-display-name") || "Player";
  return (
    <SlitherGame
      displayName={displayName}
      personalBest={props.personalBest}
      publicBest={props.globalBest}
      leaderboardScores={props.leaderboardScores}
      muted={props.muted}
      paused={props.paused}
      restartSignal={props.restartSignal}
      onReady={props.onReady}
      onScoreChange={props.onScoreChange}
      onLevelChange={props.onLevelChange}
      onPhaseChange={(phase) => props.onPhaseChange(phase)}
      onScore={props.onRunEnd}
      onPauseToggle={props.onPauseToggle}
    />
  );
}
